# 05 — Build Blocks Roadmap

> How RexOps is built across many Claude sessions: one foundation block, then independent feature blocks that each
> fill one or more **seams** (01 §12) without disturbing the others. Every block is tagged with the **v4 Part D
> phase** and **v4 Part B requirements** it delivers (and the v2 §9 phase it descends from), so adherence to
> `creative-dock-enhanced-build-plan-v4.md` is auditable at a glance. Schema is already defined in full (02), so a
> block is always "write the module + activate tables," never "migrate the world."

---

## 1. Sequencing rationale (and the one deliberate deviation)

The order below = **v2 §9's proven sequence (Foundation → Core flow → Files → Review → Collab → Notify → Polish)
with v4's Part D deltas folded into each phase**. The deliberate call: the **review wedge (Block 3) ships before
the heavy four-views/work-management layer (Block 5).** v4 Part D lists "work core" as Phase 1 and the wedge as
Phase 2, but it frames those as *deltas folded into v2/v3's phases* — and v2 §9 itself puts Files → Review ahead
of work-management depth. Because the wedge is the differentiator and v1 is single-agency dogfood, getting it
usable early is the stronger product call. **Nothing in v4's feature set is dropped or reordered out — only the
sequence of delivery differs, and every v4 Part B requirement has a home below.** (If you prefer v4's literal
Phase-1-first order, swap B3 ↔ B5; the seams make that clean.)

## 2. The block map

| Block | Theme | v4 phase | v2 phase | Seams filled (01 §12) |
|---|---|---|---|---|
| **B1** | Scaffold + Foundation + vertical slice | (Phase 0) | 1–2 | S1,S2,S3,S6(write),S13,S14 + stubs S4,S5,S7,S8,S9,S10,S11,S12 |
| **B2** | Files & Versioning | (v2 Ph3) | 3 | S5(media), S3(media jobs) |
| **B3** | Review & Approval — the wedge | **Phase 2** | 4 | S5(viewers), S8(stages), S12(shares) |
| **B4** | Collaboration & Notifications | **Phase 3** | 5–6 | S4(realtime), S6(fan-out+push) |
| **B5** | Views & Work-management depth | **Phase 1** | (v2 Ph7 deltas) | S7(fields UI), S9(views) |
| **B6** | Automation · Intake · Templates | **Phase 4** | — | S10(automation), S11(intake) |
| **B7** | Analytics & Polish | Phase 4–5 | 7 | S14(dashboards/runbooks) |
| **B8** | Scale / later | **Phase 5** | — | extends S5,S12,S7 |

---

## 3. Block detail

Each block lists: **goal · in-scope (v4 refs) · out-of-scope · schema activated (02) · seams filled · depends on ·
Definition of Done · skills.**

### B1 — Scaffold + Foundation + thin vertical slice ✅ Implemented
- **Goal:** a running, tenant-isolated, fully-wired monorepo where one vertical slice exercises every architectural
  seam end-to-end, so every later block is fill-in-the-blank. (Full spec: **06**.)
- **In scope:** monorepo + 3 Docker images; `.env` contract validated at boot; Better Auth (email/pw + organization
  + admin); the **composable tenant guard + RBAC** (v4 B14, 01 §4) with unit tests; Drizzle/Neon; Agency/Client/
  Project(+sub-project)/Deliverable **CRUD modules** (routes+service+tests); login + role-routed dashboard shells
  (agency/client/super-admin); `turbo gen module` generator; scripts-to-rule-them-all; affected CI + Neon-branch
  test isolation; pino/Sentry/health; **outbox** + one no-op job round-trip; Liveblocks auth-token endpoint
  (scoped); feature-flag provider; seed of the canonical demo dataset (00 §4).
- **Out of scope:** real uploads, the review room, automation execution, the four views — their **tables exist**
  (02, additive) but no UI/logic yet.
- **Schema activated:** agency, user(+Better Auth tables), client, project, project_member, deliverable, audit_log,
  outbox, notification(write path), push_subscription, custom_field_def/value(built-ins seeded), pipeline/
  pipeline_stage(default seeded). All other tables **defined but dormant.**
- **Seams filled:** S1 (guard), S2 (generator/module shape), S3 (outbox + queue round-trip), S6 (notification
  write path), S13 (flags), S14 (observability) + stubs for S4,S5,S7,S8,S9,S10,S11,S12.
- **Depends on:** nothing.
- **DoD:** `bun run setup` → running in <10 min; the §03.11 happy path is creatable through the slice (sans
  upload/review); **every endpoint has happy + validation + authN + tenancy(id-guess→404) tests green**; CI green
  on a Neon branch; boundaries lint passes. (Full checklist: 06 §DoD.)
