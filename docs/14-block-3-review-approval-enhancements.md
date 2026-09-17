# 14 — Block 3 enhancement spec: surfacing the wedge (threads, reactions, comment→task, compare, audit, pipeline editor)

> **Status:** `planned` (forward spec) · **Feature key:** `review.wedge` · **Phase:** v4 Phase 2
> **Reads with:** [10-block-3-review-approval.md](./10-block-3-review-approval.md) (the *as-built* contract),
> [13-block-2-files-versioning-enhancements.md](./13-block-2-files-versioning-enhancements.md) (the `CompareStage`
> this doc consumes), and [02-domain-model.md](./02-domain-model.md).

**The single most important fact for whoever builds this:** the Block 3 **backend is already rich and tested**. The
`comments` table carries `parentId` (threads), `mentionUserIds[]`, `hashtags[]`, `attachments`, `reactions`, and
`spawnedTaskId`; there is a `comment_reaction` table; and the service implements `validateMentions`,
`reactToComment`, `resolveComment`, and **`commentToTask`** (which inserts a real `tasks` row with
`taskType: "COMMENT_FEEDBACK"`, idempotent via `comment.spawnedTaskId`). Pipeline CRUD (`createPipeline`,
`configureReviewStage`) and the e-signature/audit (`approvals`, `decideReview`) are built too.

**What is missing is the UI.** `review-room.tsx` renders a *flat* comment (`author · anchor · message · time`) and
exposes none of: threads, replies, @mentions, #hashtags, reactions, resolve/reopen, **Convert to task**, the
spawned-task loop, real compare, the decision audit trail, or the pipeline editor. So **this doc is ~80% a UI/UX
specification** — exactly the "every component, nothing assumed" artifact requested. Where a server gap remains
(guest attachment upload, thread pagination), it is called out explicitly in §4.

---

## 0. How to read this

| If you want… | Go to |
|---|---|
| v4 attribution | §1 |
| The shipped-API / missing-UI ledger | §2 ← read this first |
| Schema (mostly *already exists*) | §3 |
| Endpoints (mostly *already exist*) | §4 |
| Server behavior already built | §5 |
| **Full UI/UX flow + every component** | §6 ← the bulk |
| Tests / DoD / deferred | §7 / §8 / §9 |

---

## 1. v4 traceability — what this closes

| v4 requirement | Source | Backend | This doc surfaces in |
|---|---|---|---|
| **Comment → tracked subtask** ("feedback becomes a to-do") | A1.7 / B8 / ClickUp assign-comment | ✅ `commentToTask` | §6.1, §6.2 |
| **Threads / replies** | Frame.io A4.3 / Filestage | ✅ `comments.parentId` | §6.1 |
| **@mentions (validated), #hashtags** | Frame.io | ✅ `validateMentions`, `hashtags[]` | §6.1 |
| **Emoji reactions (normalized)** | Frame.io | ✅ `comment_reaction` + `reactToComment` | §6.1 |
| **Internal-only vs client-visible toggle** | Filestage team-only | ✅ shipped (visibility) | §6.1 (already in UI) |
| **Resolve / reopen** | proofing synthesis | ✅ `resolveComment` | §6.1 |
| **Side-by-side compare, synced nav** | Frame.io A4.3 / B9 | engine in **13 §6** | §6.3 |
| **Explicit decisions → audit trail (who/when)** | Asana 3-outcome + Ziflow | ✅ `approvals`, `decideReview` | §6.4 |
| **E-signature sign-off** | Ziflow A9.1 | ✅ shipped | §6.4 (display) |
| **Stalled-review escalation** | Ziflow | ✅ scheduler (11) | §6.4 (badge) |
| **Sequential / parallel stages, quorum, SLA** | Ziflow A9.1 | ✅ `pipeline_stage`, `configureReviewStage` | §6.5 editor UI |
| **Guest reviewers (no account)** | Filestage/Vimeo | ✅ shares (10) | §6.6 polish |
| **Comment attachments** | Frame.io | ✅ `attachments` + attachments module | §6.1, §6.6 |

Deferred to Phase 5 (v4 §E): screen+voice **Clips**, 3D and live-web proofing. See §9.

---

## 2. Gap ledger — API shipped, UI missing

This is the heart of the block: almost every cell's "API" column is ✅ and "UI" column is ✗.

