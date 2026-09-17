# Creative Dock — v1 Local-First MVP Build Spec

> **Status:** Approved scope, ready for implementation planning · **Date:** 2026-06-29
> **Audience:** The engineer/LLM implementing v1 from a clean repository.
> **Source of product truth:** `docs/creative-dock-enhanced-build-plan-v4.md` (full competitive research + eventual feature universe).
> **This document** is the *buildable contract* for v1 — it states exactly what to build, how, and how to verify it.
> Nothing here is aspirational; every item is in-scope for v1 unless explicitly listed under **Non-Goals**.

---

## 0. TL;DR

Creative Dock is an operating system for creative agencies. Its differentiator ("the wedge") is a
Frame.io-grade **review & approval engine** with frame/region/waveform-accurate anchored comments.

We are building a **fresh repository**, reusing the **proven stack, visual design, app name, and domain
model** from the existing `rexops` repo, but rebuilt cleanly and scoped to a **local-first MVP with zero
cloud-key dependencies**. v1 = **Spine + Review Wedge**: the smallest cut that proves the differentiator
end-to-end, runnable entirely on a developer laptop (Postgres + Redis + local disk).

**The v1 vertical slice:** an agency user uploads a deliverable (image / PDF / video / audio) → the worker
transcodes it → agency leaves anchored internal comments and approves → version is promoted to the client →
a logged-in client user reviews, leaves anchored comments, and Approves / Requests Changes / Rejects → the
decision is recorded to an immutable audit trail and surfaced in notifications + the deliverable's activity feed.
Throughout, hard multi-tenant isolation and INTERNAL-vs-CLIENT visibility are enforced.

---

## 1. Scope Decisions (LOCKED)

| Decision | Choice | Rationale |
|---|---|---|
| v1 breadth | **Spine + Review Wedge** | Smallest cut that proves the core product/differentiator. |
| Build strategy | **Fresh repo, same stack**, salvage old visual design + app name + domain model | Drop the drifted implementation, keep proven choices. |
| Media coverage | **Image + PDF + Video + Audio** (all four) | Complete, credible review surface. 3D + live-web deferred. |
| Approval routing | **Fixed Internal → Client** (two stages) | Schema additive; configurable sequential/parallel stages come later. |
| Client access | **Logged-in client users only** | No anonymous guest share links / governance in v1. |
| Storage | **Local filesystem** | No Cloudflare R2 / S3. |
| Realtime | **None** (poll/refetch) | No Liveblocks in v1. |
| Notifications | **In-app inbox only** | No VAPID web-push. |
| Auth | **Email + password only** (better-auth) | No Google OAuth. |
| Observability | **Pino logs only** | No Sentry / PostHog. |
| Email | **None** (log to console where an email would send) | No Resend. |

---

## 2. Non-Goals (Deferred — schema stays additive)

These are **out of scope for v1**. The data model must not *preclude* them, but no code is written for them now:

- Automation engine (rules / buttons / scheduled / due-date commands, HTTP actions, recipe gallery)
- Intake forms + branching + request queue + auto-provisioning
- Templates / blueprints / bundles (template packs) and recurring schedules
- Task dependencies (FS/SS/FF/SF) and the Timeline / Calendar / Gantt views
- User-defined custom fields (built-in fields only; engine can be minimal)
- Real-time presence / live cursors / collaborative updates (Liveblocks)
- Web-push notifications (VAPID), email notifications (Resend)
- Guest share links + governance (passphrase / expiry / download toggles / watermarking / forensic DRM)
- Electronic-signature sign-off; stalled-review escalation
- Analytics dashboards (turnaround, burndown, workload, portfolio roll-up)
- Chat channels / DMs / threads (the activity feed is in; standalone chat is not)
- Comment → tracked subtask loop (v1 uses comment resolve/unresolve state instead)
- 3D model review and live-web/HTML proofing
- Multi-homing, milestones, "My Work" portfolio layer, multiple assignees

---

## 3. Architecture & Repository Layout

Bun workspaces + Turborepo monorepo. Same shape as the old repo, trimmed to v1.

