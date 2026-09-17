# 02 — Domain Model (full additive schema)

> **The single most important rule for cross-block coherence:** this schema is defined **in full, up front,
> and additively.** Tables for later blocks ship as real Drizzle definitions from Block 1 (mostly unused), so
> activating a feature is "write the module," never "migrate the world." Every table is tagged **`Active: Bn`**
> (the block that first reads/writes it). Enums and names here are **canonical** — use them verbatim in code,
> Zod DTOs, copy, and tests.
>
> Drizzle + Neon Postgres. IDs are `cuid2` (`text` PK, collision-resistant, URL-safe). All timestamps are
> `timestamptz`. Arrays (`text[]`) and `jsonb` require Postgres (never SQLite). The `neon-serverless` driver is
> mandatory for the interactive transactions the review/approval writes need.

---

## 0. Conventions (apply to every table unless noted)

| Column | Type | Rule |
|---|---|---|
| `id` | `text` PK | `cuid2` default. |
| `agencyId` | `text NOT NULL` | **Tenant scope.** On *every* tenant-owned table. FK → `agency.id`. Indexed. The global record rule keys off this. (Omitted only on `agency`, Better-Auth-owned, and truly global tables.) |
| `createdAt` | `timestamptz NOT NULL` | default `now()`. |
| `updatedAt` | `timestamptz NOT NULL` | default `now()`, bumped on write. |
| `deletedAt` | `timestamptz NULL` | **Soft delete.** Present on all user-data tables; queries filter `deletedAt IS NULL` by default. We never hard-delete clients/projects/deliverables/versions/reviews/comments. |
| `createdByUserId` | `text NULL` | actor, where meaningful. |

**Indexing baseline:** every `agencyId`; plus `(agencyId, status)`, `(agencyId, clientId)`,
`(projectId)`, `(deliverableId)`, and the uniqueness constraints noted per table. Add covering indexes as views
demand (Block 5/7).

**Why all tenant tables carry `agencyId` directly (denormalized) instead of joining up the tree:** the global
tenant rule must be a single cheap `WHERE agencyId = ?` on any table without a multi-join — this is the Odoo
`company_id` pattern and the thing that makes tenant isolation un-leaky and fast.

---

## 1. Canonical enums

```
user_role          SUPER_ADMIN | AGENCY_OWNER | AGENCY_ADMIN | AGENCY_MEMBER | CLIENT_OWNER | CLIENT_MEMBER
specialty          EDITOR | MOTION | DESIGNER | PHOTOGRAPHER | PM | ACCOUNT | GENERAL
content_type       MOTION | STATIC | OTHER
client_status      ACTIVE | INACTIVE | ARCHIVED
project_status     DRAFT | ACTIVE | IN_PROGRESS | WAITING_FOR_CLIENT | COMPLETED | ARCHIVED
priority           LOW | MEDIUM | HIGH | URGENT
deliverable_status PENDING | IN_PROGRESS | READY_FOR_INTERNAL_REVIEW | UNDER_INTERNAL_REVIEW
                   | INTERNAL_APPROVED | UNDER_CLIENT_REVIEW | REVISION_REQUESTED | APPROVED | DELIVERED | ARCHIVED
fv_status          UPLOADED | UNDER_INTERNAL_REVIEW | INTERNAL_APPROVED | UNDER_CLIENT_REVIEW
                   | CHANGES_REQUESTED | APPROVED | REPLACED
fv_visibility      INTERNAL | CLIENT                 # client users only ever see CLIENT
stage_mode         SEQUENTIAL | PARALLEL
stage_type         INTERNAL | CLIENT
approval_decision  APPROVE | REQUEST_CHANGES | REJECT
comment_visibility INTERNAL | CLIENT_VISIBLE
anchor_type        NONE | TIMECODE | REGION | WAVEFORM_RANGE | VIEWPOINT_3D | WEB_SELECTOR
notification_type  PROJECT_CREATED | DELIVERABLE_CREATED | VERSION_UPLOADED | INTERNAL_REVIEW_REQUESTED
                   | SUBMITTED_TO_CLIENT | REVISION_REQUESTED | APPROVED | DELIVERED | COMMENT_ADDED | MENTION
                   | DUE_DATE_REMINDER | STAGE_STALLED | SHARE_VIEWED | ASSIGNMENT
activity_type      COMMENT | STATUS_CHANGE | APPROVAL | UPLOAD | ASSIGNMENT | STAGE_CHANGE | SHARE
custom_field_type  TEXT | NUMBER | SINGLE_SELECT | MULTI_SELECT | DATE | BOOLEAN | RATING
view_type          BOARD | LIST | CALENDAR | TIMELINE
rule_kind          RULE | CARD_BUTTON | BOARD_BUTTON | SCHEDULED | DUE_DATE
dependency_type    FS | SS | FF | SF                 # finish-start, start-start, finish-finish, start-finish
share_audience     INTERNAL | CLIENT | GUEST
share_watermark    NONE | STANDARD | FORENSIC
task_status        TODO | IN_PROGRESS | BLOCKED | DONE
recurrence_mode    TIME_DRIVEN | COMPLETION_DRIVEN     # cron-style OR new-instance-on-done (Odoo, v4 B3)
```