| # | Capability | API today | UI today | Target UI | §|
|---|---|---|---|---|---|
| R1 | Reply to a comment (thread) | ✅ `parentId` accepted | ✗ flat list | nested thread + reply composer | 6.1 |
| R2 | @mention a teammate | ✅ `mentionUserIds` validated, notifies | ✗ no autocomplete | `@`-autocomplete, rendered chips, notifies | 6.1 |
| R3 | #hashtag | ✅ `hashtags[]` | ✗ | inline `#tag` parse + filter | 6.1 |
| R4 | React with emoji | ✅ add/remove endpoints, unique per user | ✗ | reaction bar + picker, counts, toggle | 6.1 |
| R5 | Resolve / reopen | ✅ `resolve`,`reopen` | ✗ | resolve toggle + resolved section | 6.1 |
| R6 | **Convert comment → task** | ✅ `POST …/comments/:id/task` | ✗ | "Convert to task" → task chip on comment | 6.1, 6.2 |
| R7 | The revision-task loop | ✅ `tasks` rows (COMMENT_FEEDBACK) | ✗ no task UI at all | Revisions panel + checklist on deliverable | 6.2 |
| R8 | Compare versions | data present | ✗ naive dual render | `CompareStage` (13 §6) split/onion/sync | 6.3 |
| R9 | Decision audit trail | ✅ `listApprovals` (who/when/feedback/sig/ip) | ✗ not shown | audit timeline + e-sign record + stage map | 6.4 |
| R10 | Stalled-stage escalation | ✅ scheduler fires | ✗ no badge | "Overdue" stage badge + escalation note | 6.4 |
| R11 | Pipeline / stage editor | ✅ create/configure | ✗ no editor | owner/admin stage editor (seq/parallel/quorum/SLA) | 6.5 |
| R12 | Guest nested replies + attachment upload | partial (10 gap) | ✗ | guest composer parity | 6.6 |

---

## 3. Domain-model deltas (mostly *already present* — additive only where noted)

**Already in `packages/db/src/schema/review.ts` (do not re-add):**
```ts
comments: { … parentId (self-ref), visibility, anchorType, anchor,
            mentionUserIds[], hashtags[], attachments(jsonb), reactions(jsonb),
            resolvedAt, spawnedTaskId, … }
commentReactions("comment_reaction"): unique(commentId,userId,emoji)
pipelines / pipelineStages / pipelineStageApprovers
reviewRuns / reviewStages / reviewStageApprovers / approvals / shares
```
**Already in `packages/db/src/schema/work.ts`:** `tasks` (with `taskType` incl. `COMMENT_FEEDBACK`,
`deliverableId`, `assignedToUserId`, `createdByUserId`), `checklists`, `checklistItems`, `dependencies`,
`deliverablePlacements`, `milestones`.

**Net-new (additive, tag `Active: B3`):** only two, both small.
```ts
// comments — optional, to render a resolved-by line and "edited" affordance without an extra table
resolvedByUserId: text("resolved_by_user_id").references(() => users.id),  // who resolved
editedAt:         timestamp("edited_at", { withTimezone: true }),          // last edit (composer edit)
```
Everything else the UI needs is already stored. **No new tables.** This is why Block 3 is a UI block, not a data block.

---

## 4. API surface — what exists, and the two real server gaps

### 4.1 Already shipped (document, don't rebuild) — `apps/api/src/modules/reviews/reviews.routes.ts`
```
GET   /api/reviews/pipelines
POST  /api/reviews/pipelines                                   (createPipeline)
GET   /api/reviews/deliverables/:id/stages
POST  /api/reviews/deliverables/:id/stages                     (configureReviewStage)
GET   /api/reviews/deliverables/:id/comments                   (listComments → includes reactionRows)
POST  /api/reviews/deliverables/:id/comments                   (createComment; mentionUserIds, hashtags, anchor)
POST  /api/reviews/deliverables/:id/comments/:cid/reactions    (reactToComment add)
DELETE/api/reviews/deliverables/:id/comments/:cid/reactions/:emoji
POST  /api/reviews/deliverables/:id/comments/:cid/resolve
POST  /api/reviews/deliverables/:id/comments/:cid/reopen
POST  /api/reviews/deliverables/:id/comments/:cid/task         (commentToTask → returns the task)
GET   /api/reviews/deliverables/:id/approvals                  (listApprovals — the audit source)
POST  /api/reviews/deliverables/:id/decisions                  (decideReview; eSignature, consent, ip, ua)
POST  /api/reviews/deliverables/:id/submit-internal | /promote
```
`listComments` returns comment rows **with** `reactionRows`, `mentionUserIds`, `hashtags`, `parentId`,
`spawnedTaskId`, `resolvedAt` — the UI already has the data it needs; it just isn't rendering it.

