// Shared token-chip rendering. Chips carry a cycling low-chroma wash purely to
// mark token boundaries (adjacency, not identity), with text in ink tokens.

const WS_MAP = { " ": "␣", "\t": "⇥" };
// C0/C1 controls, NBSP, zero-widths & bidi marks, line/para separators, BOM
const INVISIBLE = /[\u0000-\u001F\u007F-\u00A0\u200B-\u200F\u2028-\u202F\u2060\uFEFF]/;

// Render a piece with whitespace made visible (dim glyphs). inline: never emit
// real line breaks (bar labels); otherwise newlines keep their break (chips).
export function pieceHtml(piece, { inline = false } = {}) {
  const frag = document.createDocumentFragment();
  let run = "";
  const flush = () => {
    if (run) frag.appendChild(document.createTextNode(run));
    run = "";
  };
  const glyph = (g) => {
    flush();
    const s = document.createElement("span");
    s.className = "ws";
    s.textContent = g;
    frag.appendChild(s);
  };
  for (const ch of piece) {
    if (ch === "\n") glyph(inline ? "⏎" : "⏎\n");
    else if (WS_MAP[ch]) glyph(WS_MAP[ch]);
    else if (INVISIBLE.test(ch))
      glyph(`⟨U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}⟩`);
    else run += ch;
  }
  flush();
  if (!frag.childNodes.length) glyph("⟨empty⟩");
  return frag;
}

const SPECIAL_PIECE = /^<[|/]?[a-z_|]+[|/]?>$/i;

// tokens: [{id, piece}] — piece string or byte array.
// opts: { showIds, animateFrom, markSpecial } — chips at index >= animateFrom get
// an entry animation; markSpecial highlights template/control tokens.
export function renderChips(
  container,
  tokens,
  { showIds = false, animateFrom = Infinity, markSpecial = false } = {}
) {
  container.replaceChildren();
  tokens.forEach((t, i) => {
    const chip = document.createElement("span");
    const text = document.createElement("span");
    text.className = "chip-text";
    if (Array.isArray(t.piece)) {
      chip.className = "chip byte";
      text.textContent = t.piece.map((b) => "0x" + b.toString(16).padStart(2, "0")).join(" ");
    } else if (markSpecial && SPECIAL_PIECE.test(t.piece)) {
      chip.className = "chip special";
      text.textContent = t.piece;
    } else {
      chip.className = `chip c${i % 5}`;
      text.appendChild(pieceHtml(t.piece));
    }
    chip.appendChild(text);
    if (i >= animateFrom) chip.classList.add("new");
    if (showIds) {
      const idEl = document.createElement("span");
      idEl.className = "chip-id";
      idEl.textContent = t.id;
      chip.appendChild(idEl);
    }
    chip.title = `token ${t.id}`;
    container.appendChild(chip);
  });
}