```
creative-dock/
├── apps/
│   ├── api/                 # Elysia (Bun) HTTP API — domain modules
│   ├── web/                 # React 19 + Vite SPA (salvage old design/CSS)
│   └── worker/              # BullMQ worker — ffmpeg media pipeline + outbox relay
├── packages/
│   ├── db/                  # Drizzle schema (split by domain), migrations, seed
│   ├── auth/                # better-auth config (email/password)
│   ├── core/                # tenancy guard, RBAC, review state machine (pure logic)
│   ├── config/              # env validation (zod), shared constants, feature flags
│   ├── validators/          # Zod DTOs shared by api + web
│   ├── ui/                  # shared React components (salvage)
│   └── jobs/                # BullMQ queue definitions + job payload types
├── docker/                  # Dockerfiles (api, web, worker) + Caddyfile
├── docs/                    # this spec + v4 research
├── docker-compose.yml       # postgres + redis + (api/web/worker profiles)
├── turbo.json               # task pipeline
├── biome.json               # lint/format
├── package.json             # workspace root (packageManager: bun@1.3.x)
└── tsconfig.json
```

**The type spine (must be preserved):**
`Drizzle schema → inferred row types → Zod DTOs (packages/validators) → Elysia routes (apps/api) →
Eden Treaty type-safe client (apps/web)`. The frontend never hand-writes request/response types.

### 3.1 Tech stack (versions are "≥, match old repo where sane")

| Concern | Choice |
|---|---|
| Runtime / package manager | Bun 1.3.x |
| Monorepo orchestration | Turborepo |
| API framework | Elysia + `@elysiajs/cors`, `@elysiajs/openapi`, `@elysiajs/eden` |
| Frontend | React 19, Vite, TanStack Router, TanStack Query |
| ORM / DB | Drizzle ORM + `postgres` driver + Postgres 16 |
| Auth | better-auth (Drizzle adapter, email/password + admin plugin) |
| Jobs | BullMQ on Redis 7 |
| Media | ffmpeg (in worker container) |
| Viewers (web) | video.js (video), wavesurfer.js (audio), pdfjs-dist (PDF), @annotorious/react (image) |
| Lint/format | Biome |
| Logging | Pino |
| IDs | cuid2 (text PKs) |
| Validation | Zod |

---

## 4. Local-First Infrastructure

Docker Compose provides exactly three things — all local, none keyed:

- **postgres:16-alpine** — port 5432 (`creativedock` / `creativedock` / db `creativedock`)
- **redis:7-alpine** — port 6379 (BullMQ broker)
- **Local disk volume** — bind-mounted directory for object storage (`./.data/object-storage`)

App services (`api`, `web`, `worker`) run via `bun run dev` (Turbo) for development, and have Dockerfiles
for parity. The app **must boot and run a full happy path with no environment variables beyond the local
defaults** — if any cloud key is required to start, that is a bug.

### 4.1 Environment variables (`.env.example`)

```bash
NODE_ENV=development
API_PORT=3000
API_URL=http://localhost:3000
WEB_URL=http://localhost:8080

# Auth (local secret, not a cloud key)
BETTER_AUTH_SECRET=dev-secret-change-me-min-32-chars-long-0001
BETTER_AUTH_URL=http://localhost:3000

# Database
DATABASE_URL=postgres://creativedock:creativedock@localhost:5432/creativedock
DATABASE_URL_UNPOOLED=postgres://creativedock:creativedock@localhost:5432/creativedock

# Redis / jobs
REDIS_URL=redis://localhost:6379

# Local object storage (replaces R2)
LOCAL_STORAGE_DIRECTORY=.data/object-storage
LOCAL_STORAGE_SIGNING_SECRET=dev-signing-secret-min-32-chars-long-0001

# Worker concurrency
MEDIA_WORKER_CONCURRENCY=2
NOTIFY_WORKER_CONCURRENCY=8

# Frontend (Vite)
VITE_API_URL=http://localhost:3000

# Feature flags (v1 — all wedge-relevant ON, deferred blocks OFF)
FEATURE_FILES_VERSIONING=true
FEATURE_REVIEW_WEDGE=true
FEATURE_COLLABORATION_LIVE=false
FEATURE_WORK_VIEWS=true
FEATURE_AUTOMATION=false
FEATURE_ANALYTICS=false
```

**Explicitly absent** (and no code path may require them): `R2_*`, `LIVEBLOCKS_*`, `VAPID_*`,
`RESEND_*`, `GOOGLE_*`, `SENTRY_*`, `POSTHOG_*`.

---

## 5. Domain Model (v1 schema)