### 4.2 Server gap A — **thread/page shape for comments**
`listComments` returns a flat array. For deep threads + the scrubber, add an opt-in grouped response and cursor:
```
GET /api/reviews/deliverables/:id/comments?view=threaded&cursor=…
→ { roots: Comment[], repliesByParent: Record<parentId, Comment[]>, nextCursor }
```
Pure projection over existing rows; no schema change. (Default stays the flat array for back-compat.)

### 4.3 Server gap B — **guest attachment upload** (10 release gap)
Public share review (`share-review.tsx`) can read but a guest cannot upload a comment attachment. Add a
share-scoped, rate-limited signed-upload that writes into the existing attachments module with
`audience: GUEST` and the share's `allowComment` gate:
```
POST /api/public/shares/:token/attachments   (multipart-init, scoped to the share, mime/size capped)
```
Guarded by the share token, not a session; attachments inherit the share's visibility. This closes the
"guest attachment upload" gap 10 flags.

### 4.4 Tasks read API (for §6.2)
`tasks` rows exist but are not exposed for the deliverable. Add a thin read (this also seeds Block 5):
```
GET /api/work/deliverables/:id/tasks            (tenant-guarded; returns tasks incl. COMMENT_FEEDBACK)
PATCH /api/work/tasks/:id                        (status, assignee, dueAt)
```
Behind the `work.views` flag OR `review.wedge` (the revision loop is part of the wedge); pick `review.wedge`
so the loop works before Block 5 ships the full work surface.

---

## 5. Server behavior already built (so the UI matches it exactly)

- **`createComment`**: validates mentions (all mentioned users must be real + same-tenant + visible to the
  principal), stores `hashtags`, normalizes `anchor` per medium (`normalizedAnchor`), writes an outbox
  `COMMENT_ADDED` event (→ notify fan-out, 11), and inserts mention notification rows.
- **`reactToComment`**: unique on `(commentId,userId,emoji)` → calling again is a no-op/toggle; the UI reaction
  bar must reflect **per-user** toggle, not a raw increment.
- **`resolveComment(reopen?)`**: sets/clears `resolvedAt`. The UI should move resolved comments into a collapsible
  "Resolved" group and keep their scrubber markers but dimmed.
- **`commentToTask`**: **idempotent** — if `spawnedTaskId` is set it returns the existing task. The UI's "Convert
  to task" must therefore be safe to click twice (it links, not duplicates), and should switch to "View task" once
  `spawnedTaskId` is present.
- **`decideReview`**: records `decision ∈ APPROVE|REQUEST_CHANGES|REJECT` with `decidedBy/at/feedback`, and on
  client APPROVE the typed `eSignature` + consent text/version + request IP + user-agent. Append-only; DB triggers
  block update/delete (10). The audit UI renders these fields verbatim.

---

## 6. UI / UX flow — every screen, every component

Tokens per **04 §2**; status never color-only (04 §9); restrained motion (04 §8). The Review Room layout (04 §3)
is the canvas; this section upgrades its **right column** (comments), **stage** (compare), a new **audit drawer**,
and adds an **owner stage editor** + a **Revisions** surface on the deliverable.

> **Grounding note (verified against code, not assumed):** the viewer registry (`components/viewers/viewer-registry.tsx`)
> already uses real proofing libraries — **video.js** (video, with a custom SVG overlay for drawing), **Annotorious**
> (`@annotorious/react`, image), **pdfjs-dist** (PDF canvas), and **wavesurfer.js** + RegionsPlugin (audio). The
> shared viewer prop contract is `{ url, fileName, fileType, currentTime, onTime, onDuration, onAnchor }` and the
> anchor it emits is `ViewerAnchor = { type:"REGION", geometry, page?, timecodeMs? } | { type:"WAVEFORM_RANGE",
> startMs, endMs }`. Everything below names these real components; no new viewer is invented.

### 6.0 Navigation, entry points, and the live annotation surface (per medium)

**How each actor reaches the surfaces this block touches** (routes are the real ones in `router.tsx`):

