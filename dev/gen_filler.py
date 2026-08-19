#!/usr/bin/env python3
"""Generate assets/filler.txt — deterministic fake quarterly engineering notes
used as "unrelated context" by the context-rot scene. Varied enough not to
collapse into degenerate repetition; boring enough to be plausibly real."""
import random
from pathlib import Path

rng = random.Random(0x5EED)

TEAMS = ["Platform", "Ingest", "Billing", "Mobile", "Search", "Infra", "Data", "Frontend",
         "Auth", "Notifications", "QA", "SRE", "Payments", "Analytics"]
NAMES = ["Priya", "Marcus", "Elena", "Tomás", "Yuki", "Dario", "Ingrid", "Sam", "Wei",
         "Amara", "Jonas", "Fatima", "Ruth", "Oleg", "Nadia", "Kofi", "Petra", "Liam"]
SYSTEMS = ["the ingestion pipeline", "the billing reconciler", "the search indexer",
           "the notification fanout", "the session store", "the export service",
           "the rate limiter", "the audit logger", "the metrics collector",
           "the deploy orchestrator", "the feature-flag service", "the image resizer"]
VERBS = ["migrated", "refactored", "instrumented", "load-tested", "documented",
         "containerized", "deprecated", "benchmarked", "hardened", "simplified"]
ISSUES = ["intermittent timeouts", "a memory leak under sustained load", "clock drift on two nodes",
          "duplicate delivery during failover", "a flaky integration test", "slow cold starts",
          "an off-by-one in pagination", "certificate rotation failures", "queue backpressure",
          "stale cache entries after deploys"]
OUTCOMES = ["p95 latency dropped from {a} ms to {b} ms", "error rate fell to 0.0{b}%",
            "throughput improved by {b}%", "build times went from {a} s to {b} s",
            "storage costs came down roughly {b}%", "on-call pages dropped by {b}%"]
NEXT = ["Next quarter the focus shifts to capacity planning.",
        "Follow-up items are tracked in the team backlog.",
        "A postmortem review is scheduled for the coming sprint.",
        "No further action is expected unless the trend reverses.",
        "The remaining work is blocked on the vendor upgrade.",
        "A design review will decide whether to generalize this."]

def sentence_pool(team, week):
    name1, name2 = rng.sample(NAMES, 2)
    sysm = rng.choice(SYSTEMS)
    a, b = rng.randint(120, 900), rng.randint(8, 95)
    return [
        f"{name1} {rng.choice(VERBS)} {sysm} and closed out {rng.randint(2, 14)} tickets.",
        f"The team investigated {rng.choice(ISSUES)}; root cause was traced to a misconfigured retry policy.",
        f"After the change, {rng.choice(OUTCOMES).format(a=a, b=b)}.",
        f"{name2} paired with {rng.choice(TEAMS)} on the shared library upgrade.",
        f"Deploy window for week {week} completed without rollback.",
        f"Capacity review: current headroom is about {rng.randint(15, 60)}% at peak.",
        f"{rng.choice(NEXT)}",
    ]

def main():
    out = ["ENGINEERING NOTES — Q2 SUMMARY (internal, for reference)\n"]
    section = 1
    for week in range(1, 21):
        for team in TEAMS:
            pool = sentence_pool(team, week)
            k = rng.randint(4, 7)
            body = " ".join(rng.sample(pool, k))
            out.append(f"§{section}. Week {week} — {team} team.\n{body}\n")
            section += 1
    text = "\n".join(out)
    path = Path(__file__).resolve().parent.parent / "assets" / "filler.txt"
    path.parent.mkdir(exist_ok=True)
    path.write_text(text, encoding="utf-8")
    print(f"wrote {path} — {len(text)} chars, {len(out)-1} sections")

if __name__ == "__main__":
    main()
