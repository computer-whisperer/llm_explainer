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

Planned: The Document (chat-template unveiling + rewriting the model's words +
KV receipts), Context Rot (pre-cooked degraded sessions + live continuation +
entropy timeline), plus a terminal segment staged separately (coding harness,
CLAUDE.md A/B, Jacobian reaction).

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