| Actor | Path to the surface | Route | Shell |
|---|---|---|---|
| Agency reviewer | Dashboard → *Review queue* / a deliverable card → **Open review room** | `/agency/review/$deliverableId` → `<ReviewRoom/>` | `AgencyShell` |
| Agency (cockpit) | Projects → deliverable → **Deliverable detail** (version stage + rail) | `/agency/deliverables/$id` → `<DeliverableDetail/>` | `AgencyShell` |
| Client | Client Home *"For your review (N)"* card → **client review room** | `/client/review/$deliverableId` → `<ReviewRoom clientMode/>` | `ClientShell` |
| Guest | Emailed **share link** → passphrase gate → shared review | `/r/$token` → `<ShareReviewPage/>` | none (standalone) |
| Owner/Admin | Settings → **Review pipelines** | `/agency/settings/pipelines` (new) → `<PipelineEditor/>` | `AgencyShell` |

The Review Room (`review-room.tsx`) is `AgencyShell`/`ClientShell`-wrapped and lives inside a `RealtimeRoom`
(`review:$deliverableId`) so presence/live-update (doc 15) layer over it. The agency cockpit
(`deliverable-detail.tsx`) is a **two-column `deliverable-workspace`**: a `version-stage panel` (big preview +
`version-facts`) and a `version-rail panel` (`version-rail__list` of `version-rail__item`s with
`version-number rx-mono` = `displayVersion`). The **Revisions** panel (§6.2) and **Activity** feed (doc 15 §6.5)
are added here as a third panel / tab strip in `deliverable-workspace` — *not* a new screen.

**The annotation surface — exactly how a comment gets anchored, per medium.** This is the heart of the wedge and
is already implemented at the viewer level; the UI flow is: pick a tool → mark the media → an `anchor-chip`
appears in the composer → type → **Send**. Per medium:

| Medium | Viewer (lib) | `annotation-tools` | Gesture → anchor emitted |
|---|---|---|---|
| **Video** | `VideoViewer` (video.js) + `proof-overlay` SVG | **Point · Box · Draw** | Point = click → `REGION{geometry:POINT, timecodeMs:now}`; Box = drag → `RECTANGLE`; Draw = freehand → `PATH`; all stamped with the current `timecodeMs` |
| **Image** | `ImageViewer` (Annotorious) | **Rectangle · Polygon** | draw a shape, or double-click → `REGION{geometry:POINT}` (no timecode) |
| **PDF** | `PdfViewer` (pdfjs canvas) | page **◄ ►**, **Zoom**, **Rotate** | click the page → `REGION{geometry:POINT, page:n}` |
| **Audio** | `AudioViewer` (wavesurfer + Regions) | drag-select on the waveform | drag a range → `WAVEFORM_RANGE{startMs,endMs}`; click a region replays it |
| **Other** | — | — | "Download-only format. Attach a supported companion preview." |

The composer already shows the pending anchor as an `anchor-chip` ("Region pinned ✕" or the mono `@ 00:00:42`
timecode) and the **scrubber** renders TIMECODE comments as `scrubber-marker` ticks. So the *anchoring* round-trip
is built; what §6.1 adds is everything that happens to a comment **after** it exists (reply/mention/react/resolve/
convert) and surfacing it richly.

**Anchor → comment data flow (so the UI matches the server):** the composer posts `createComment({ fileVersionId,
message, visibility, anchorType, anchor, mentionUserIds, hashtags })`; the server `normalizedAnchor`s it per medium,
writes a `COMMENT_ADDED` outbox event (→ notify fan-out + doc-15 live insert), and returns the row. The UI must
therefore treat the anchor shapes above as canonical and never invent a new shape.

### 6.1 The comment thread, fully surfaced

Replace the flat `<article>` in `review-comments__list` with `CommentThread` → `CommentCard` (recursive on
`parentId`). Real layout:

```
┌ COMMENTS · v2.1 ───────────── 04 ┐
│ [ Open 03 · Resolved 01 ▸ ]      │  ← filter segmented (open/resolved/mine/internal)
│ ┌──────────────────────────────┐ │
│ │ ◐ Sara K.   00:00:12:04  ⋮   │ │  ← avatar · author · mono anchor · overflow menu
│ │ logo too big @Mia #branding  │ │  ← @mention chip + #hashtag rendered
│ │ 👍 2  ✅ 1   + react          │ │  ← reaction bar (per-user toggle) + picker
│ │ ↳ Reply · Resolve · Convert  │ │  ← actions row
│ │   ⟐ Task: "logo too big" →   │ │  ← appears once spawnedTaskId set (R6/R7)
│ │   ┌ Mia  00:00:13:00 ──────┐ │ │  ← nested reply (parentId)
│ │   │ on it, tightening 12%  │ │ │
│ │   └────────────────────────┘ │ │
│ │   [ ＋ reply… ]               │ │  ← inline reply composer
│ └──────────────────────────────┘ │
│ … resolved (dimmed, collapsible) │
├──────────────────────────────────┤
│ @  #  📎  ☑ Agency only          │  ← composer toolbar: mention, hashtag, attach, internal toggle
│ [ pinned @ 00:00:42 ]  textarea  │  ← anchor chip (shipped) + body
│                          [ Send ]│
└──────────────────────────────────┘
```

**Component anatomy**

| Element | Component (file) | Props / state | Backed by |
|---|---|---|---|
| Thread root | `CommentThread` (`components/review/comment-thread.tsx`) | `comments, anchorFilter, view` | `listComments?view=threaded` (4.2) |
| One comment | `CommentCard` | `comment, depth, onReply, onReact, onResolve, onConvert` | — |
| Author | `Avatar` + name | `authorName` | — |
| Anchor | `rx-mono` chip | `anchorLabel(comment)` (exists) | — |
| Body render | `CommentBody` | parses `@id`→`mentionUserIds`, `#tag`→`hashtags` into chips/links | stored arrays |
| Reactions | `ReactionBar` | `reactions` map + `myUserId`; click toggles | `reactToComment` add/DELETE |
| Reaction picker | `EmojiPicker` (small, ~12 curated) | normalized set | — |
| Actions | `Reply` / `Resolve` / `Convert to task` | — | resolve/reopen, comment/:id/task |
| Task chip | `TaskChip` | `spawnedTaskId, taskStatus` | tasks read (4.4) |
| Reply composer | `ReplyComposer` | `parentId` preset | `createComment` with `parentId` |
| Filter | `SegmentedControl` | open/resolved/mine/internal | client filter |
| Composer | upgrade `comment-composer` | add `@`/`#`/`📎`; keep internal toggle + anchor chip (shipped) | `createComment` |

**@mention autocomplete:** typing `@` opens `MentionMenu` querying `GET /api/collaboration/users` (exists),
inserts a chip bound to a real `userId` → pushed into `mentionUserIds`. Invalid/foreign users can't be inserted
(mirrors `validateMentions` → no 422 surprises). **#hashtag:** `#word` tokens parse into `hashtags[]` and become
clickable filters. **Reactions:** the bar shows each emoji with a count and a filled state if *I* reacted; clicking
toggles via the unique-constraint endpoints (no double-count). **Resolve:** moves the card to a dimmed "Resolved"
group; its scrubber marker dims but stays. **Convert to task** (R6): calls `comment/:id/task`; on success the
`TaskChip` appears and the action relabels to **View task** (idempotent-safe per §5).

