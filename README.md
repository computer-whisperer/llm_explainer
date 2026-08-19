# llm_explainer

Presentation prop for an "intro to AI" session: a webui over a llama.cpp server
(gemma-4-31B) that shows the real machinery — tokenization, the next-token loop
with live logit distributions, KV-cache reuse, context rewriting, and context
rot — as scenes a presenter flips through while talking.

## Run

```sh
./serve.sh          # serves on http://localhost:8080
```

No build step; plain ES modules. The browser calls the llama server directly
(`https://llama-gemma-4.cjbal.com`, configurable in the page footer, persisted
in localStorage). Server config: `/ceph/public/k8s/apps/llama_cpp/llama-gemma-4-31b.yaml`.

## Scenes

1. **Tokens** — live `/tokenize` with pieces; presets for the strawberry
   letter-counting failure, digit splitting, casing, rare words, other scripts.
2. **Next-token loop** — one `/completion` call per step (`n_predict: 1`,
   `n_probs: 40`, `cache_prompt: true`); probability bars (click to force an
   alternative token), per-step entropy stat + sparkline, KV-cache reuse note
   from `timings.cache_n` / `timings.prompt_n`.

3. **The Document** — a chat UI and the raw templated document side by side,
   same state. Streaming replies over `/completion` (slot 1; scene 2 owns
   slot 0). Bubbles are contenteditable (rewrite the model's words, then ask
   it why it said that); turns can be deleted; the last reply can be re-rolled.
   Tools (calculator · clock · canned weather, `js/tools.js`): declarations are
   spliced into the system turn (rendered once via `/apply-template` + slice);
   generation stops at `<tool_call|>`, the call is parsed and shown, the
   harness runs it (manually or auto), the result is pasted into the document
   in template format, and generation continues the same turn. The document is
   **append-only**: history stays byte-for-byte what was generated, never
   re-rendered through the template, so the doc view and KV numbers stay
   truthful. Staging: `?scene=document&preset=N&autorun=1&autoreply=1`.

4. **Context Rot** — A/B: the same question answered fresh vs after 4k/12k/24k
   tokens of unrelated filler (`assets/filler.txt`, deterministic fake
   engineering notes from `dev/gen_filler.py`). Streams both answers with
   whole-answer probability, per-token entropy, first-token distribution
   bars, and prompt-eval timings. A runs on slot 0, B on slot 2 (keeps the
   big prefix warm across runs — **prewarm B once before the talk**).
   Staging: `?scene=rot&rotpreset=N&dose=24k&autorun=1`.

   Calibration (2026-08-19, greedy): gemma-4-31B is robust to distractor
   context on easy questions (3×2 mult, riddles, date math: unchanged at 24k)
   — degradation concentrates at the capability edge. 4×3-digit
   multiplication: 1234*567 ✓p=.98 fresh → ✗700678 p=.93 at 12k+ (the
   headline: *confidently* wrong — first-token mass visibly flips 6→7);
   4276*158 ✓p=.97 → ✗p=.59; 2847*639 p=.69 → p=.08 (shattered; re-rolls
   vary with sampling on). Prompt shapes in `js/scenes/rot.js` must stay
   byte-identical to the calibration script or the numbers shift.

5. **Thinking** — A/B: thinking closed vs open on the scene-4 edge questions,
   with the thought channel streamed live in a violet panel and token/time
   cost per pane. A "show the actual difference" panel renders both prompts
   as chips: the entire feature is `<|think|>` in the system turn plus
   whether the harness pre-closes `<|channel>thought<channel|>`. "Plant a
   thought" prefills the channel: the hard question (2847*639) parrots a
   plausible planted answer; the easy one (1234*567) overrides it — the
   model only trusts notes it can't check. Planted runs use
   `cache_prompt:false`: greedy is not bit-stable across cache states on
   this server, and warm-cache batch numerics tip that knife-edge decision.
   Calibration: 2847*639 no-think ✗ → think ✓ (~460 tokens); marathon-feet
   no-think ✗ → think ✗ with the arithmetic slip visible in the trace;
   1234*567 correct both ways (~30x token cost with thinking). Under 24k
   noise + thinking (not in UI, measured once): the trace reached the right
   answer but the post-channel copy came out garbled ("6996") — optional
   narrated beat, costs a ~25s prompt eval and evicts the rot cache.
   Staging: `?scene=think&thinkpreset=N&autorun=1&planted=1&diff=1`.