---

## 2. Identity & tenancy

### `agency`  — **Active: B1** — the tenant root
```
id, name, slug (unique, for white-label portal URL later), logoUrl?, brandColor?,
  betterAuthOrgId (unique → Better Auth organization), settings jsonb, createdAt, updatedAt, deletedAt
```
No `agencyId` (it *is* the tenant). Super-Admin can see all; everyone else is pinned to their own.

### `user`  — **Active: B1** — owned by Better Auth, extended by us
Better Auth owns `user/session/account/verification`. We add via `additionalFields`:
```
role user_role, specialty specialty?, agencyId text?  (null only for SUPER_ADMIN),
  clientId text?  (set for CLIENT_*),  permissions jsonb (fine-grained flags), createdAt, updatedAt, deletedAt
```
`permissions` flags (default by role, overridable): `canApprove, canInviteClients, canManageTeam,
canUploadFinal, canViewAllClients, canManageAutomations`.

### Better Auth plugin tables — **Active: B1** — generated, committed, migrated
`organization, member, invitation` (organization plugin) + admin-plugin tables. Generated by
`@better-auth/cli generate`. Agency staff membership/roles/invites live here; **client users do not become org
members** (§01 §5).

### `client`  — **Active: B1** — the client organization (first-class)
```
id, agencyId, name, companyName?, email?, phone?, website?, notes?, status client_status = ACTIVE,
  portalSlug?, createdByUserId, createdAt, updatedAt, deletedAt
```
Index `(agencyId, status)`. A client has many `user`s (CLIENT_OWNER/CLIENT_MEMBER via `user.clientId`).

### `audit_log`  — **Active: B1** — oversight + cross-tenant trail
```
id, actorUserId, agencyId? (the tenant acted upon; null for platform-level), action, targetType?, targetId?,
  meta jsonb, ip?, createdAt
```
Every Super-Admin cross-tenant action, every impersonation, every sensitive mutation writes here. Append-only
(no `deletedAt`).

### `outbox`  — **Active: B1** (seam S3) — transactional outbox
```
id, agencyId?, eventType, payload jsonb, status (PENDING|SENT|FAILED) = PENDING, attempts int = 0,
  availableAt timestamptz, createdAt, sentAt?
```
Written in the same tx as the state change it describes; a relay enqueues PENDING rows into BullMQ. The guarantee
behind "approval recorded ⇒ notification fires."

---

## 3. Work hierarchy

### `project`  — **Active: B1**
```
id, agencyId, clientId, parentProjectId? (self-relation → sub-project, 1 level, enforced in app),
  name, description?, brief?, type? (project-type string/enum-lite), status project_status = ACTIVE,
  priority priority = MEDIUM, startDate?, dueDate?, createdByUserId, createdAt, updatedAt, deletedAt
```
Index `(agencyId, clientId, status)`, `(parentProjectId)`. `project_status` is **derived/roll-up-aware** but
stored for fast filtering (recomputed by a service/automation, never hand-set inconsistently).

### `project_member`  — **Active: B1** — team assignment (project OR sub-project)
```
id, agencyId, projectId, userId, roleOnProject? ("lead"|"editor"|"reviewer"…), createdAt
unique(projectId, userId)
```
Drives the visibility record rule "assigned member can see this project."

### `deliverable`  — **Active: B1**
```
id, agencyId, clientId, projectId, contentType content_type = OTHER, title, description?,
  status deliverable_status = PENDING, priority priority = MEDIUM, assignedToUserId?, dueDate?,
  agencyNote?, clientNote?, submittedAt?, reviewedAt?, approvedAt?,
  createdByUserId, createdAt, updatedAt, deletedAt
```
Index `(agencyId, projectId, status)`, `(assignedToUserId)`. `clientId`/`projectId` denormalized for cheap
scoping and roll-ups. `contentType` drives role-based notification routing (03 §Notifications).
`projectId` is the deliverable's **home** project; **multi-homing** (a deliverable surfacing in other projects
without duplication — v4 B3) is via `deliverable_placement`. `status` is the **v1 default fixed pipeline**; once
the pipeline engine lands (B3) the stage set becomes data-driven (`pipeline_stage`) while this enum stays as the
default.

