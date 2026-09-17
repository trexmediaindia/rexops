# 03 — Application Flow (detailed)

> The behavioral contract. Entities/enums referenced here are defined in [02](./02-domain-model.md); enforcement
> mechanics in [01 §4](./01-architecture.md). Every transition below names its **trigger**, **state change**,
> **side effects** (outbox → notifications/jobs), and the **trust-boundary rule** that applies. Implement flows
> test-first against this doc.

---

## 1. Capability matrix (RBAC grid)

`✓` allowed · `·` denied · `✓*` allowed only with the named permission flag · `R` read-only.

| Capability | SUPER_ADMIN | AGENCY_OWNER | AGENCY_ADMIN | AGENCY_MEMBER | CLIENT_OWNER | CLIENT_MEMBER |
|---|---|---|---|---|---|---|
| Cross all agencies | ✓ (audit-logged) | · | · | · | · | · |
| Impersonate ("view as") | ✓ (R, audit-logged) | · | · | · | · | · |
| Provision agency | ✓ | · | · | · | · | · |
| Manage agency settings/branding | · | ✓ | ✓ | · | · | · |
| Manage members / invite staff | · | ✓ | ✓ | ✓* `canManageTeam` | · | · |
| Create/manage clients | · | ✓ | ✓ | ✓* `canViewAllClients` | · | · |
| Invite client users | · | ✓ | ✓ | ✓* `canInviteClients` | ✓ (own client) | · |
| Create projects/sub-projects | · | ✓ | ✓ | ✓ (assigned) | · | · |
| Create/assign deliverables | · | ✓ | ✓ | ✓ (assigned project) | · | · |
| Upload file version | · | ✓ | ✓ | ✓ (assigned) | · (refs only) | · |
| Upload client reference | · | ✓ | ✓ | ✓ | ✓ | ✓ |
| Internal approve (promote) | · | ✓ | ✓ | ✓* `canApprove` (lead) | · | · |
| See INTERNAL versions/comments | ✓ | ✓ | ✓ | ✓ | · | · |
| Client approve / request changes | · | · | · | · | ✓ | ✓* `canApprove` |
| Comment (client-visible) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Comment (internal-only) | ✓ | ✓ | ✓ | ✓ | · | · |
| Create share link | · | ✓ | ✓ | ✓* | ✓ (own) | · |
| Configure automations/intake | · | ✓ | ✓ | ✓* `canManageAutomations` | · | · |

> The grid is the **access-rights layer** (01 §4 Layer 1). The **record-rules layer** (Layer 2) then narrows
> every `✓` to *which rows*: an AGENCY_MEMBER's `✓` on deliverables means only deliverables in projects they're
> a `project_member` of (unless `canViewAllClients`). A CLIENT_*'s `✓` means only rows where
> `deliverable.clientId === ctx.clientId` **and** `file_version.visibility === CLIENT`.

---

## 2. Provisioning flows (v1 = single-agency dogfood)

### 2.1 Super-Admin provisions an agency
1. Super-Admin (`agencyId = null`) creates an `agency` (name, slug) → also creates the Better Auth
   `organization` and links `agency.betterAuthOrgId`.
2. Creates the `AGENCY_OWNER` user (Better Auth user + org member `owner`), sets `agencyId`.
3. **Side effects:** `audit_log(action: AGENCY_PROVISIONED)`; invite email (Resend) to the owner.
4. *No public signup exists in v1* — this is the only way an agency is born. (Self-serve = Block 8, same tables.)

### 2.2 Agency builds its team
- Owner/Admin invites `AGENCY_MEMBER`s via Better Auth `invitation`; each gets a `specialty` + default
  `permissions`. Accepting the invite sets `agencyId` + role on the user.
- **Trust rule:** a member sees nothing until added as a `project_member` (or granted `canViewAllClients`).

### 2.3 Agency onboards a client
1. Agency creates a `client` (org-level: name, company, contacts). Status `ACTIVE`.
2. Agency (or client owner later) invites `CLIENT_OWNER` → Better Auth user with `clientId` set, role
   `CLIENT_OWNER`, `permissions.canApprove = true`.
3. CLIENT_OWNER may invite `CLIENT_MEMBER`s (e.g. community manager) → default **review-only**
   (`canApprove = false`).
4. **Trust rule:** client users are **never** Better Auth org members; they are scoped purely by
   `clientId` + the record rules. They can never enumerate other clients or agency internals.

---

## 3. The work-creation flow