**States:** *empty* → `comments-empty` (exists) "No notes on this cut yet." *posting* → optimistic card with a
pending dot, reconciled on invalidate + `broadcastInvalidation` (Block 4 makes it live). *mention error* → inline
"That teammate isn't on this client" (don't lose the draft).

### 6.2 The revision-task loop (R7) — where `commentToTask` becomes visible work

The spawned `tasks` row currently goes nowhere on screen. Add a **Revisions** surface in two places:

1. **Deliverable detail** (`deliverable-detail.tsx`, 561 lines today, upload-centric) gains a **Revisions** panel:
   ```
   ┌ REVISIONS (from feedback) ───────────── 2 open ┐
   │ ☐ logo too big            Mia   v2.1 00:00:12  │  ← title · assignee · source version+anchor (jump)
   │ ☑ color too warm          Leo   v2.0 done      │
   └────────────────────────────────────────────────┘
   ```
   Each row links back to the **source comment + anchor** (clicking jumps the Review Room to that timecode/region).
   Checking a row `PATCH`es the task `status` → `DONE`; the linked comment can auto-resolve (optional rule, B6).
2. **Review Room** comment cards show the `TaskChip` inline (§6.1), so the editor sees "this note is tracked."

**Component:** `RevisionList` (`components/work/revision-list.tsx`) over `GET /api/work/deliverables/:id/tasks`
filtered to `taskType = COMMENT_FEEDBACK`. This is the Asana "proofing comment → tracked subtask" loop (v4 A1.7),
finally visible. It also seeds the Block 5 task UI (same component reused for general tasks/checklists).

### 6.3 Compare in the Review Room (R8) — consume `CompareStage`

Replace the `compare-picker` `<select>` + dual `MediaViewer` with the **13 §6 `CompareStage`** and its mode
toolbar (13 §7.3). The Review Room owns the *selection* (which versions are A/B, from the rail) and passes them in;
all sync/zoom/divider/drift logic lives in `CompareStage`. Comments stay anchored to **version A**; a subtle "B"
watermark prevents mis-attributing a note to the wrong cut. Exiting compare restores the single stage.

### 6.4 Decision & audit trail (R9/R10) — the "compliant record" made visible

A right-side **Audit drawer** (and a compact inline stage map under the decision bar):

```
┌ APPROVAL TRAIL ───────────────────────────────┐
│ Stage 1 · Internal · parallel · quorum 2/3  ✓  │  ← from review_stages (mode, quorum, status)
│   ✓ Lead     Approve        Jun 21 14:02       │
│   ✓ Senior   Approve        Jun 21 14:40       │
│   ⏳ Designer  —             (not required)      │
│ Stage 2 · Client · sequential   ● in review    │
│   ⏳ Client    —              due Jun 23 ⚠ overdue│  ← stalled badge (R10) when past dueAt
│ ───────────────────────────────────────────────│
│ ✍ E-signature on final approve                 │
│   "Imperial Living — A. Rao"  Jun 23 09:11      │  ← name, consent version, time
│   IP 49.x · Chrome/macOS                        │  ← from approvals.requestIp / userAgent
└────────────────────────────────────────────────┘
```

| Element | Component | Source |
|---|---|---|
| Stage row | `StageTimeline` / `StageRow` | `GET …/stages` (mode, quorum, status, dueAt) |
| Approver line | `ApproverRow` | `listApprovals` (decidedBy/at/decision/feedback) |
| Overdue badge | `Badge variant="warning"` | `dueAt < now` + scheduler-fired escalation (11) |
| E-sign record | `SignatureRecord` | `approvals.eSignature, consentText/Version, requestIp, requestUserAgent` |

The trail is **read-only** and append-only (DB triggers enforce immutability, 10). For clients, the drawer shows
only client-audience stages + their own signature (field-level stripping, core guard). Decision *actions* stay in
the existing `DecisionBar`; this drawer is the *history*.

### 6.5 Pipeline / ReviewStage editor (R11) — the missing owner UI

`createPipeline` / `configureReviewStage` exist with no front door. Add an **agency Settings → Review pipelines**
editor (owner/admin only; gated by the core `can()` matrix):

```
┌ Pipeline: "Motion — standard" ───────────────── + Add stage ┐
│ ⠿ 1  Internal review   [parallel ▾]  quorum [2]  SLA [24h]  │  ← drag to reorder (sequence)
│        approvers: Lead ✕  Senior ✕  + add        escalate→Lead│
│ ⠿ 2  Client approval   [sequential ▾] quorum [1] SLA [48h]  │
│        approvers: Client-of-record (auto)        escalate→PM │
│ [ □ requiresInternalApproval  □ requiresClientApproval ]    │  ← stage flags (02)
└─────────────────────────────────────────────────────────────┘
```

| Control | Component | Writes |
|---|---|---|
| Stage list (reorder) | `StageEditorList` (dnd-kit) | `sequence` via `configureReviewStage` |
| Mode | `Select` SEQUENTIAL/PARALLEL | stage `mode` |
| Quorum | `NumberInput` | `requiredCount` (validated ≤ approver count) |
| Approvers | `ApproverMultiSelect` | `pipeline_stage_approvers` (required/ordered flags) |
| SLA / escalation | `DurationInput` + `UserSelect` | `slaHours`, `escalationTarget` |
| Add/remove stage | `Button` | create/delete stage |

Validation mirrors the service (quorum ≤ approvers; sequential stages keep approver order). Saving a pipeline does
**not** retro-alter in-flight `review_runs` (they snapshot the pipeline at submit — 10); a banner says so.

### 6.6 Guest review parity (R12)

`share-review.tsx` (the public guest room) reaches comment + reaction + reply parity with the agency room, minus
internal-only affordances: no internal toggle, no "Convert to task", no audit drawer; **plus** guest attachment
upload via §4.3. The guest composer reuses `ReplyComposer`/`CommentBody`/`ReactionBar` so there is one comment UI,
themed identically, gated by the share's `allowComment`/`allowDownload`.

### 6.7 Component inventory (Block 3 net-new / changed)

| Component | File | New? |
|---|---|---|
| `CommentThread`, `CommentCard`, `CommentBody` | `components/review/*` | new (replaces flat article) |
| `ReactionBar`, `EmojiPicker` | `packages/ui/*` | new |
| `MentionMenu` | `components/review/mention-menu.tsx` | new |
| `ReplyComposer` (+ upgraded `comment-composer`) | `components/review/*` | new/extend |
| `TaskChip`, `RevisionList` | `components/work/*` | new (reused in B5) |
| `StageTimeline`, `StageRow`, `ApproverRow`, `SignatureRecord` | `components/review/audit/*` | new |
| `StageEditorList`, `ApproverMultiSelect`, `DurationInput` | `components/review/pipeline/*` | new |
| `CompareStage` | from **13 §6** | reused |

### 6.8 Motion / copy / a11y / responsive
- **Motion:** a new live comment pulses its scrubber marker once (04 §8, shipped intent); resolve animates the card
  to the resolved group; reduced-motion → instant.
- **Copy (04 §7):** `Reply`, `Resolve` / `Reopen`, `Convert to task` → `View task`, `Request changes` →
  `Changes requested`, `Approve` → `Approved`. Audit reads as plain history ("Approved by Lead, Jun 21 14:02").
- **a11y:** threads are a proper `role="tree"`/nested list; mention menu is a combobox with arrow-key nav;
  reactions are toggle buttons with `aria-pressed`; the audit drawer is a labeled region; **status never
  color-only** (every stage/decision has text). Keyboard: `r` reply, `e` resolve, `c` compare.
- **Responsive:** below `md` the comments column becomes a bottom sheet over the stage; the audit drawer is a
  full-screen modal; the pipeline editor stacks stage cards. Client guest room is mobile-first (04 §11).

---

## 7. Test matrix

| Layer | Test | Asserts |
|---|---|---|
| api | threaded view | `view=threaded` groups by `parentId`; cursor paginates roots only |
| api | guest attachment | upload scoped to share token; respects `allowComment`; mime/size cap; foreign token → 404 |
| api | tasks read/patch | tenant-guarded; cross-tenant id → 404; PATCH status validated |
| web (unit) | `ReactionBar` toggle | clicking twice removes (matches unique constraint), no double count |
| web (unit) | `CommentBody` parse | `@id` + `#tag` render as chips bound to stored arrays |
| web (unit) | Convert-to-task idempotency | second click → "View task", not a new task |
| web (e2e, gated) | full revision loop | comment → Convert → Revisions panel → check done → comment resolvable |
| web (e2e, gated) | compare + audit | split/onion sync (13); audit shows e-sign + overdue badge |
| web (e2e, gated) | pipeline editor | reorder + quorum>approvers rejected; in-flight run unaffected |
| a11y | thread/mention/audit | `accesslint` clean; keyboard thread nav + mention combobox |

## 8. Definition of Done (Block 3 enhancements)
- [ ] `CommentThread` surfaces replies, @mentions, #hashtags, reactions (per-user toggle), resolve/reopen — all on the *existing* API.
- [ ] **Convert to task** wired (idempotent → "View task"); `RevisionList` shows the loop on the deliverable; jump-to-anchor works.
- [ ] Review Room uses `CompareStage` (split/onion/synced); comments stay anchored to A.
- [ ] Audit drawer renders stages (mode/quorum/status/SLA), approver decisions, overdue escalation, and the e-signature record (read-only, immutable).
- [ ] Owner pipeline/stage editor writes via `createPipeline`/`configureReviewStage`; in-flight runs unaffected; validation matches service.
- [ ] Guest room reaches comment/reaction/reply parity + attachment upload.
- [ ] Test matrix green; `accesslint` clean; closes 10's release gaps (annotation acceptance, nested-thread composer, guest upload, pipeline editor).

## 9. Deferred to Phase 5 (per v4 §E)
Screen+voice **Clips** comments (ClickUp); **3D** review (rotate/zoom/eye-level + measurement, PageProof); **live-web/HTML**
proofing (QuickReviewer); **forensic watermark** on shares. The viewer registry + `Share.watermark` enum already
leave room for these; they are explicitly out of Block 3.