### `task` / `subtask`  — **Active: B5** (defined now) — multi-level work items (v4 B3)
```
id, agencyId, projectId?, deliverableId?, parentTaskId? (self → multi-level subtasks),
  title, status task_status = TODO, assignedToUserId?, dueDate?, position int,
  taskType? (Custom Task Type — LATER), createdByUserId, createdAt, updatedAt, deletedAt
```
The target of `comment.spawnedTaskId` — a requested change becomes a tracked subtask (v4 B8 comment→subtask).
Multiple assignees (v4 B3) via a `task_assignee` join when needed (LATER).

### `deliverable_placement`  — **Active: B5** (defined now) — multi-homing / cross-tagging (v4 B3)
```
id, agencyId, deliverableId, projectId, createdAt
unique(deliverableId, projectId)
```
One deliverable surfaces in many projects/views with **no duplication** (Asana multi-homing / Wrike cross-tagging).

### `milestone`  — **Active: B5** (defined now) — progress markers (v4 A1.2 / A2.1)
```
id, agencyId, projectId, name, dueDate?, reachedAt?, createdAt, updatedAt
```

### `dependency`  — **Active: B5** (defined now) — four types, not a boolean
```
id, agencyId, fromDeliverableId, toDeliverableId, type dependency_type = FS, createdAt
unique(fromDeliverableId, toDeliverableId, type)
```

### `checklist` / `checklist_item`  — **Active: B5** (defined now)
```
checklist:      id, agencyId, deliverableId, title, position int, createdAt
checklist_item: id, agencyId, checklistId, text, done bool=false, assignedToUserId?, dueDate?, position int
```

---

## 4. Files & versions

### `file_version`  — **Active: B2** (table defined in B1 for additivity; the slice references it read-only)
```
id, agencyId, deliverableId, versionNumber int (auto-increment per deliverable),
  label? ("v2.0" | "Director's Cut" | "Final-R3"), tags text[] (freeform, @-referenceable),
  isMinor bool = false (minor vs major semantics, Ziflow-style),
  fileUrl? (R2 object key), externalLink? (Drive/Frame.io/Vimeo…), previewUrl? (proxy mp4/thumbnail),
  fileName?, fileType? (mime/ext), fileSizeBytes bigint?, isSource bool = false (.prproj/.aep/.blend → download-only),
  visibility fv_visibility = INTERNAL,  status fv_status = UPLOADED,
  uploadedByUserId, createdAt, updatedAt, deletedAt
unique(deliverableId, versionNumber)
```
**Trust boundary lives here:** `visibility = INTERNAL` until the internal chain promotes it to `CLIENT`. Client
roles only ever receive `visibility = CLIENT` rows (field/row stripping in the guard).

### `upload_session`  — **Active: B2** (defined now) — resumable upload bookkeeping
```
id, agencyId, deliverableId, uploadKey (R2/tus), bytesTotal bigint?, bytesUploaded bigint=0,
  status (INIT|UPLOADING|COMPLETE|ABORTED), createdByUserId, createdAt, updatedAt
```

---

## 5. Review & approval (the wedge)

### `pipeline` / `pipeline_stage`  — **Active: B3** (seam S8; tables + default seeded in B1) — v4 B1 "pipelines are data, not code"
A **pipeline** is an ordered set of stages bound to a project type; agencies configure the flow instead of us
hardcoding it. `review_stage` rows are per-deliverable **instances** spun up from these templates.
```
pipeline:       id, agencyId, name, projectType?, isDefault bool, createdAt, updatedAt, deletedAt
pipeline_stage: id, agencyId, pipelineId, name, type stage_type, mode stage_mode = SEQUENTIAL, sequence int,
                requiresInternalApproval bool, requiresClientApproval bool, requiredFieldIds text[],
                wipLimit int?, isFolded bool = false, slaHours int?, requiredCount int = 1, createdAt, updatedAt
```
Block 1 seeds the **default pipeline** = two stages (INTERNAL → CLIENT) that reproduce the 03 §4 fixed chain;
Block 3 lets agencies edit stages, add parallel approvers, set WIP limits, and reorder — **additively**, with no
rewrite of the 03 §4 state machine.