```
Agency ─create→ Project ─(optional)→ Sub-project ─create→ Deliverable(s) ─assign→ Member(by specialty)
```
- **Project** belongs to exactly one `client` (and `agency`). Optional one-level `parentProjectId` = sub-project;
  teams (`project_member`) assignable per (sub-)project.
- **Deliverable** carries `contentType` (MOTION/STATIC/OTHER) → this drives later notification routing. Starts
  `status = PENDING`.
- **Side effects on create:** `activity_event`; `notification(PROJECT_CREATED | DELIVERABLE_CREATED)` to relevant
  agency members; project status roll-up recomputed.

---

## 4. The deliverable lifecycle — master state machine

This is the spine of the product. States are `deliverable_status`; the **internal approval chain** and **client
review** are the two gated transitions. (Per-version status `fv_status` tracks the artifact; deliverable status
tracks the work item — they move together at the gates.)

```
            ┌──────────────────────────────── revision loop ───────────────────────────────┐
            ▼                                                                                │
 PENDING ─(work started)→ IN_PROGRESS ─(editor uploads v1)→ READY_FOR_INTERNAL_REVIEW        │
                                                                   │                         │
                                                    (submit to internal approver)            │
                                                                   ▼                         │
                                                         UNDER_INTERNAL_REVIEW               │
                                              ┌────────────┴───────────────┐                 │
                                  (internal: request changes)      (internal: approve)        │
                                              ▼                            ▼                  │
                                        IN_PROGRESS              INTERNAL_APPROVED            │
                                       (back to editor)                    │                  │
                                                              (promote to client = make      │
                                                               version visibility CLIENT)     │
                                                                           ▼                  │
                                                                 UNDER_CLIENT_REVIEW          │
                                              ┌────────────────────────┴─────────────┐       │
                                   (client: request changes)              (client: approve)   │
                                              ▼                                       ▼       │
                                     REVISION_REQUESTED ───(editor uploads vN+1)──────┘    APPROVED
                                                                                              │
                                                                                       (agency delivers)
                                                                                              ▼
                                                                                          DELIVERED
   any state ─(archive)→ ARCHIVED   (soft, reversible; never hard-deleted)
```

### 4.1 Transition table (authoritative)

| # | Trigger (actor) | From → To (deliverable) | Version effect | Side effects (via outbox) | Trust rule |
|---|---|---|---|---|---|
| T1 | Member starts work | PENDING → IN_PROGRESS | — | activity_event | assigned member only |
| T2 | Editor uploads v1 (B2) | IN_PROGRESS → READY_FOR_INTERNAL_REVIEW | `file_version` v1 created, `visibility=INTERNAL`, `status=UPLOADED` | activity_event(UPLOAD); media proxy job | INTERNAL only — client sees nothing |
| T3 | Editor submits for internal review | READY_FOR_INTERNAL_REVIEW → UNDER_INTERNAL_REVIEW | v1 `status=UNDER_INTERNAL_REVIEW` | notification(INTERNAL_REVIEW_REQUESTED) routed by `contentType`+specialty to approver(s) | INTERNAL |
| T4a | Internal approver requests changes | UNDER_INTERNAL_REVIEW → IN_PROGRESS | v1 `status=CHANGES_REQUESTED` | `approval(decision=REQUEST_CHANGES, stage=INTERNAL)`; notification to editor; comment→subtask (B3) | INTERNAL |
| T4b | Internal approver approves | UNDER_INTERNAL_REVIEW → INTERNAL_APPROVED | v1 `status=INTERNAL_APPROVED` | `approval(APPROVE, INTERNAL)`; activity_event | INTERNAL |
| T5 | System/approver **promotes to client** | INTERNAL_APPROVED → UNDER_CLIENT_REVIEW | v1 `visibility=CLIENT`, `status=UNDER_CLIENT_REVIEW`; `submittedAt=now` | notification(SUBMITTED_TO_CLIENT) to client owner + review team | **The promotion** — first moment client can see this version |
| T6a | Client requests changes | UNDER_CLIENT_REVIEW → REVISION_REQUESTED | v1 `status=CHANGES_REQUESTED`; `reviewedAt=now` | `approval(REQUEST_CHANGES, CLIENT, feedback)`; notification to agency; comment→subtask | client of record only; feedback required |
| T6b | Client approves | UNDER_CLIENT_REVIEW → APPROVED | v1 `status=APPROVED`; `reviewedAt=approvedAt=now` | `approval(APPROVE, CLIENT, eSignature?)`; notification to agency | client of record; `canApprove` required |
| T7 | Editor uploads vN+1 after revision | REVISION_REQUESTED → READY_FOR_INTERNAL_REVIEW (or straight to UNDER_CLIENT_REVIEW if pipeline skips internal on minor) | new `file_version`, prior `status=REPLACED` (history kept) | activity_event(UPLOAD); media job | INTERNAL again until re-promoted |
| T8 | Agency delivers | APPROVED → DELIVERED | — | notification(DELIVERED); activity_event | — |
| T9 | Any actor archives | * → ARCHIVED | — | activity_event | soft, reversible |

