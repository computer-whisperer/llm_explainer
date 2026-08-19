import { streamCompletion, entropyBits } from "../api.js";
import { drawSpark } from "../spark.js";
import { pieceHtml } from "../chips.js";

// Prompt shapes must match dev/gen_filler.py calibration exactly (2026-08-19):
// 1234*567: ✓p=.98 fresh/4k → ✗700678 p=.93 at 12k/24k (confidently wrong)
// 4276*158: ✓p=.97 fresh → ✗675568 p=.59 at 24k
// 2847*639: ✗(one guess) p=.69 fresh → ✗ p=.08 at 24k (shattered)
const GEN = "<|turn>model\n<|channel>thought\n<channel|>";
const SYS = "You are a helpful, concise assistant. Answer briefly.";
const PRE = "Here are the complete engineering notes from last quarter, for background reference:";
const DOSES = { "4k": 17000, "12k": 51000, "24k": 102000 };
const SLOT_A = 0; // shares with scene 2 (tiny prompts, harmless)
const SLOT_B = 2; // dedicated: keeps the big filler prefix warm across runs

const PRESETS = [
  { label: "the confident flip", correct: "699678",
    q: "What is 1234 * 567? Answer with only the number." },
  { label: "flip and wobble", correct: "675608",
    q: "What is 4276 * 158? Answer with only the number." },
  { label: "the shatter", correct: "1819233",
    q: "What is 2847 * 639? Answer with only the number." },
  { label: "estimation drift", correct: "138435",
    q: "A marathon is 42.195 km. How many feet is that, to the nearest foot? Answer with only the number." },
];