### `review_stage`  — **Active: B3** (seam S8; per-deliverable instance, skeleton in B1)
A per-deliverable **instance** of a `pipeline_stage`. The default internal→client chain is two seeded stages.
```
id, agencyId, deliverableId (or pipeline template id later), name, type stage_type, mode stage_mode = SEQUENTIAL,
  order int, requiredCount int = 1 (how many approvers must sign off for PARALLEL),
  slaHours int?, escalateToUserId?, status (PENDING|ACTIVE|PASSED|REJECTED) = PENDING, createdAt, updatedAt
```

### `review_stage_approver`  — **Active: B3** (defined now)
```
id, agencyId, reviewStageId, userId, createdAt
unique(reviewStageId, userId)
```

### `approval`  — **Active: B3** (the internal-chain decision in B1 is a degenerate single-stage case)
Immutable audit rows — one per decision.
```
id, agencyId, deliverableId, fileVersionId, reviewStageId?, decidedByUserId,
  decision approval_decision, feedback?, eSignature? (typed-name/hash for compliant sign-off, Ziflow-style),
  decidedAt, createdAt
```
No `updatedAt`/`deletedAt` — decisions are append-only history.

### `comment`  — **Active: B3** (table in B1; the slice has none)
```
id, agencyId, deliverableId, fileVersionId?, parentId? (threading), userId, message,
  visibility comment_visibility = CLIENT_VISIBLE,
  anchorType anchor_type = NONE,
  anchor jsonb?  ( TIMECODE:{ms} | REGION:{x,y,w,h,frameMs?} | WAVEFORM_RANGE:{startMs,endMs}
                   | VIEWPOINT_3D:{...} | WEB_SELECTOR:{...} ),
  refVersionIds text[] (versions @-referenced, e.g. "@v2 vs @v1"),
  attachments jsonb?, reactions jsonb?, resolvedAt?, spawnedTaskId? (comment→subtask link),
  createdAt, updatedAt, deletedAt
```

### `share`  — **Active: B3** (seam S12; table in B1) — governed guest/client link
```
id, agencyId, resourceType (DELIVERABLE|FILE_VERSION|PROJECT|COLLECTION), resourceId,
  token (unique, URL slug), passphraseHash?, expiresAt?, allowComment bool=true, allowDownload bool=false,
  watermark share_watermark = NONE, audience share_audience = CLIENT, viewCount int=0,
  createdByUserId, createdAt, updatedAt, deletedAt
```

---

## 6. Collaboration, activity & notifications

### `activity_event`  — **Active: B4** (seam S6; table in B1) — Chatter-style per-record feed
```
id, agencyId, subjectType (DELIVERABLE|FILE_VERSION|PROJECT), subjectId, type activity_type,
  actorUserId?, summary, meta jsonb?, createdAt
```
Append-only; the unified human-readable timeline on a deliverable/version (separate from chat).

### `message` / `channel`  — **Active: B4** (defined now) — real-time chat
```
channel: id, agencyId, scopeType (PROJECT|DELIVERABLE|DM), scopeId?, name?, createdAt
message: id, agencyId, channelId, userId, body, refVersionIds text[] (drag-a-version-into-chat),
         attachments jsonb?, parentId? (threads), createdAt, updatedAt, deletedAt
```

