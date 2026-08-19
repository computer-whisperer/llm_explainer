# Coding harness demo

Watch the agentic loop do a small real task: read code → run tests → edit →
re-run. Ties back to webui scene 3: every tool call and result is just more
tokens in one growing document.

The planted bug: `RollingWindow.push` evicts with `self.values.pop()` (removes
the *newest* sample) instead of `pop(0)` (the oldest), so the window gets stuck
on early samples. 2 of 5 tests fail. Small enough to resolve in a few tool
calls, real enough to require actually reading the code.

## Launch

From this directory:

    claude

Paste:

> The test suite is failing. Find the bug, fix it, and run the tests to
> confirm.

Expected: ~3-5 tool calls, under two minutes. Narrate the loop as it happens —
"it proposed a command, the harness ran it, the output went back into the
document, and it continued."

## Beat 2 — the reveal

After it finishes, show that the whole session is one document (scene 3 made
this claim; now prove it on the real tool). The transcript is JSONL, one line
per message, at:

    ~/.claude/projects/<munged-cwd>/<session-id>.jsonl

Find the newest one and pretty-print a tool call + tool result pair:

    ls -t ~/.claude/projects/*/​*.jsonl | head -1

Point at: the user message, the assistant message containing a tool_use block,
the tool_result coming back as a *user-role* message. Same shape as the webui
document view.

## Reset between rehearsals

    git checkout -- rolling.py
