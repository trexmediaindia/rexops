# ADR 0005 — Durable review runs

Accepted: 2026-06-22.

Each submitted version snapshots its pipeline into one `review_run` and run-owned stages. Template edits cannot
rewrite active or historical reviews. Approval records reference both run and stage and are database-immutable.