### `notification`  — **Active: B1** (seam S6; write path live in B1, fan-out in B4)
```
id, agencyId?, recipientUserId?, recipientRole user_role?, type notification_type, title, message?,
  url?, contentType content_type? (route MOTION vs STATIC), relatedProjectId?, relatedDeliverableId?,
  isRead bool=false, readAt?, createdAt
```
Supports user-targeted **or** role-broadcast (kept from the original build's decent design).

### `push_subscription`  — **Active: B1** (seam S6; used by B4 fan-out) — Web Push
```
id, agencyId?, userId, endpoint (unique), p256dh, auth, userAgent?, createdAt, lastUsedAt?
```

---

## 7. Customization engines (built now, exposed later)

### `custom_field_def` / `custom_field_value`  — **Active: B5** (seam S7; tables + built-ins seeded in B1)
Even "built-in" fields are modeled as typed defs so user-defined fields (B8) slot in with zero migration.
```
custom_field_def:   id, agencyId, scope (DELIVERABLE|PROJECT), key, label, type custom_field_type,
                    options jsonb? (for selects), groupable bool, filterable bool, sortable bool,
                    visibility (INTERNAL|CLIENT), isBuiltIn bool, position int, createdAt, updatedAt
custom_field_value: id, agencyId, fieldDefId, entityType, entityId, value jsonb, createdAt, updatedAt
unique(fieldDefId, entityType, entityId)
```
Seeded built-ins: Content Type, Platform, Aspect Ratio, Campaign (+ Status/Rating/Due exist as first-class
columns where hot).

### `saved_view`  — **Active: B5** (seam S9; table in B1)
```
id, agencyId, ownerUserId?, scope (PROJECT|GLOBAL|MY_WORK), scopeId?, name, viewType view_type,
  filterJson jsonb, sortJson jsonb, groupBy?, visibleFieldIds text[], isShared bool=false, position int, createdAt
```

### `template_pack` / `template_item`  — **Active: B6** (defined now) — Asana "Bundles"
```
template_pack: id, agencyId, name, description?, payload jsonb (fields+stages+rules+task templates), createdAt
```
A syncable set applied across projects.

### `recurring_schedule`  — **Active: B6** (defined now) — retainer auto-generation (v4 B5 / B3 recurrence two ways)
```
id, agencyId, scope (PROJECT|DELIVERABLE), templatePackId?, sourceProjectId?, cadence (rrule/cron),
  mode recurrence_mode = TIME_DRIVEN, nextRunAt?, lastRunAt?, enabled bool = true, createdAt, updatedAt
```
Worker generates the period's deliverables for a retainer (time-driven), **or** spawns the next instance when the
prior is marked done (completion-driven, Odoo).

---

## 8. Automation & intake (built now, executed later)

### `rule`  — **Active: B6** (seam S10; table + compiler interface in B1)
```
id, agencyId, name, kind rule_kind, enabled bool=true, scope (PROJECT|AGENCY), scopeId?,
  trigger jsonb, conditions jsonb (and/or + otherwise-if forks), actions jsonb (incl. HTTP_REQUEST), createdAt
```
Executed by the worker off the outbox/event bus (B6). Note Asana's per-project cap as a sanity limit.

### `intake_form` / `form_field` / `form_submission`  — **Active: B6** (seam S11; tables in B1)
```
intake_form:     id, agencyId, name, slug (public), targetConfig jsonb (assignees/template/stage/approvals), createdAt
form_field:      id, agencyId, formId, key, label, type custom_field_type, required bool, branchingJson jsonb?,
                 mapToField? (answer→field mapping), position int
form_submission: id, agencyId, formId, answers jsonb, status (QUEUED|PROVISIONED|REJECTED)=QUEUED,
                 createdProjectId?, createdAt
```
Submissions land in a **request-queue** lane (Workfront pattern), not a loose task.

---

## 9. Relationship map (ASCII)

```
agency 1───* client 1───* user(CLIENT_*)                 agency 1───* user(AGENCY_*/member)
   │                                                      agency 1───* pipeline 1───* pipeline_stage (templates)
   └─* project ──self──* project(sub)                     agency 1───* audit_log / outbox / notification
         │   ├─* project_member *──1 user                 agency 1───* custom_field_def / saved_view / rule
         │   ├─* milestone                                agency 1───* template_pack / recurring_schedule
         │   └─* deliverable  *──* project  (multi-home via deliverable_placement)
               ├─* file_version 1───* approval
               │        │      └───* comment (anchored, threaded, @version-ref)
               │        └──* (visibility gate: INTERNAL → CLIENT)
               ├─* review_stage 1───* review_stage_approver   (instances of pipeline_stage)
               ├─* task ──self──* task (subtasks)   ←─ comment.spawnedTaskId
               ├─* comment / activity_event / dependency / checklist
               └─* share
```

## 10. Migration & additivity policy

- **One schema, defined now.** All tables above exist after Block 1's migrations even though most are unused.
  Activating Block N = writing its module + seeding/using its tables, **not** a structural migration.
- **Expand/contract for any change** (01 §14, repo-conventions §7): add nullable, backfill, switch reads, drop
  later — never destructive in one deploy.
- **Forward-only, code-reviewed migrations**, run by a one-shot `drizzle-kit migrate` step, verified on a Neon
  branch in CI before merge.
- **`agencyId` is non-negotiable** on new tenant tables; a new table without it fails review (breaks the guard).
- **Enums are append-only** in spirit; renaming a value is an expand/contract dance, not an in-place edit.
- Finance/billing tables are intentionally absent but the additive policy guarantees they slot in later.
