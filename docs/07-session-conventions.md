# 07 — Session Conventions (the multi-session contract)

> RexOps is built across many Claude sessions, each owning one block (05). This doc is how a *fresh* session picks
> up cold and finishes a block without drifting from the plan or breaking a seam. Follow it exactly — it's what
> keeps independently-built blocks connecting perfectly.

---

## 1. Start-of-session checklist (every session, in order)
1. **Read the map:** `docs/README.md` → the block you're building in `docs/05-build-blocks-roadmap.md`.
2. **Load the contracts the block touches:** `01` (the seams it fills), `02` (the tables it activates), `03` (the
   flows it implements), `04` (the screens it ships). Do **not** re-derive scope — it's written.
3. **Check the seam table (01 §12):** confirm which seam(s) you're filling and that you won't change a seam's
   signature. If you must, update `01 §12` + every dependent block doc + add an ADR.
4. **Confirm the previous block's DoD is green** (don't build on red). Run `bun run check && bun run test`.
5. **Invoke `superpowers` (brainstorm only if the block's design is genuinely ambiguous; otherwise go to plan).**
6. **Write a plan** (`superpowers:writing-plans`) for the block from its 05 entry, then execute it test-first.

## 2. The build loop (per module / per feature)
**Generator-first, then TDD.** Never hand-place a module.
1. `bun run gen module <name>` → identical shape (routes + service + tests + validators + web route + tenancy
   guard + test skeleton). (06 §5.)
2. **Red:** write the failing test(s) from the 03 flow + the 06 test matrix (happy + validation + authN +
   tenancy(404) + the relevant state-machine transition). Use `superpowers:test-driven-development` / `tdd`.
3. **Green:** implement the pure `service` logic (through the `core` guard) until tests pass.
4. **Refactor:** simplify; keep `core` framework-free.
5. **UI (if the block ships screens):** the 3-pillar loop (04 §10) — `frontend-design` (taste) → `playwright`/
   `chrome-devtools` + `design-review` (eyes) → `web-design-guidelines` + `accesslint` (guardrails).
6. **Repeat** per module until the block's DoD is satisfied.

## 3. Non-negotiable rules (CI enforces; reviewers double-check)
- **Tenancy through one guard.** Every query goes through `core` `scopeAgency` + record rules. No endpoint
  hand-rolls authorization. A new tenant table without `agencyId` fails review.
- **Tests are the spec.** A module isn't "done" until happy + validation + authN + **tenancy(id-guess→404)** are
  green. Tenancy regressions never merge (03 §9 trust-boundary tests are required checks).
- **Boundaries hold.** `core` imports no framework (Elysia/React); dependency direction per 01 §2; no cycles.
- **Schema is additive.** Tables are already defined (02). Any change is **expand/contract** (01 §14), forward-only,
  Neon-branch-verified in CI — never destructive in one deploy, never hand-run on prod.
- **One canonical vocabulary.** Enums/statuses/role names/entity names exactly as 02 — in code, copy, tests, docs.
- **Action-named copy** stays consistent through the flow (04 §7): the button verb == the toast verb.
- **Decouple deploy from release.** Ship new surfaces behind a feature flag (S13) until the block's DoD is met.

## 4. Definition of Done template (copy into each block's PR)
```
Block: B_  ·  Theme: ____  ·  v4 phase/refs: ____
[ ] Scope matches docs/05 entry (no scope creep; deferrals respected)
[ ] Seam(s) filled without changing any seam signature (01 §12)
[ ] Tables activated per 02; migrations forward-only + Neon-branch verified
[ ] Every endpoint: happy + validation + authN + tenancy(404) green
[ ] core unit tests green; coverage gate met
[ ] Trust-boundary tests (03 §9) green
[ ] UI (if any): design-review pass + accesslint (WCAG 2.2 AA) + responsive checked
[ ] Observability: logs/Sentry/health intact
[ ] ADR added for any significant decision
[ ] DoD verification commands RUN and shown green (paste output)
[ ] docs/05 coverage ledger ticked for delivered v4 requirements
```

## 5. Verification before completion (no "should work")
Before claiming a block done, **run the commands and paste the output** (use `superpowers:verification-before-
completion` / `verify` / `run`): `bun run check`, `bun run test`, the relevant e2e of the 03 flow, and — for UI —
a `design-review` screenshot pass. Evidence before assertions. "Tests pass" without shown output is not done.

## 6. Code review & security gates
- Self-review with `superpowers:requesting-code-review` before opening the PR; address with
  `superpowers:receiving-code-review` (verify, don't perform-agree).
- Run `code-review` (correctness) + `security-review` (the tenancy/file-security surface is high-risk — always run
  it on auth, sharing, upload, and impersonation code).
- Use `commit-commands` for clean commits/PRs; **Conventional Commits** (`feat:`/`fix:`/`chore:`) drive changelogs.

## 7. When reality diverges from the plan
The docs are the source of truth, but they're not infallible. If implementation reveals a better design or a
contradiction:
1. Make the call, keeping the **seam contract** and **trust boundary** intact.
2. **Update the affected doc(s)** (00–06) in the same PR so the plan never lies.
3. Write an **ADR** (`docs/adr/NNNN-title.md`: context → decision → consequences). These planning docs are
   proto-ADRs; formalize new calls so future sessions know *why*.
4. If the change touches a seam or the schema shape, update `01 §12` / `02` + the dependent block entries in `05`.

## 8. Library facts → Context7, always
This stack moves fast (Elysia, Better Auth plugins, Drizzle/Neon driver, Liveblocks, tus, web-push, TanStack).
Before writing integration code, fetch current docs with **Context7** (`resolve-library-id` → `query-docs`) — even
for things you think you know. The `[verify]` flags in 01/06 mark exactly where prior-session assumptions must be
re-confirmed live.

## 9. Memory & continuity across sessions
- The `dashboard/` working notes and these `docs/` are the long-term memory; **these docs win** on any conflict.
- At session end, leave `main` green, the block's DoD checklist updated, and any new ADRs committed — so the next
  cold session can `git pull` and immediately know where things stand.
- Keep the **v4 coverage ledger (05 §6)** honest: tick requirements as blocks deliver them; that ledger is the
  running proof that the build still matches `creative-dock-enhanced-build-plan-v4.md`.

## 10. The shortest version (pin this)
> Read README → block in 05 → its contracts in 01/02/03/04. `gen module`. Red→green→refactor with tenancy(404)
> tests. Keep `core` framework-free and the trust boundary unbroken. UI = taste→eyes→guardrails. Run the
> verification, paste the output, update the docs + ADR, tick the v4 ledger. Leave `main` green.