Drizzle, split by domain file under `packages/db/src/schema/`. All PKs are `text` cuid2. Every
tenant-owned row carries `agencyId` for hard isolation. Every user-data table has
`createdAt`, `updatedAt`, and soft-delete `deletedAt timestamp null`. Queries default to
`deletedAt IS NULL`.

### 5.1 Enums (`enums.ts`)

```
user_role:        SUPER_ADMIN | AGENCY_OWNER | AGENCY_ADMIN | AGENCY_MEMBER | CLIENT_OWNER | CLIENT_MEMBER
specialty:        EDITOR | MOTION | DESIGNER | PHOTOGRAPHER | PM | ACCOUNT | GENERAL
content_type:     MOTION | STATIC | OTHER
priority:         LOW | MEDIUM | HIGH | URGENT
deliverable_status: PENDING | IN_PROGRESS | READY_FOR_INTERNAL_REVIEW | UNDER_INTERNAL_REVIEW
                  | INTERNAL_APPROVED | UNDER_CLIENT_REVIEW | REVISION_REQUESTED | APPROVED | DELIVERED | ARCHIVED
fv_status:        UPLOADED | PROCESSING | READY | UNDER_INTERNAL_REVIEW | INTERNAL_APPROVED
                  | UNDER_CLIENT_REVIEW | CHANGES_REQUESTED | APPROVED | REPLACED
fv_visibility:    INTERNAL | CLIENT
review_stage_kind: INTERNAL | CLIENT
approval_decision: APPROVE | REQUEST_CHANGES | REJECT
comment_visibility: INTERNAL | CLIENT_VISIBLE
comment_anchor_type: NONE | TIMECODE | REGION | WAVEFORM_RANGE
media_kind:       IMAGE | PDF | VIDEO | AUDIO
notification_type: PROJECT_CREATED | DELIVERABLE_ASSIGNED | VERSION_UPLOADED | INTERNAL_REVIEW_REQUESTED
                  | SUBMITTED_TO_CLIENT | REVISION_REQUESTED | APPROVED | DELIVERED | COMMENT_ADDED | MENTION
activity_kind:    VERSION_UPLOADED | STATUS_CHANGED | COMMENT_ADDED | DECISION_RECORDED | PROMOTED_TO_CLIENT
```

### 5.2 Identity & tenancy (`identity.ts`)

- **agency** — `id, name, slug (unique), brandColor?, betterAuthOrgId?, createdAt, updatedAt, deletedAt`
- **client** — `id, agencyId→agency, name, contactEmail?, createdAt, updatedAt, deletedAt`
- **user** — extends better-auth user: `id, email, name, role(user_role), specialty(specialty)?,
  agencyId→agency (null only for SUPER_ADMIN), clientId→client (set only for CLIENT_*),
  permissions jsonb (flags below), createdAt, updatedAt, deletedAt`
  - `permissions` flags: `{ canApprove, canInviteClients, canManageTeam, canUploadFinal, canViewAllClients }`
- better-auth tables: **session, account, verification** (managed by better-auth Drizzle adapter)
- **audit_log** — `id, agencyId?, actorUserId, action, targetType, targetId, metadata jsonb,
  ip?, userAgent?, createdAt` (immutable; one row per sensitive/cross-tenant mutation + super-admin view-as)

### 5.3 Work hierarchy (`work.ts`)

- **project** — `id, agencyId, clientId→client, name, description?, status, createdById, createdAt, updatedAt, deletedAt`
- **project_member** — `id, projectId, userId, roleInProject?, createdAt` (drives "assigned-member" record rule)
- **deliverable** — `id, agencyId, projectId, title, description?, contentType, status(deliverable_status),
  priority, assignedToUserId?, dueDate?, notes? (INTERNAL), createdById, createdAt, updatedAt, deletedAt`

### 5.4 Files & versioning (`files.ts`)

- **file_version** — `id, agencyId, deliverableId, versionNumber int (auto-increment per deliverable),
  label? (e.g. "v1.1"), isMajor bool, mediaKind(media_kind), status(fv_status), visibility(fv_visibility),
  sourceKey text (storage key of original), mimeType, sizeBytes, durationMs? (video/audio),
  width?/height? (image/video), createdById, createdAt, updatedAt, deletedAt`
- **file_artifact** — derived outputs from the worker:
  `id, fileVersionId, kind ('mp4'|'poster'|'sprite'|'waveform'|'thumb'|'resized'), storageKey, mimeType,
  meta jsonb (e.g. sprite tile grid, waveform peaks length), createdAt`
