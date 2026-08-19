import { entropyBits } from "../api.js";
import { renderChips, pieceHtml } from "../chips.js";

// Document-shaped openings: the raw model continues prose instead of hitting
// an end-of-document horizon two tokens in (where template junk surfaces).
const PRESETS = [
  ["confident fact", "France is a country in Western Europe with a long history. The capital and largest city of France is"],
  ["made-up fact", "Pi is a mathematical constant with infinitely many digits. The 19th digit of pi is"],
  ["open-ended story", "Once upon a time, in a kingdom by the sea, there lived"],
  ["opinion", "After twenty years of writing software, I can say the best programming language for beginners is"],
];

const BARS_SHOWN = 12;

const DEFAULT_INSTRUCTION =
  "Continue the text exactly where it leaves off. Never comment on it or address the reader; just keep writing in the same style.";

function entropyQual(h) {
  if (h < 0.5) return "→ near-certain";
  if (h < 1.5) return "→ confident";
  if (h < 3.0) return "→ open choice";
  return "→ very uncertain";
}

export function initNextTokenScene(client) {
  const ctx = document.getElementById("nt-context");
  const stepBtn = document.getElementById("nt-step");
  const playBtn = document.getElementById("nt-play");
  const resetBtn = document.getElementById("nt-reset");
  const greedyChk = document.getElementById("nt-greedy");
  const barsEl = document.getElementById("nt-bars");
  const genEl = document.getElementById("nt-generated");
  const entEl = document.getElementById("nt-entropy");
  const entQualEl = document.getElementById("nt-entropy-qual");
  const sparkEl = document.getElementById("nt-spark");
  const kvEl = document.getElementById("nt-kv");
  const presets = document.getElementById("nt-presets");
  const tooltip = document.getElementById("tooltip");

  const ctxTokensToggle = document.getElementById("nt-show-ctx-tokens");
  const ctxChips = document.getElementById("nt-ctx-chips");
  const scaffoldToggle = document.getElementById("nt-show-scaffold");
  const scaffoldPanel = document.getElementById("nt-scaffold-panel");
  const scaffoldChips = document.getElementById("nt-scaffold-chips");
  const instrInput = document.getElementById("nt-instruction");

  let baseText = PRESETS[0][1];
  let generated = [];        // [{id, token}]
  let entropyHist = [];      // bits per step
  let lastStep = null;       // { top, lenBefore, chosenId }
  let playing = false;
  let busy = false;
  let scaffold = null;       // hidden prefix wrapping the visible document
  let scaffoldReady = loadScaffold();

  // The visible textarea is only part of the real context: chat models fall
  // apart without their turn structure, so a minimal template (with the
  // thought channel closed) wraps the document.
  async function loadScaffold() {
    const instruction = instrInput.value || DEFAULT_INSTRUCTION;
    try {
      scaffold = await client.applyTemplate([{ role: "user", content: instruction }]);
    } catch (e) {
      console.error("apply-template failed, using fallback scaffold:", e);
      scaffold =
        `<|turn>user\n${instruction}<turn|>\n<|turn>model\n<|channel>thought\n<channel|>`;
    }
    renderScaffoldChips();
  }

  async function renderScaffoldChips() {
    if (scaffoldPanel.hidden || !scaffold) return;
    try {
      const tokens = await client.tokenize(scaffold);
      renderChips(scaffoldChips, tokens, { markSpecial: true });
    } catch (e) {
      console.error("scaffold tokenize failed:", e);
    }
  }

  // ---- rendering ----

  let ctxChipsSeq = 0;
  async function renderCtxChips() {
    if (ctxChips.hidden) return;
    const seq = ++ctxChipsSeq;
    try {
      const tokens = ctx.value ? await client.tokenize(ctx.value) : [];
      if (seq !== ctxChipsSeq) return; // stale response
      renderChips(ctxChips, tokens);
    } catch (e) {
      console.error("context tokenize failed:", e);
    }
  }

  function renderGenerated(animateLast = false) {
    renderChips(
      genEl,
      generated.map((g) => ({ id: g.id, piece: g.token })),
      { animateFrom: animateLast ? generated.length - 1 : Infinity }
    );
  }

  function renderBars() {
    barsEl.replaceChildren();
    if (!lastStep) {
      const d = document.createElement("div");
      d.className = "bar-empty";
      d.innerHTML = "press <b>Step</b> to query the model";
      barsEl.appendChild(d);
      return;
    }
    const { top, chosenId } = lastStep;
    const shown = top.slice(0, BARS_SHOWN);
    let shownMass = 0;
    for (const t of shown) shownMass += t.prob;

    for (const t of shown) {
      const row = document.createElement("div");
      row.className = "bar-row" + (t.id === chosenId ? " sampled" : "");

      const tok = document.createElement("div");
      tok.className = "bar-token";
      tok.appendChild(pieceHtml(t.token, { inline: true }));

      const track = document.createElement("div");
      track.className = "bar-track";
      const fill = document.createElement("div");
      fill.className = "bar-fill";
      fill.style.width = (t.prob * 100).toFixed(2) + "%";
      const pct = document.createElement("span");
      pct.className = "bar-pct";
      pct.textContent = (t.prob * 100).toFixed(t.prob < 0.01 ? 2 : 1) + "%";
      track.appendChild(fill);
      track.appendChild(pct);
      if (t.id === chosenId) {
        const tag = document.createElement("span");
        tag.className = "bar-tag";
        tag.textContent = "● picked";
        track.appendChild(tag);
      }

      row.appendChild(tok);
      row.appendChild(track);
      row.addEventListener("click", () => forceToken(t));
      row.addEventListener("mousemove", (e) => {
        tooltip.hidden = false;
        tooltip.innerHTML =
          `token id <b>${t.id}</b><br>p = <b>${t.prob.toExponential(3)}</b>` +
          `<br>logprob = <b>${t.logprob.toFixed(3)}</b><br><i>click to use this token instead</i>`;
        tooltip.style.left = Math.min(e.clientX + 16, innerWidth - 360) + "px";
        tooltip.style.top = e.clientY + 16 + "px";
      });
      row.addEventListener("mouseleave", () => (tooltip.hidden = true));
      barsEl.appendChild(row);
    }

    const rest = document.createElement("div");
    rest.className = "bar-rest";
    rest.textContent =
      `everything else in the 262k vocabulary: ${((1 - shownMass) * 100).toFixed(1)}%`;
    barsEl.appendChild(rest);
  }

  function renderEntropy() {
    if (!entropyHist.length) {
      entEl.textContent = "–";
      entQualEl.textContent = "";
    } else {
      const h = entropyHist[entropyHist.length - 1];
      entEl.textContent = h.toFixed(2);
      entQualEl.textContent = entropyQual(h);
    }
    renderSpark();
  }

  function renderSpark() {
    const w = sparkEl.clientWidth || 300;
    const hgt = 72;
    sparkEl.setAttribute("viewBox", `0 0 ${w} ${hgt}`);
    sparkEl.replaceChildren();
    const ns = "http://www.w3.org/2000/svg";
    const yMax = Math.max(4, ...entropyHist) * 1.08;
    const pad = 6;
    const y = (v) => hgt - pad - (v / yMax) * (hgt - 2 * pad);
    const x = (i) =>
      entropyHist.length > 1 ? pad + (i / (entropyHist.length - 1)) * (w - 2 * pad) : w / 2;

    // hairline gridlines at whole bits
    for (let g = 0; g <= yMax; g += 1) {
      const line = document.createElementNS(ns, "line");
      line.setAttribute("x1", 0);
      line.setAttribute("x2", w);
      line.setAttribute("y1", y(g));
      line.setAttribute("y2", y(g));
      line.setAttribute("stroke", g === 0 ? "#383835" : "#2c2c2a");
      line.setAttribute("stroke-width", "1");
      sparkEl.appendChild(line);
    }
    if (!entropyHist.length) return;

    const pts = entropyHist.map((v, i) => `${x(i)},${y(v)}`).join(" ");
    const line = document.createElementNS(ns, "polyline");
    line.setAttribute("points", pts);
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", "#199e70");
    line.setAttribute("stroke-width", "2");
    line.setAttribute("stroke-linejoin", "round");
    line.setAttribute("stroke-linecap", "round");
    sparkEl.appendChild(line);

    const last = entropyHist.length - 1;
    const dot = document.createElementNS(ns, "circle");
    dot.setAttribute("cx", x(last));
    dot.setAttribute("cy", y(entropyHist[last]));
    dot.setAttribute("r", "4.5");
    dot.setAttribute("fill", "#199e70");
    dot.setAttribute("stroke", "#1a1a19");
    dot.setAttribute("stroke-width", "2");
    sparkEl.appendChild(dot);
  }

  function renderKv(timings) {
    if (!timings) return;
    const cached = timings.cache_n ?? 0;
    const evaluated = timings.prompt_n ?? 0;
    kvEl.innerHTML =
      `KV cache: <b>${cached}</b> tokens reused · <b>${evaluated}</b> newly processed` +
      (timings.prompt_ms ? ` · prompt ${timings.prompt_ms.toFixed(0)} ms` : "");
  }

  function setBusy(b) {
    busy = b;
    stepBtn.disabled = b;
  }

  // ---- actions ----

  async function step() {
    if (busy) return false;
    setBusy(true);
    try {
      await scaffoldReady;
      const lenBefore = ctx.value.length;
      const r = await client.nextToken(scaffold + ctx.value, { greedy: greedyChk.checked });
      if (r.stopType === "eos" || r.sampled.token === "") {
        kvEl.innerHTML = "model emitted <b>end-of-sequence</b> — the loop stops itself";
        return false;
      }
      lastStep = { top: r.top, lenBefore, chosenId: r.sampled.id };
      ctx.value += r.sampled.token;
      ctx.scrollTop = ctx.scrollHeight;
      generated.push({ id: r.sampled.id, token: r.sampled.token });
      entropyHist.push(entropyBits(r.top));
      renderBars();
      renderGenerated(true);
      renderEntropy();
      renderKv(r.timings);
      renderCtxChips();
      return true;
    } catch (e) {
      console.error("step failed:", e);
      kvEl.innerHTML = `<b>request failed:</b> ${e.message}`;
      return false;
    } finally {
      setBusy(false);
    }
  }

  // Rewrite the last picked token with an alternative from the same distribution.
  function forceToken(t) {
    if (!lastStep || busy) return;
    ctx.value = ctx.value.slice(0, lastStep.lenBefore) + t.token;
    lastStep.chosenId = t.id;
    generated[generated.length - 1] = { id: t.id, token: t.token };
    renderBars();
    renderGenerated(true);
    renderCtxChips();
  }

  async function playLoop() {
    while (playing) {
      const ok = await step();
      if (!ok) break;
      await new Promise((r) => setTimeout(r, 450));
    }
    playing = false;
    playBtn.textContent = "▶ Play";
  }

  function resetTo(text) {
    playing = false;
    playBtn.textContent = "▶ Play";
    ctx.value = text;
    generated = [];
    entropyHist = [];
    lastStep = null;
    renderBars();
    renderGenerated();
    renderEntropy();
    renderCtxChips();
    kvEl.textContent = "";
  }

  // ---- wiring ----

  stepBtn.addEventListener("click", step);
  playBtn.addEventListener("click", () => {
    if (playing) {
      playing = false;
      playBtn.textContent = "▶ Play";
    } else {
      playing = true;
      playBtn.textContent = "⏸ Pause";
      playLoop();
    }
  });
  resetBtn.addEventListener("click", () => resetTo(baseText));

  // A manual edit makes the old trail stale — the document is the only state.
  function invalidateTrail() {
    generated = [];
    entropyHist = [];
    lastStep = null;
    renderGenerated();
    renderEntropy();
    renderBars();
  }
  let ctxDebounce = null;
  ctx.addEventListener("input", () => {
    baseText = ctx.value;
    invalidateTrail();
    clearTimeout(ctxDebounce);
    ctxDebounce = setTimeout(renderCtxChips, 250);
  });
  ctxTokensToggle.addEventListener("change", () => {
    ctxChips.hidden = !ctxTokensToggle.checked;
    renderCtxChips();
  });

  scaffoldToggle.addEventListener("change", () => {
    scaffoldPanel.hidden = !scaffoldToggle.checked;
    renderScaffoldChips();
  });
  instrInput.value = DEFAULT_INSTRUCTION;
  instrInput.addEventListener("change", () => {
    scaffoldReady = loadScaffold();
    invalidateTrail();
  });

  for (const [label, text] of PRESETS) {
    const b = document.createElement("button");
    b.className = "preset-btn";
    b.textContent = label;
    b.addEventListener("click", () => {
      baseText = text;
      resetTo(text);
    });
    presets.appendChild(b);
  }

  resetTo(baseText);
  addEventListener("resize", renderSpark);

  // ?autostep=N — pre-run N steps on load (staging a state before the talk,
  // and headless smoke tests); ?scaffold=1 — start with scaffolding revealed
  if (new URLSearchParams(location.search).get("scaffold") === "1") {
    scaffoldToggle.checked = true;
    scaffoldPanel.hidden = false;
    scaffoldReady.then(renderScaffoldChips);
  }
  const auto = parseInt(new URLSearchParams(location.search).get("autostep"), 10);
  if (auto > 0) {
    (async () => {
      for (let i = 0; i < auto; i++) if (!(await step())) break;
    })();
  }
}