**Invariants (enforced in `core`, asserted in tests):**
- A `file_version` with `visibility=INTERNAL` is **never** returned to a CLIENT_* principal — at the row level
  (it's filtered) *and* the field level (no INTERNAL comments leak).
- The **latest** version is the primary review target; older versions stay visible (read-only) but only carry
  Approve/Request-changes CTAs when explicitly selected.
- Approval is a **soft gate**: one deliverable being UNDER_CLIENT_REVIEW does not freeze sibling deliverables;
  project status is *derived* from its deliverables, never a hard lock.
- `approval` rows are **append-only** — a re-decision creates a new row; history is the audit trail.

### 4.2 Version auto-increment + labels
On upload, `versionNumber = max(existing for deliverable) + 1` (computed inside the tx to avoid races — 02
unique constraint `(deliverableId, versionNumber)` is the backstop). `label`/`tags`/`isMinor` are optional
semantic overlays (Ziflow minor/major). In comments/chat, typing `@v2` resolves to a `refVersionIds` chip that
jumps to that version (signature UX — 04).

---

## 5. The review-stage engine (generalizes §4)

Block 1 ships the §4 chain as **two seeded `review_stage` rows** per deliverable (one `INTERNAL`, one `CLIENT`,
both `SEQUENTIAL`, `requiredCount=1`). Block 3 makes stages **configurable**:

- A pipeline defines **ordered stages**; each stage is `SEQUENTIAL` (approvers act in order) or `PARALLEL`
  (all/`requiredCount` approvers act simultaneously).
- A stage `PASSES` when its decision rule is met (sequential: last approver approves; parallel: `requiredCount`
  approves). Any `REJECT` fails the stage → routes back per pipeline config.
- `slaHours` + `escalateToUserId`: a `STAGE_STALLED` job fires if a stage sits `ACTIVE` past SLA (Ziflow
  escalation).
- The internal→client chain is just the **default two-stage pipeline**; nothing in §4 is special-cased, so
  Block 3 is additive, not a rewrite.

---

## 6. Comments & annotations (per medium)

| Medium | `anchorType` | `anchor` payload | Viewer (B3, seam S5) |
|---|---|---|---|
| Video | TIMECODE (+ optional REGION drawn on frame) | `{ms}` (+`{x,y,w,h,frameMs}`) | video.js/Plyr + canvas |
| Image | REGION | `{x,y,w,h}` | Annotorious |
| PDF/doc | REGION | `{page,x,y,w,h}` | PDF.js |
| Audio | WAVEFORM_RANGE | `{startMs,endMs}` | wavesurfer.js |
| 3D (B8) | VIEWPOINT_3D | `{camera…}` | Online3DViewer |
| Web (B8) | WEB_SELECTOR | `{selector,…}` | QuickReviewer-style |

- Every comment carries `visibility` (INTERNAL vs CLIENT_VISIBLE). Client principals only receive CLIENT_VISIBLE.
- A client "request changes" comment **spawns a tracked subtask** (`comment.spawnedTaskId`) on the editor so the
  revision is closed-loop (Asana proofing → subtask).
- Threads (`parentId`), `@mentions` (→ MENTION notification), reactions, attachments. `refVersionIds` enables
  "@v2 pacing is better but bring back @v1 intro."

---

## 7. Notification routing

Single pipeline (01 §9): event → `outbox` (same tx) → worker writes `notification` row(s) + Web Push fan-out.

**Routing rules:**
- **By role:** approvals-to-give go to the stage's approvers; client decisions go to the assigned agency member +
  project leads; mentions go to the mentioned user.
- **By contentType:** a MOTION deliverable routes internal-review notifications to members with
  `specialty ∈ {MOTION, EDITOR}` + the motion lead + head of agency; STATIC → `specialty=DESIGNER` + design lead.
- **Broadcast:** `notification.recipientRole` lets an event hit "all AGENCY_ADMINs in this agency" without
  enumerating users.
- **Reminders/escalation (scheduled jobs):** `DUE_DATE_REMINDER` (deliverable due in 24h), `STAGE_STALLED`
  (stage past `slaHours`).

**Delivery:** in-app feed (always) + Web Push (if subscribed). Desktop browsers ~90–95%; iOS only as an
**installed PWA** (iOS 16.4+), best-effort, re-subscribe on app open. Email/WhatsApp channels deferred but the
model is channel-agnostic.

---

## 8. Share / guest review flow (B3)

1. Agency creates a `share` for a deliverable/version: sets `passphrase?`, `expiresAt?`, `allowComment`,
   `allowDownload`, `watermark`, `audience`.
2. Recipient opens `/{share.token}` → if `passphraseHash` set, must enter it; if `expiresAt` passed → gone.
3. Guest sees **only** the shared resource (no surrounding tenant data), can comment if `allowComment`, download
   only if `allowDownload`. `STANDARD` watermark overlays identity; `FORENSIC` (B8) serves proxy-only.
4. `viewCount`++ and `SHARE_VIEWED` activity/notification. All enforced **server-side** (never trust the client).

---

## 9. Trust-boundary checklist (the rules that must never break)

1. Every query is `agencyId`-scoped through the guard; Super-Admin is the only exemption and it audit-logs.
2. Id-guessing a cross-tenant resource → **404** (never 403; don't reveal existence).
3. CLIENT_* principals: only their `clientId`'s rows; only `file_version.visibility=CLIENT`; only
   `comment.visibility=CLIENT_VISIBLE`; never agency notes, internal approvals, other clients, team/settings.
4. INTERNAL versions/comments are stripped at **both** row and field level.
5. Client cannot upload final versions (only references) unless `canUploadFinal`.
6. Soft-delete only; history (versions/reviews/comments/approvals) is never destroyed.
7. Private media only via short-lived presigned GET or a valid `share` token.

---

## 10. Edge cases & concurrency

| Case | Rule |
|---|---|
| Two approvers act on a PARALLEL stage simultaneously | Decisions are independent append-only `approval` rows; stage pass evaluated transactionally against `requiredCount`. |
| Editor uploads vN+1 while client is still reviewing vN | New version supersedes as latest; vN review remains in history; client review target moves to latest (or stays if client explicitly pinned a version). |
| Client requests changes with empty feedback | Rejected at validation (feedback required for REQUEST_CHANGES). |
| Re-open an APPROVED deliverable | Allowed by agency: → REVISION_REQUESTED, new version expected; original `approval` row stays (audit). |
| Concurrent version-number assignment | `versionNumber` computed in tx; unique constraint is the backstop → retry on conflict. |
| Impersonation writes | Super-Admin "view-as" is **read-only**; any write during impersonation is blocked + audit-logged. |
| Archived client/project | Hidden from default lists; deliverables frozen from new transitions until un-archived. |

---

## 11. End-to-end narrative (the canonical happy path — used in the seed + an e2e test)

1. **Super-Admin** provisions **T-Rex Media** + owner *Manas*. (`AGENCY_PROVISIONED` audit.)
2. Manas invites **Riya (MOTION editor)** and onboards client **Imperial Living** + client owner **Sara**
   (`canApprove`).
3. Manas creates project **June Content Retainer**, sub-project **Reels**, deliverable **Beach Vibe Reel**
   (`contentType=MOTION`, assigned Riya).
4. Riya uploads **v1** (1.8 GB mov, resumable) → INTERNAL, proxy generated. Submits for internal review →
   Manas notified (MOTION routing).
5. Manas leaves a timecode comment at `00:00:12:040` ("logo too big"), **requests changes** → back to Riya as a
   subtask.
6. Riya uploads **v2** → internal review → Manas **approves** → **promote to client**. Sara notified
   (in-app + push).
7. Sara opens the **review room**, scrubs to her note point, approves **v2** with a typed e-signature. Agency
   notified; `approval(APPROVE, CLIENT)` recorded.
8. Throughout: Sara never saw v1's INTERNAL status, Manas's internal note, or any other client. Guessing another
   client's deliverable id returned 404. The agency dashboard reflected each step live (presence + activity).
9. Manas marks **Delivered**.

If an automated test can drive steps 1–9 through the API (Eden) and assert every trust rule, the core loop is
correct.