- **upload_session** — resumable bookkeeping:
  `id, agencyId, deliverableId, uploadKey, mimeType, sizeBytesTotal, bytesUploaded, status('OPEN'|'COMPLETED'|'ABORTED'),
  createdById, createdAt, updatedAt`

### 5.5 Review & approval (`review.ts`)

- **review_run** — one per file_version under review:
  `id, agencyId, deliverableId, fileVersionId, currentStage(review_stage_kind), status, createdAt, updatedAt`
- **review_stage** — the two fixed stages instantiated per run:
  `id, reviewRunId, kind(review_stage_kind), order int, status('PENDING'|'ACTIVE'|'COMPLETED'),
  activatedAt?, completedAt?`
- **approval** — immutable decision audit row:
  `id, agencyId, reviewRunId, reviewStageId, decision(approval_decision), decidedByUserId, feedback?,
  ip?, userAgent?, createdAt`
- **comment** — threaded, anchored:
  `id, agencyId, deliverableId, fileVersionId, parentCommentId? (thread), authorUserId, body text,
  visibility(comment_visibility), anchorType(comment_anchor_type), anchor jsonb (shape per type, §8.2),
  mentions text[] (userIds), resolved bool default false, resolvedByUserId?, resolvedAt?, createdAt, updatedAt, deletedAt`
- **comment_reaction** — `id, commentId, userId, emoji, createdAt` (unique on commentId+userId+emoji)
- **comment_attachment** — `id, commentId, storageKey, fileName, mimeType, sizeBytes, createdAt`

### 5.6 Views, notifications, activity (`collab.ts`)

- **saved_view** — `id, agencyId, ownerUserId?, scope ('AGENCY'|'PROJECT'), projectId?, name,
  viewType ('BOARD'|'LIST'), filterJson jsonb, sortJson jsonb, groupBy?, visibleFieldIds text[],
  isShared bool, createdAt, updatedAt`
- **notification** — `id, agencyId, userId, type(notification_type), title, body?, linkPath?,
  readAt? null, createdAt`
- **activity_event** — `id, agencyId, deliverableId, fileVersionId?, kind(activity_kind), actorUserId?,
  summary text, meta jsonb, createdAt` (append-only)

### 5.7 Async outbox (`outbox.ts`)

- **outbox** — `id, agencyId?, eventType, payload jsonb, status('PENDING'|'PROCESSED'|'FAILED'),
  attempts int, availableAt timestamp, processedAt?, createdAt`
  - Written **in the same DB transaction** as the domain mutation. The worker's relay polls
    `PENDING AND availableAt <= now()` and enqueues the corresponding BullMQ job, then marks `PROCESSED`.

---

## 6. Multi-Tenancy & RBAC (the guard) — `packages/core`

Implement the Odoo two-layer model as **one composable layer**, not per-endpoint checks.

### 6.1 Principal

Derived once per request from the better-auth session by the API's `auth-guard` plugin:

```ts
type Principal = {
  userId: string
  role: UserRole
  specialty?: Specialty
  agencyId: string | null        // null only for SUPER_ADMIN
  clientId: string | null        // set only for CLIENT_* roles
  permissions: PermissionFlags
  impersonating?: { realUserId: string } // super-admin view-as
}
```

### 6.2 Access rights (model-level CRUD)

A static table `accessRights[role][resource] = { read, write, create, delete }`. Coarse gate: "can this
role touch this table at all". Additive in spirit (v1 has no group-union complexity since one role per user).

### 6.3 Record rules (row-level)

Composed exactly like Odoo:

- **Global rule (ALWAYS ANDed, non-bypassable):** `row.agencyId === principal.agencyId`.
  → hard tenant isolation. The **only** exemption is `SUPER_ADMIN` (and every such access is `audit_log`-ged).
- **Group rules (ORed, then ANDed with global):**
  `isOwnerOrAdmin(principal) OR isAssignedProjectMember(principal, row) OR isClientOfRecord(principal, row)`.
- Helpers live in `packages/core/src/tenancy/` and are unit-tested.

### 6.4 Field-level visibility

When serializing for a `CLIENT_*` principal:
- Drop `file_version` rows with `visibility = INTERNAL`.
- Drop `comment` rows with `visibility = INTERNAL`.
- Drop INTERNAL deliverable fields (`notes`) and any INTERNAL activity events.

