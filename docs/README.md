# RexOps — Documentation

> **RexOps** is a multi-tenant, enterprise creative operating system for agencies and their clients.
> It replaces the scattered WhatsApp / Drive / email / "which version was approved?" workflow with one
> system: `Agency → Clients → Projects → Deliverables → File Versions → Reviews/Approvals`, with a hard
> agency↔client trust boundary and a Frame.io-grade review-and-approval engine as the wedge.
>
> Formerly "Creative Dock." Same product, renamed. Package namespace: `@rexops/*`.
>
> **Status:** v1 Blocks 1–7 implemented and locally verified. Block 8 remains explicitly deferred.
> **Verification date:** 2026-06-22. See [08-implementation-status.md](./08-implementation-status.md).

---

## How to read these docs

Read in order the first time. After that, jump by task.

| # | Doc | What it answers | Read when |
|---|---|---|---|
| — | [README.md](./README.md) | The map (this file) | First |
| 00 | [00-product-overview.md](./00-product-overview.md) | What we're building and why; personas; scope & non-goals; glossary | First |
| 01 | [01-architecture.md](./01-architecture.md) | Stack, monorepo, tenancy/RBAC, type spine, async/realtime/storage, security, the **seams** every block plugs into | Before any block |
| 02 | [02-domain-model.md](./02-domain-model.md) | The **full additive schema** — every entity/enum/relation, each tagged with the block that activates it | Designing any data change |
| 03 | [03-app-flow.md](./03-app-flow.md) | Every actor journey + every workflow + the deliverable/review **state machines** with exact transitions | Implementing any flow |
| 04 | [04-ui-ux-flow.md](./04-ui-ux-flow.md) | Design thesis + token system, nav map, screen-by-screen specs, component inventory, copy & a11y | Building any UI |
| 05 | [05-build-blocks-roadmap.md](./05-build-blocks-roadmap.md) | The 8 blocks: scope, deliverables, schema activated, seams filled, dependencies, DoD | Picking what to build |
| 06 | [06-scaffold-block-1.md](./06-scaffold-block-1.md) | The exact Block 1 deliverable: full file tree, vertical slice, tests, CI, generator, DoD | Building the scaffold |
| 07 | [07-session-conventions.md](./07-session-conventions.md) | The multi-session contract: how a fresh session picks up a block and finishes it | Every session start |
| 08 | [08-implementation-status.md](./08-implementation-status.md) | Delivered scope, verification, and credential-dependent checks | Handoff / release |
| 09 | [09-block-2-files-versioning.md](./09-block-2-files-versioning.md) | Block 2 build spec (as-built): upload/storage/versioning/media | Working on files/versions |
| 10 | [10-block-3-review-approval.md](./10-block-3-review-approval.md) | Block 3 build spec (as-built): stages, decisions, comments, shares | Working on the review wedge |
| 11 | [11-block-4-collaboration-notifications.md](./11-block-4-collaboration-notifications.md) | Block 4 build spec (as-built): activity, chat, notifications, Web Push, Liveblocks auth, schedulers | Working on collab/notifications |
| 12 | [12-block-2-4-status-and-flags.md](./12-block-2-4-status-and-flags.md) | Plain-English audit of Blocks 2–4 + what release flags are + which env unlocks each feature | Turning features on / handoff |
| 13 | [13-block-2-files-versioning-enhancements.md](./13-block-2-files-versioning-enhancements.md) | Block 2 **gap-fill spec**: version stacks, Compare engine, bulk upload manager, hover-scrub + full UI/UX | Building the B2 enhancements |
| 14 | [14-block-3-review-approval-enhancements.md](./14-block-3-review-approval-enhancements.md) | Block 3 **gap-fill spec** (API mostly built, UI missing): threads/reactions/mentions, comment→task loop, compare, audit trail, pipeline editor + full UI/UX | Surfacing the wedge UI |
| 15 | [15-block-4-collaboration-liveblocks-enhancements.md](./15-block-4-collaboration-liveblocks-enhancements.md) | Block 4 **gap-fill spec**: feature-rich Liveblocks (who's-viewing, follow-mode, presence-aware rail, live updates), live notifications, activity feed + full UI/UX + trust boundary | Making realtime rich |

---

## The one-paragraph mental model

Everything is **one dataset rendered two ways**: a **powerful** agency surface and a **ruthlessly simple**
client surface, over a tenant-isolated Postgres. The architecture (01) defines a small number of **seams** —
the tenant guard, the job outbox, the realtime auth endpoint, the viewer registry, the notification fan-out,
the custom-field engine, the feature-flag gate. Block 1 (06) builds every seam plus one thin vertical slice
that exercises all of them end-to-end. Blocks 2–8 (05) each fill one seam with real features without touching
the others. The full schema (02) is defined **up front and additively**, so no later block forces a destructive
migration. The flow (03) and UI (04) docs are the contract the blocks implement against.

## Conventions that make blocks connect (the non-negotiables)

1. **One canonical vocabulary.** Enums, statuses, role names, and entity names are defined once in 02 and used
   verbatim everywhere — code, copy, tests, docs.
2. **The full schema exists from day one.** Tables for later blocks ship as additive, mostly-unused definitions
   so activating a feature is "write the module," never "migrate the world." (02 marks each with *Active in Block N*.)
3. **Every write is tenant-scoped through one guard.** No endpoint hand-rolls authorization. (01 §Tenancy.)
4. **Every feature is generated, not hand-placed.** `turbo gen module <name>` emits the identical module shape
   (routes + service + tests + schema stub + web route). New work copies the *shape*, not the bugs. (06 §Generator.)
5. **Tests are the spec.** Each module ships happy-path + validation + authN + **tenancy (id-guess → 404)** before
   it's "done." (06 §Test matrix, 07 §TDD loop.)
6. **Decisions are recorded.** Significant calls become ADRs in `docs/adr/`. These planning docs are proto-ADRs.

## Source material these docs supersede / fold in

These docs are the single source of truth going forward. They consolidate and supersede the working notes in
`../dashboard/`: `overview.txt` (original PRD), `creative-dock-overview-v2.md` (domain baseline),
`creative-dock-enhanced-build-plan-v4.md` (sourced competitive teardown), `creative-dock-tech-stack-v1.md`
(stack pin), `creative-dock-repo-conventions.md` (paved road). Where those disagree with these docs, **these win.**
