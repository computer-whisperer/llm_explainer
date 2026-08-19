# Terminal segment runbook

Three demos on the real tool (Claude Code CLI), in narrative order after the
webui scenes: **coding harness** (the loop is real) → **CLAUDE.md A/B** (the
document steers everything) → **Jacobian reaction** (cutoff, priors, and
belief revision — the closer).

## One-time prep on the demo host

```sh
git clone git@github.com:computer-whisperer/llm_explainer.git
cd llm_explainer/terminal
python3 -c "import sympy; print('sympy ok')"   # jacobian_check.py needs it
```

**Isolated demo environment** — a scratch HOME so no user memory, no
auto-memory, and no personal CLAUDE.md can leak into any demo (the Jacobian
bit in particular dies instantly if loaded context mentions the result):

```sh
export DEMO_HOME=$HOME/demo-home        # persistent scratch home for the talk
mkdir -p $DEMO_HOME
HOME=$DEMO_HOME claude                  # one-time OAuth login, then /exit
```

Facts behind this choice (verified against v2.1.235): CLAUDE_CONFIG_DIR only
relocates credentials, not memory or settings, so it does NOT isolate;
`--bare` skips all CLAUDE.md/memory discovery but never reads OAuth (needs
ANTHROPIC_API_KEY). The HOME swap isolates everything at once, keeps OAuth,
and collects all demo transcripts under `$DEMO_HOME/.claude/projects/` for
the transcript reveal. If you'd rather use an API key, `claude --bare` is the
surgical alternative for the Jacobian demo.

Alias for the rest of this file:

```sh
alias dclaude='HOME=$DEMO_HOME claude'
```

Rehearse each demo once the day before; model behavior varies run to run.

## Demo 1 — coding harness (~3 min)

```sh
cd terminal/harness
dclaude
```

Paste: **"The test suite is failing. Find the bug, fix it, and run the tests
to confirm."** (Bug: `push` evicts the newest sample instead of the oldest —
2 of 5 tests fail.) Narrate the loop: proposal → harness executes → result
becomes context → continue.

Then the reveal — the whole session is one JSONL document:

```sh
ls -t $DEMO_HOME/.claude/projects/*/*.jsonl | head -1   # newest transcript
less <that file>
```

Point at a tool_use block and its tool_result coming back as a user-role
message — the same shape as webui scene 3's document view.

Reset between rehearsals: `git checkout -- rolling.py`

## Demo 2 — CLAUDE.md A/B (~4 min)

Three dirs, identical `wordstats.py`, different CLAUDE.md: **a/** terse
autonomous minimalist, **b/** safety-critical plan-first-and-ask, **c/**
1940s radio announcer (the encore). Two terminal panes side by side:

```sh
cd terminal/claudemd-ab/a && dclaude     # pane 1
cd terminal/claudemd-ab/b && dclaude     # pane 2
```

Same prompt in both: **"Add a --top N option that shows only the N most
frequent words."**

Expected contrast: a/ silently makes a minimal edit and reports in one
sentence; b/ presents a plan and asks permission first, then documents
everything and delivers a risk summary. Show each pane's `CLAUDE.md` (`cat
CLAUDE.md`) after the behaviors diverge, not before — let the audience feel
the difference first. Then c/ for the laugh, and the point lands: same model,
same task; the only variable is a text file in the working directory.

Reset: `git checkout -- .` from `claudemd-ab/`.

Keep this repo's root free of CLAUDE.md files — parent-directory memory would
leak into all three panes.

## Demo 3 — Jacobian reaction (~4 min, the closer)

Full script and beats in `jacobian/PROMPT.md`. Launch with **no web tools** —
the reaction is best when it cannot look up the headlines, and an explicit
`--tools` list means the web tools simply don't exist for the session (no
suspicious permission-denied moment):

```sh
cd terminal/jacobian
dclaude --tools "Bash,Read,Glob,Grep"
```

Beat 1: ask whether the Jacobian conjecture is still open → confident "open
since 1939". Beat 2: present the claim + `jacobian_check.py` → skepticism →
it reads the script, runs it (~0.5s), and updates in real time. Beat 3
(optional): "Which AI model do you suppose helped find it?"

## Fallbacks

- Any demo hangs or goes weird: `/exit`, relaunch, re-paste — each demo is
  ≤1 prompt of state.
- Harness demo already fixed from a rehearsal: `git checkout -- rolling.py`.
- Jacobian instance somehow knows the result: check `/context` for leaked
  memory; verify you launched via `dclaude` from a clean dir.
- Webui down: every webui scene has a screenshot in the talk deck (take them
  during rehearsal) — narrate over stills, run the terminal segment as normal.