### 6.5 Critical rule: existence hiding

A cross-tenant (or otherwise unauthorized) access to an existing id returns **HTTP 404, not 403** — never
reveal that a resource exists in another tenant.

### 6.6 Super-admin

Sole principal exempt from the global rule. Provides read-only **view-as** impersonation. Every cross-tenant
read/write writes an `audit_log` row.

---

## 7. Authentication — `packages/auth`

- better-auth with the **Drizzle adapter**, **email + password** (min 8 chars), and the **admin plugin**
  for super-admin. Organization plugin optional — agencies map to `agency` table directly; only adopt the
  org plugin if it reduces work, otherwise keep agency membership in our own tables.
- **No Google OAuth, no email verification flow that requires sending mail** (verification can be auto-confirmed
  in dev, or gated behind a console-logged token).
- Session → `Principal` enrichment happens in `apps/api/src/plugins/auth-guard.ts` by joining the better-auth
  user to our `user` row (role/agencyId/clientId/permissions).
- Auth routes are mounted under `/api/auth/*` (better-auth handler). Sign-up in v1 is **invite/seed driven**
  for agency + client users (no open public registration), created by the agency or seeded.

---

## 8. The Review Wedge (the differentiator) — mechanics

### 8.1 Lifecycle (fixed Internal → Client)

1. Agency uploads a `file_version` (status `UPLOADED`) → worker processes → `READY`.
2. Agency **submits to internal review** → creates `review_run` with two `review_stage` rows
   (`INTERNAL` order 0 ACTIVE, `CLIENT` order 1 PENDING); deliverable → `UNDER_INTERNAL_REVIEW`;
   file_version → `UNDER_INTERNAL_REVIEW`.
3. Agency approver records a decision on the INTERNAL stage:
   - `APPROVE` → INTERNAL stage `COMPLETED`; **promote** version `visibility = CLIENT`; CLIENT stage `ACTIVE`;
     deliverable → `UNDER_CLIENT_REVIEW`; file_version → `UNDER_CLIENT_REVIEW`. Notifies client-of-record.
   - `REQUEST_CHANGES` / `REJECT` → deliverable → `REVISION_REQUESTED`; file_version → `CHANGES_REQUESTED`.
4. Client approver records a decision on the CLIENT stage:
   - `APPROVE` → CLIENT stage `COMPLETED`; deliverable → `APPROVED`; file_version → `APPROVED`.
   - `REQUEST_CHANGES` / `REJECT` → deliverable → `REVISION_REQUESTED`; file_version → `CHANGES_REQUESTED`.
5. Every decision writes an immutable `approval` row (who/when/feedback/ip/ua) and an `activity_event`.
6. Uploading a new file_version supersedes the prior (`REPLACED`) and starts the loop again.

The state machine is a **pure function** in `packages/core/src/review/state-machine.ts`
(`(currentState, event) → nextState | error`), unit-tested exhaustively. Services call it; they never
hardcode transitions inline.

### 8.2 Per-medium anchored comments

`comment.anchorType` + `comment.anchor` (jsonb) carry the medium-specific location:

| mediaKind | anchorType | anchor shape | viewer |
|---|---|---|---|
| VIDEO | `TIMECODE` | `{ timeMs: number, region?: { x,y,w,h } }` (normalized 0..1) | video.js + overlay canvas |
| IMAGE | `REGION` | `{ region: { x,y,w,h } }` or `{ point: { x,y } }` (normalized) | @annotorious/react |
| PDF | `REGION` | `{ page: number, region: { x,y,w,h } }` (normalized to page) | pdfjs-dist + overlay |
| AUDIO | `WAVEFORM_RANGE` | `{ startMs: number, endMs: number }` | wavesurfer.js regions |
| any | `NONE` | `{}` (general comment) | — |