export function initRotScene(client) {
  const qInput = document.getElementById("rot-question");
  const doseSeg = document.getElementById("rot-dose");
  const greedyChk = document.getElementById("rot-greedy");
  const runBtn = document.getElementById("rot-run");
  const presets = document.getElementById("rot-presets");
  const el = (id) => document.getElementById(id);
  const pane = (k) => ({
    meta: el(`rot-${k}-meta`),
    answer: el(`rot-${k}-answer`),
    p: el(`rot-${k}-p`),
    spark: el(`rot-${k}-spark`),
    bars: el(`rot-${k}-bars`),
    kv: el(`rot-${k}-kv`),
  });
  const A = pane("a");
  const B = pane("b");

  let dose = "24k";
  let correct = PRESETS[0].correct;
  let fillerP = null; // fetched once
  const doseCuts = {}; // dose -> {text, tokens}

  async function getFiller() {
    fillerP ??= fetch("assets/filler.txt").then((r) => {
      if (!r.ok) throw new Error(`filler fetch → HTTP ${r.status}`);
      return r.text();
    });
    return fillerP;
  }

  async function doseCut(d) {
    if (doseCuts[d]) return doseCuts[d];
    const filler = await getFiller();
    let text = filler.slice(0, DOSES[d]);
    const i = text.lastIndexOf("\n§");
    if (i > 0) text = text.slice(0, i);
    const tokens = (await client.tokenize(text)).length;
    doseCuts[d] = { text, tokens };
    return doseCuts[d];
  }

  function promptFor(q, cut) {
    let p = `<|turn>system\n${SYS}<turn|>\n`;
    if (cut) p += `<|turn>user\n${PRE}\n\n${cut.text}<turn|>\n${GEN}Noted.<turn|>\n`;
    return p + `<|turn>user\n${q}<turn|>\n${GEN}`;
  }

  function renderBars(P, first) {
    P.bars.replaceChildren();
    if (!first?.top_logprobs) return;
    const lbl = document.createElement("div");
    lbl.className = "panel-label";
    lbl.textContent = "first-token distribution";
    P.bars.appendChild(lbl);
    for (const t of first.top_logprobs.slice(0, 6)) {
      const prob = Math.exp(t.logprob);
      const row = document.createElement("div");
      row.className = "mini-bar-row";
      const tok = document.createElement("div");
      tok.className = "bar-token";
      tok.appendChild(pieceHtml(t.token, { inline: true }));
      const track = document.createElement("div");
      track.className = "bar-track";
      const fill = document.createElement("div");
      fill.className = "bar-fill";
      fill.style.width = (prob * 100).toFixed(2) + "%";
      if (t.id === first.id) fill.style.background = "#d95926";
      const pct = document.createElement("span");
      pct.className = "bar-pct";
      pct.textContent = (prob * 100).toFixed(1) + "%";
      track.appendChild(fill);
      track.appendChild(pct);
      row.appendChild(tok);
      row.appendChild(track);
      P.bars.appendChild(row);
    }
  }

  function verdict(P, content) {
    if (!correct) return;
    const got = content.replace(/[^\d]/g, "");
    const v = document.createElement("span");
    v.className = "rot-verdict " + (got === correct ? "ok" : "bad");
    v.textContent = got === correct ? "✓ correct" : `✗ wrong (correct: ${correct})`;
    P.answer.appendChild(v);
  }

  async function runPane(P, prompt, slot) {
    P.answer.innerHTML = '<span class="rot-idle">…</span>';
    P.p.textContent = "–";
    P.bars.replaceChildren();
    drawSpark(P.spark, []);
    const ents = [];
    let logp = 0;
    let first = null;
    let started = false;
    const t0 = performance.now();
    const waitTimer = setInterval(() => {
      if (!started)
        P.kv.innerHTML = `processing context… <b>${((performance.now() - t0) / 1000).toFixed(1)}s</b>`;
    }, 250);
    try {
      const res = await streamCompletion(client, prompt, {
        slot,
        nProbs: 8,
        greedy: greedyChk.checked,
        onToken: (tok, cp) => {
          if (!started) {
            started = true;
            P.answer.textContent = "";
          }
          P.answer.textContent += tok;
          if (cp) {
            if (!first) {
              first = cp;
              renderBars(P, cp);
            }
            logp += cp.logprob ?? 0;
            const tops = cp.top_logprobs?.map((x) => ({ prob: Math.exp(x.logprob) })) ?? [];
            ents.push(entropyBits(tops));
            drawSpark(P.spark, ents);
            P.p.textContent = (Math.exp(logp) * 100).toFixed(1) + "%";
          }
        },
      });
      verdict(P, res.content);
      const t = res.timings;
      if (t)
        P.kv.innerHTML =
          `<b>${t.cache_n ?? 0}</b> reused · <b>${t.prompt_n ?? 0}</b> processed · ` +
          `prompt ${(t.prompt_ms / 1000).toFixed(1)}s`;
      return res;
    } finally {
      clearInterval(waitTimer);
    }
  }

  async function run() {
    if (runBtn.disabled) return;
    runBtn.disabled = true;
    try {
      const q = qInput.value.trim();
      const cut = await doseCut(dose);
      A.meta.textContent = "~60 tokens";
      B.meta.textContent = `${cut.tokens.toLocaleString()} tokens of notes first`;
      await runPane(A, promptFor(q, null), SLOT_A);
      await runPane(B, promptFor(q, cut), SLOT_B);
    } catch (e) {
      console.error("rot run failed:", e);
      B.kv.innerHTML = `<b>failed:</b> ${e.message}`;
    } finally {
      runBtn.disabled = false;
    }
  }

  // ---- wiring ----

  runBtn.addEventListener("click", run);
  qInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") run();
  });
  qInput.addEventListener("input", () => (correct = null)); // custom question: no verdict
  doseSeg.addEventListener("click", (e) => {
    const btn = e.target.closest(".seg");
    if (!btn) return;
    dose = btn.dataset.dose;
    doseSeg.querySelectorAll(".seg").forEach((s) => s.classList.toggle("active", s === btn));
  });

  for (const p of PRESETS) {
    const b = document.createElement("button");
    b.className = "preset-btn";
    b.textContent = p.label;
    b.addEventListener("click", () => {
      qInput.value = p.q;
      correct = p.correct;
    });
    presets.appendChild(b);
  }
  qInput.value = PRESETS[0].q;

  // ?scene=rot&dose=12k&autorun=1 — staging / smoke tests
  const params = new URLSearchParams(location.search);
  if (params.get("dose") && DOSES[params.get("dose")]) {
    dose = params.get("dose");
    doseSeg.querySelectorAll(".seg").forEach((s) =>
      s.classList.toggle("active", s.dataset.dose === dose));
  }
  const pi = parseInt(params.get("rotpreset"), 10);
  if (!isNaN(pi) && PRESETS[pi]) {
    qInput.value = PRESETS[pi].q;
    correct = PRESETS[pi].correct;
  }
  if (params.get("autorun") === "1" && params.get("scene") === "rot") run();
}