## Terminal segment

`terminal/` holds the staged assets for the live-CLI half: `harness/` (tiny
project with a planted eviction bug + failing tests), `claudemd-ab/` (same
task, three CLAUDE.md personas), `jacobian/` (verification script + prompt
beats for the fresh-instance reaction). `terminal/RUNBOOK.md` has the
commands, env isolation (scratch-HOME approach — CLAUDE_CONFIG_DIR does NOT
isolate memory in v2.1.235, and --bare requires an API key), timings, and
fallbacks. Keep the repo root free of CLAUDE.md files: parent-dir memory
auto-discovery would leak into the A/B demo.

Planned: a one-page presenter runbook tying webui + terminal into the full
session arc.

## Dev notes

Headless verification: `--virtual-time-budget` works for the non-streaming
scenes but NOT for streaming (virtual time races ahead of real SSE chunks) —
use `dev/cdp_shot.py <url> <wait_seconds> <out.png>` instead, which drives
headless chromium over CDP in real time and prints the kv/stats/chat text
for grepping.

## Server facts (probed 2026-08-19)

- Native `/completion` returns OpenAI-style `completion_probabilities[].top_logprobs`
  (`{id, token, bytes, logprob}`); `n_probs: 50` works; probs are pre-sampling
  (raw softmax) unless `post_sampling_probs: true`.
- `/tokenize` supports `with_pieces` (byte tokens come as byte arrays);
  `<bos>` is auto-prepended to `/completion` prompts.
- `timings` includes `cache_n` (reused) and `prompt_n` (evaluated) — the KV story.
- CORS: origin reflected, POST allowed — direct browser access works.
- 3 slots, 32k ctx each, `--slots` enabled. Requests must pin `id_slot` or
  consecutive steps round-robin across slots and the cache numbers scramble.
- KV reuse is **checkpoint-granular**, not exact-prefix: gemma-4 uses sliding-window
  attention, so llama.cpp can only resume from `--ctx-checkpoints` positions
  (8 configured). Measured at 567-token context: append → 562 reused / 6 evaluated
  (595 ms → 203 ms); edit first word → 0 reused, full recompute; edit mid-document →
  resumed from the checkpoint *before* the edit (50 reused), and that rollback
  evicts the previously cached suffix. Directionally perfect for the demo; at
  very short contexts the numbers look chunky (e.g. 5 reused / 6 evaluated).
- **gemma-4 is a thinking model by default.** The chat template's system turn
  carries `<|think|>`; the model turn opens a thought channel delimited by
  `<|channel>thought` … `<channel|>`. Raw untemplated prompts drift OOD because
  the model keeps trying to open that channel (the `<channel|>` junk in top-k).
  Scene 2 therefore wraps the visible document in a hidden scaffold rendered by
  `/apply-template` with `chat_template_kwargs: {enable_thinking: false}` —
  user turn = a continue-this-text instruction, model turn prefilled with the
  document after a closed empty thought channel. Continuations then behave
  ("Once upon a time, in a kingdom by the sea," → " there" at 97%). The
  scaffold is revealable in the UI (`?scaffold=1` pre-opens it) and the
  instruction is editable — same document, different behavior. The thought
  channel becomes its own beat in the later thinking-traces scene.
- Repetition collapse is easy to induce: default sampling (no repeat penalty
  configured server-side) fell into an " own own own…" loop at 97.8% / 0.24 bits
  from a benign preset during a smoke test. Good news for the context-rot scene.

`?scene=<name>&autostep=N` pre-selects a scene and pre-runs N loop steps —
for staging a state before the talk and for headless screenshots.