- **Skills:** `superpowers` (TDD), `feature-dev`, `frontend-design` (shells), `code-review`, `security-review`.

### B2 — Files & Versioning ◐ Prototype  *(v2 Ph3)*
- **Goal:** real, resumable, versioned media on every deliverable.
- **In scope (v4 B9):** R2 presigned PUT/GET; **resumable multi-GB** upload (tus or S3-multipart) via `upload_session`;
  `file_version` auto-increment + **labels/tags + minor/major** semantics; drag-to-stack; worker **thumbnail/proxy**
  (ffmpeg/sharp); source-file (`isSource`) download-only + **companion preview render**; external-link option.
- **Schema activated:** file_version, upload_session. **Seams:** S5 (preview substrate), S3 (media processors).
- **Depends on:** B1. **DoD:** upload a 1.8 GB mov resumably → v1 created INTERNAL → proxy appears; version
  numbers race-safe; tenancy + visibility tests green.
- **Skills:** `superpowers`(TDD), `context7`(R2/tus/ffmpeg), `code-review`, `security-review`.

### B3 — Review & Approval — THE WEDGE ◐ Prototype  *(v4 Phase 2)*
- **Goal:** the best place a client has ever given feedback; the best place an agency has ever tracked it.
- **In scope (v4 B8 + B9 + Part C 3,4,5):** **viewer registry** with per-medium anchoring — **video timecode +
  frame annotation, image region, PDF region, audio waveform/time-range** (defer 3D/web per Part E #1); the
  **Review Room** (04 §3); **configurable sequential/parallel ReviewStages** from `pipeline_stage`, 1..n approvers,
  requiredCount; **three-outcome decisions (Approve/Request-changes/Reject) → immutable audit `approval`**;
  internal-vs-client comment toggle; **comment → tracked subtask** (`task`); attachments/@mentions/reactions/
  threads; **version compare** (synced scrub/zoom); **`Share`** (passphrase/expiry/allow-comment/allow-download/
  **standard** watermark — forensic deferred to B8 per Part E #2); **e-signature sign-off**; guest review.
- **Schema activated:** pipeline/pipeline_stage(config UI), review_stage(+approver), approval, comment(anchored),
  share, task(comment→subtask). **Seams:** S5(viewers), S8(stages), S12(shares).
- **Depends on:** B2. **DoD:** §03.11 steps 4–8 drive through the API + UI; internal versions/comments never reach
  a client (row+field); audit trail complete; sequential AND parallel stages tested.
- **Skills:** `superpowers`(TDD), `context7`(video.js/Annotorious/PDF.js/wavesurfer/Liveblocks), `frontend-design`,
  `design-review`, `accesslint`, `code-review`, `security-review`.

### B4 — Collaboration & Notifications ◐ Credential-dependent  *(v4 Phase 3)*
- **In scope (v4 B10 + B11 + Part C 10):** **Chatter-style `activity_event` feed** per deliverable/version; real-time
  **chat** (project/sub-project channels + DMs + threads) with **drag-a-version-into-chat** tagging; **Liveblocks
  presence + live updates** on boards/review; notification **fan-out** (role + contentType routing) + **Web Push**
  (VAPID/SW/PWA manifest); **reminder + stalled-stage escalation** jobs (v4 B11/B8).
- **Schema activated:** activity_event, channel, message. **Seams:** S4(realtime), S6(fan-out/push).
- **Depends on:** B1(notify write path), B3(events worth notifying). **DoD:** approve→client gets in-app+push in
  real time; presence visible; reminders fire on a Neon-branch clock test.
- **Skills:** `superpowers`(TDD), `context7`(Liveblocks/web-push/BullMQ), `design-review`.

### B5 — Views & Work-management depth ⏸ Unreleased  *(v4 Phase 1 deltas)*
- **In scope (v4 B2 + B3 + B4 + B12 + Part C 1,2,9,11):** the **four views** (Board/List/Calendar/Timeline) over one
  dataset, one-click switch, **saved views** (per-view filter/sort/group/visible-fields); List roll-up columns;
  Calendar drag-reschedule; Timeline **dependencies (FS/SS/FF/SF) with auto-shift + blocked badges**;
  **multi-homing** (`deliverable_placement`); **subtasks + checklists** (with assignees); **custom-field engine UI**
  (built-ins exposed, groupable/filterable/sortable, automation-conditionable); **My Work + Inbox** (cross-client).
- **Schema activated:** saved_view, dependency, checklist/item, task(full), deliverable_placement, milestone,
  custom_field_def/value(UI). **Seams:** S7(fields UI), S9(views).
- **Depends on:** B1. **DoD:** same dataset renders in all four views; saved views persist; a dependency reschedule
  shifts dependents; a deliverable multi-homed into two projects shows in both without duplication.
- **Skills:** `superpowers`(TDD), `context7`(TanStack Table/dnd-kit), `frontend-design`, `design-review`, `accesslint`.

### B6 — Automation · Intake · Templates ⏸ Unreleased  *(v4 Phase 4)*
- **In scope (v4 B5 + B6 + B7 + Part C 6,7,8):** **five-command automation** (Rules + Card/Board **Buttons** +
  Scheduled + Due-date) with **And/Or + otherwise-if** branching and an **HTTP-request action**, compiled to `rule`
  rows executed by the worker off the outbox; **recipe gallery** + per-pipeline **rule cap** (Part E #3); **dynamic
  intake forms** (branching + answer→field mapping + auto-provision) landing in a **request queue**; **template
  packs/Bundles**; **recurring generation** (time- + completion-driven).
- **Schema activated:** rule, intake_form/form_field/form_submission, template_pack, recurring_schedule.
  **Seams:** S10(automation), S11(intake).
- **Depends on:** B1, B3 (approval actions), B4 (notify actions). **DoD:** a "Send to client" button works; an
  intake submission auto-provisions a configured deliverable into the queue; a retainer schedule generates a month.
- **Skills:** `superpowers`(TDD), `feature-dev`, `code-review`, `security-review`.

### B7 — Analytics & Polish ⏸ Unreleased  *(v4 Phase 4–5)*
- **In scope (v4 B13):** turnaround (submit→approve), **revision rounds**, on-time/overdue %, **workload/capacity**,
  **burndown per project**, **portfolio health roll-up** across clients, editable dashboard cards; command-palette
  depth; audit-log views; white-label groundwork (logo/color/portal slug); runbooks.
- **Schema activated:** (reads existing). **Seams:** S14(dashboards/runbooks).
- **Depends on:** B1–B6 (data to analyze). **DoD:** dashboards reflect real data; light-mode pass; perf budget met.
- **Skills:** `superpowers`(TDD), `frontend-design`, `design-review`, `accesslint`, `chrome-devtools`(perf).

### B8 — Scale / later  *(v4 Phase 5)*
- **In scope:** **3D + live-web/HTML proofing** (extend viewer registry — Part E #1); **forensic/DRM watermarking**
  (proxy-only, Part E #2); **formula/mirror fields**; **per-client custom interfaces** (white-label portal,
  Airtable-Interface pattern); **user-defined custom fields** (engine already there); **self-serve agency signup**;
  billing slot-in (additive). **Depends on:** the relevant earlier block per feature.

---

## 4. Dependency graph

```
        B1 (foundation + slice)
        ├──────────────┬───────────────┬──────────────┐
        ▼              ▼               ▼              ▼
       B2 (files)     B5 (views)     (B6 needs B1)   B7 (needs all)
        ▼
       B3 (wedge) ──▶ B4 (collab/notify) ──▶ B6 (automation/intake) ──▶ B7 (analytics) ──▶ B8 (scale)
                                   ▲                         ▲
                                   └── B5 feeds views into ──┘ B6/B7
```
Critical path to a usable differentiated product: **B1 → B2 → B3** (foundation → media → the wedge). B5 can run in
parallel with B3/B4 once B1 lands (it only touches its own seams).

## 5. Cross-block invariants (so nothing drifts)
- Every block uses the **same module generator** (S2) → identical shape, tests, tenancy guard pre-wired.
- Every new table carries `agencyId` and is **already defined in 02** — activation is logic, not structure.
- Every block keeps the **trust boundary tests** (03 §9) green; CI won't merge a tenancy regression.
- Every block updates `docs/adr/` for significant calls and ticks its v4-Part-B coverage here.
- A block is "done" only when its DoD's verification commands have been **run and shown green** (07 §verification).

## 6. v4 Part B coverage ledger (every requirement has a home)
B1→B5 · B2→B9(versioning) · B3→B8,B9 · B4→B10,B11 · B5→B2,B3,B4,B12 · B6→B5(templates),B6,B7 · B7→B13 ·
B14(RBAC)→B1 · Part C 1–11 → tables activated across B1/B3/B5/B6. **No v4 Part A→B requirement is unscheduled.**
