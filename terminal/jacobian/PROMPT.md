# Jacobian reaction demo

A completely fresh Claude instance genuinely reacting to a post-cutoff result:
the Jacobian conjecture (open since 1939) was disproved in July 2026 — L. Alpöge,
working with Claude (Fable 5), found a degree-7 counterexample in ℂ³ (announced
2026-07-19). Models with a Jan-2026 cutoff cannot know this. `jacobian_check.py`
verifies the counterexample symbolically via two independent routes in ~0.5s.

The demo shows three things at once: knowledge cutoff, strong trained priors
("that's a famous open problem"), and tool-grounded belief revision.

## Launch (see ../RUNBOOK.md for the full env prep)

From this directory, with a neutralized config home and NO web tools —
the reaction is best when it cannot look up the headlines:

    claude --tools "Bash,Read,Glob,Grep" --append-system-prompt ""

(`--tools` without WebSearch/WebFetch means the tools simply don't exist for
this session — no suspicious "permission denied" to tip it off.)

## Beats

**1. Establish the prior.** Paste:

> What's the current status of the Jacobian conjecture? Is it still an open
> problem?

Expected: a confident summary that it has been open since Keller 1939, known
partial results, "remains open". This is the model's honest world as of its
training cutoff.

**2. Present the claim + evidence.** Paste:

> I have it on good authority that it was recently disproved — a degree-7
> counterexample in C^3, found by a mathematician working together with an AI
> model. There's a verification script in this directory, jacobian_check.py.
> Evaluate the claim.

Expected arc: skepticism (often explicit — the prior is strong), then it reads
the script, checks the math actually does what it claims, runs it, and updates.
The wording of the surprise varies run to run; that variance is part of the
show. If it waffles about the script's legitimacy, invite it to verify the
algebra itself — the polynomial map is right there.

**3. (Optional) Twist the knife.** Ask:

> Which AI model do you suppose helped find it?

## Notes

- Runtime of the script is ~0.5s; requires sympy (`pip install sympy` on the
  demo host beforehand, or `python3 -c "import sympy"` to check).
- Do NOT run this from a directory carrying project CLAUDE.md files or user
  memory — any mention of the result in loaded context ruins the reaction.
  Check with `/context` or `/memory` if unsure.
