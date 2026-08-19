import { renderChips } from "../chips.js";

const PRESETS = [
  ["simple sentence", "The quick brown fox jumps over the lazy dog."],
  ["strawberry", "How many R's are in the word strawberry?"],
  ["arithmetic", "374 * 4498 = 1682252"],
  ["casing matters", "hello Hello HELLO hELLo"],
  ["rare words", "electroencephalography antidisestablishmentarianism Kleinhirnbrückenwinkel"],
  ["other languages", "Bonjour le monde. こんにちは世界。 مرحبا بالعالم"],
  ["code", 'for (let i = 0; i < n; i++) { sum += data[i].value; }'],
];

export function initTokenizerScene(client) {
  const input = document.getElementById("tok-input");
  const chips = document.getElementById("tok-chips");
  const charsEl = document.getElementById("tok-chars");
  const countEl = document.getElementById("tok-count");
  const ratioEl = document.getElementById("tok-ratio");
  const showIds = document.getElementById("tok-show-ids");
  const presets = document.getElementById("tok-presets");

  let lastTokens = [];
  let timer = null;
  let inflight = 0;

  async function retokenize() {
    const text = input.value;
    charsEl.textContent = [...text].length;
    if (!text) {
      lastTokens = [];
      chips.replaceChildren();
      countEl.textContent = "0";
      ratioEl.textContent = "–";
      return;
    }
    const seq = ++inflight;
    try {
      const tokens = await client.tokenize(text);
      if (seq !== inflight) return; // stale response
      lastTokens = tokens;
      countEl.textContent = tokens.length;
      ratioEl.textContent = tokens.length ? ([...text].length / tokens.length).toFixed(1) : "–";
      renderChips(chips, tokens, { showIds: showIds.checked });
    } catch (e) {
      console.error("tokenize failed:", e);
    }
  }

  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(retokenize, 180);
  });
  showIds.addEventListener("change", () =>
    renderChips(chips, lastTokens, { showIds: showIds.checked })
  );

  for (const [label, text] of PRESETS) {
    const b = document.createElement("button");
    b.className = "preset-btn";
    b.textContent = label;
    b.addEventListener("click", () => {
      input.value = text;
      retokenize();
    });
    presets.appendChild(b);
  }

  // start on the first preset so the projector never shows an empty scene
  input.value = PRESETS[0][1];
  retokenize();
}