Comments support: threaded replies (`parentCommentId`), `@mentions` (parsed → `mentions[]` → notifications),
emoji reactions, attachments (local storage), `visibility` toggle (INTERNAL vs CLIENT_VISIBLE — INTERNAL
never shown to client principals), and `resolved` state (v1's lightweight substitute for comment→subtask).

### 8.3 Version compare

Endpoint returns two file_versions + their artifacts; the web renders them side-by-side. For video, both
players share a synced scrub controller (playhead broadcast in component state). For image/PDF, side-by-side
with shared zoom where feasible (zoom-sync is a stretch; side-by-side is the baseline requirement).

---

## 9. Object Storage (local filesystem)

Reuse the old `DevelopmentObjectStorage` pattern as the **only** backend in v1
(`apps/api/src/modules/file-versions/storage.ts`):

- A storage interface: `putObject(key, stream, meta)`, `getObject(key)`, `createSignedGetUrl(key, ttl)`,
  `createSignedPutUrl(key, ttl)`, `headObject(key)`, `deleteObject(key)`.
- Backed by `LOCAL_STORAGE_DIRECTORY`. Signed URLs are local HMAC tokens (`LOCAL_STORAGE_SIGNING_SECRET`)
  validated by a dedicated API route (`GET /api/storage/:key?sig=…&exp=…`), so the browser never needs cloud creds.
- **Upload flow (resumable-friendly):**
  1. `POST /api/file-versions/uploads/initiate` → creates `upload_session`, returns `{ uploadSessionId, uploadKey, putUrl }`.
  2. Browser PUTs bytes to the signed local URL (single or chunked; chunked appends to a temp file).
  3. `POST /api/file-versions/uploads/:id/complete` → finalizes, creates `file_version (status=UPLOADED)`,
     writes an `outbox` event `media.process`.
- **Serving:** `GET /api/file-versions/:id/download-url`, `…/preview-url`, `…/poster`, `…/sprite`,
  `…/waveform` return signed local URLs to the relevant `file_artifact`.

---

## 10. Worker & Media Pipeline — `apps/worker`

BullMQ queues (`packages/jobs/src/queues.ts`): `cd-media`, `cd-notify`. (No automation queue in v1.)

- **Relay** (`relay.ts`): polls `outbox` every ~2s, enqueues jobs, marks processed. Idempotent on restart.
- **Media processor** (`processors/media.ts`) — needs `ffmpeg` in the container:
  - **VIDEO** → MP4 (libx264, `-preset veryfast -crf 28 -movflags +faststart`, scale ≤1280p) +
    poster frame (JPEG) + scrub sprite sheet (tiled thumbnails, store grid meta in `file_artifact.meta`) +
    probe `durationMs/width/height`.
  - **AUDIO** → waveform PNG (`showwavespic=s=1280x240`) + probe `durationMs` + optional peaks JSON for wavesurfer.
  - **IMAGE** → resized JPEG (≤1280p longest edge) + thumbnail; probe `width/height`.
  - **PDF** → no transcode; mark `READY` (PDF.js renders client-side).
  - On success: set `file_version.status = READY`, write `file_artifact` rows, write `activity_event`,
    write a `version.ready` outbox/notify event.
- **Notify processor** (`processors/notify.ts`): consumes domain events → writes `notification` rows
  (in-app only). No web-push, no email.

---

## 11. API Surface — `apps/api`

Elysia app (`app.ts`) mounts domain modules; `index.ts` boots the Bun server. Each module is
`{module}.routes.ts` + `{module}.service.ts` + `{module}.test.ts`. OpenAPI auto-generated. Eden client
exported for the web app. **Every** non-public route runs through `auth-guard` (Principal) and services
**always** apply `scopeAgency(principal)` + record rules — no raw queries.

Health: `GET /healthz`, `GET /readyz`.

| Module | Representative endpoints |
|---|---|
| **auth** | `/api/auth/*` (better-auth: sign-in, sign-out, session) |
| **agencies** | `GET/POST /api/agencies`, `GET/PATCH /api/agencies/:id`, members CRUD |
| **clients** | `GET/POST /api/clients`, `GET/PATCH /api/clients/:id`, client-user CRUD |
| **projects** | `GET/POST /api/projects`, `GET/PATCH /api/projects/:id`, `POST /api/projects/:id/members` |
| **deliverables** | `GET/POST /api/deliverables`, `GET/PATCH /api/deliverables/:id`, `POST /api/deliverables/:id/transition` |
| **file-versions** | uploads `initiate`/`:id/complete`; `GET /api/file-versions/deliverable/:id`; per-artifact url endpoints |
| **reviews** | `POST /api/reviews/deliverables/:id/submit-internal`; `POST /api/reviews/runs/:id/decision`; `GET /api/reviews/deliverables/:id/run`; `GET/POST /api/reviews/deliverables/:id/comments`; comment reactions / resolve / attachments; `GET /api/reviews/compare?a=…&b=…` |
| **views** | `GET/POST/PATCH/DELETE /api/views` (saved BOARD/LIST views) |
| **notifications** | `GET /api/notifications`, `POST /api/notifications/:id/read`, `POST /api/notifications/read-all` |
| **activity** | `GET /api/activity/deliverable/:id` |
| **storage** | `GET /api/storage/:key` (signed local fetch), `PUT` signed upload target |
| **admin** | `GET /api/admin/agencies`, `POST /api/admin/impersonate/:userId` (super-admin only, audit-logged) |

Route gating: modules behind a disabled feature flag **404**. v1 flags on: files-versioning, review-wedge,
work-views.

---

## 12. Frontend — `apps/web`

React 19 + Vite + TanStack Router/Query. **Salvage the old visual design**: copy `apps/web/src/**` CSS and
the route/component shells, then rewire data to the new Eden client. No realtime; data freshness via Query
refetch/invalidation after mutations.

### 12.1 Routes

- Public/auth: `/login`
- **Agency surface:**
  - `/agency/dashboard` — pending internal reviews, awaiting-client, deadlines (simple roll-up; no charts)
  - `/agency/projects` — project list
  - `/agency/work` — **Board + List** over deliverables (saved views: filter/sort/group/visible-fields)
  - `/agency/deliverable/:id` — detail + **review room** (viewer + comments + decisions + version list + compare)
  - `/agency/inbox` — notifications
  - `/agency/clients` — client + client-user management
- **Client surface (stripped):**
  - `/client/home` — "what needs my review / awaiting my feedback" list
  - `/client/deliverable/:id` — review room (CLIENT-visible versions/comments only)
- **Admin (super-admin):** `/admin/agencies` (+ view-as), `/admin/audit`

### 12.2 Review room components (the heart of the UI)

- A **viewer registry** keyed by `mediaKind` → renders video.js / @annotorious / pdfjs / wavesurfer.
- An **anchor capture** layer: clicking/scrubbing produces the medium-specific `anchor` payload (§8.2).
- A **comment panel**: threaded list, anchor chips (click → seek/scroll to anchor), reactions, resolve,
  INTERNAL/CLIENT visibility toggle (agency only), @mention autocomplete, attachment upload.
- A **decision bar**: Approve / Request Changes / Reject + feedback (shown to the active stage's approver).
- A **version switcher** + **compare** toggle (pick two versions → side-by-side).

Vite manual chunks (as in old repo): `proof-pdf`, `proof-video`, `proof-image`, `proof-audio`, `tanstack`,
`icons`, `vendor`.

---

## 13. Notifications & Activity

- **Domain event → `notification` row** (via notify processor), routed by role + content type
  (MOTION→motion specialists, STATIC→designers) and by relationship (assignee, client-of-record, approver).
- In-app inbox UI with unread badge; mark-read / mark-all-read. **No push, no email.**
- **`activity_event`** appended on upload, status change, comment, decision, promotion — rendered as a feed
  on the deliverable detail page (INTERNAL events hidden from clients).

---

## 14. Seed Data

`packages/db` seed creates a canonical demo tenant so the app is usable immediately:

- Agency **"T-Rex Media"** (slug `t-rex-media`)
- Users: 1 AGENCY_OWNER, 1 AGENCY_MEMBER (MOTION), 1 AGENCY_MEMBER (DESIGNER) — known passwords
- 1 client **"Apex Brands"** with 1 CLIENT_OWNER, 1 CLIENT_MEMBER
- 1 project with 2 deliverables (one MOTION, one STATIC), no file versions yet
- 1 SUPER_ADMIN platform user

---

## 15. Testing Strategy

Bun test runner. Mirror the old repo's discipline — **every API module** has: happy-path, validation
(bad input → 422), authN (no session → 401), and **tenancy (cross-agency id → 404)** tests.

- `packages/core`: tenancy guard rules (global + group + field-level), review state machine (all transitions).
- `apps/api`: one `*.test.ts` per module (agencies, clients, projects, deliverables, file-versions, reviews,
  views, notifications, activity, admin). Plus `plugins/security.test.ts` (auth-guard + 404 existence hiding).
- `apps/worker`: relay (outbox idempotency), media processor (mock ffmpeg or fixture assets), notify processor.
- CI (`.github/workflows/ci.yml`): spin up Postgres + Redis, `db:push && db:seed`, `bun run check`
  (Biome + tsc + dependency-cruiser boundaries), `bun run test`, `bun run build`, build the 3 Docker images.
- Test env: separate `creativedock_test` DB, `OPENFEATURE_PROVIDER`-free (flags via env), local storage temp dir.

---

## 16. Build Sequence (ordered milestones)

Each milestone is independently verifiable and leaves the app runnable.

1. **M0 — Scaffold.** Monorepo (Bun + Turbo + Biome), `docker-compose.yml` (postgres+redis),
   empty apps/packages, health endpoints, CI skeleton.
2. **M1 — DB + auth + tenancy.** Drizzle schema (§5) + migrations + seed (§14); better-auth email/password;
   `packages/core` guard (§6) with unit tests; `/login`.
3. **M2 — Projects & deliverables.** CRUD + status transitions + Board/List work views + saved views.
4. **M3 — Local storage + file versions.** Storage interface + signed local URLs; upload initiate/complete;
   version list; deliverable detail shell.
5. **M4 — Worker media pipeline.** BullMQ + outbox relay; media processor (video/audio/image/PDF);
   artifacts + preview/poster/sprite/waveform endpoints.
6. **M5 — Review wedge.** review_run/stage/approval + state machine; per-medium viewers + anchored comments
   (all four media); decision bar (Internal→Client); reactions/resolve/attachments/visibility toggle; compare.
7. **M6 — Notifications & activity.** notify processor → in-app inbox; activity feed on deliverable.
8. **M7 — Client surface + admin.** Stripped client review surface; super-admin agencies + view-as + audit log.
9. **M8 — Hardening.** Full test matrix green; `bun run check` clean; end-to-end verification (§17);
   design polish from salvaged CSS.

---

## 17. Verification / Acceptance Criteria

The MVP is "done" when all of the following pass on a clean machine with **only local infra**:

1. `docker compose up -d postgres redis` → `bun run db:migrate && bun run db:seed` → `bun run dev` boots
   api + web + worker with **no cloud env vars**.
2. **Video happy path:** sign in as agency member → create deliverable → upload an MP4 → worker produces
   poster + sprite + transcoded MP4 (artifacts visible) → leave a **timecode-anchored** internal comment →
   Approve internal → version promoted to CLIENT → sign in as client user → client sees it → leaves a
   timecode comment → **Request Changes** → agency sees `REVISION_REQUESTED` + the `approval` audit row +
   the activity feed entries + an in-app notification.
3. **Repeat** the path for **image** (region anchor via Annotorious), **PDF** (page region via PDF.js),
   **audio** (waveform range via wavesurfer) — each produces correct artifacts and anchored comments.
4. **Version compare:** upload v2, open compare, see v1 vs v2 side-by-side (synced scrub for video).
5. **Tenancy:** a user from a second seeded agency requesting a first-agency deliverable id gets **404**;
   a client user cannot see INTERNAL versions or INTERNAL comments anywhere.
6. **Super-admin:** can view-as into an agency; the action appears in `audit_log`.
7. `bun run test` green (module matrix incl. tenancy 404 tests, core guard, state machine, worker).
8. `bun run check` green (Biome + tsc + dependency-cruiser boundaries).

---

## 18. Open Risks / Notes for the Implementer

- **ffmpeg in dev:** the worker container installs ffmpeg; for bare-metal `bun run dev`, ffmpeg must be on PATH.
  Document this in the README; tests should mock ffmpeg or use tiny fixture assets to stay fast/hermetic.
- **PDF.js worker asset:** ensure the pdfjs worker file is bundled/served (Vite asset config) — a common footgun.
- **Resumable upload scope:** v1 may ship single-PUT uploads if chunking proves heavy; keep the `upload_session`
  model so chunked/resumable slots in without API changes.
- **better-auth org plugin:** decide early whether to use it or model agency membership ourselves; do not let it
  pull in flows that require email sending.
- **Schema additivity:** when in doubt, choose the column/enum shape that matches v4's eventual model
  (e.g. keep `review_stage.mode` out of v1 but design `review_stage` so a `mode` column is a clean add).
- **No realtime:** after any mutation, invalidate the relevant TanStack Query keys so the UI reflects state
  without websockets.

---

*End of v1 build spec. The eventual feature universe (automation, intake, templates, dependencies, shares,
analytics, realtime, 3D/web proofing) lives in `creative-dock-enhanced-build-plan-v4.md` and is intentionally
deferred — the v1 schema is designed to absorb it additively.*
