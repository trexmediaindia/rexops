# 13 — Block 2 enhancement spec: version stacks, compare engine, bulk upload, hover-scrub

> **Status:** `planned` (forward spec, not yet built) · **Feature key:** `files.versioning` · **Phase:** v4 Phase 1/2
> **Reads with:** [09-block-2-files-versioning.md](./09-block-2-files-versioning.md) (the *as-built* contract) and
> [02-domain-model.md](./02-domain-model.md) (schema). 09 says what shipped; **this doc says what is still missing
> to reach v4 B9 depth, and exactly how to build it — data, API, worker, and full UI/UX with every component.**

This spec exists so a future session implements the Block 2 gaps **without assuming anything**. Every screen names
real components from the current codebase (`apps/web/src/routes/review-room.tsx`, `…/agency/deliverable-detail.tsx`,
`packages/ui`) and every new artifact is additive (02 stays migration-free).

---

## 0. How to read this

| If you want… | Go to |
|---|---|
| Why each feature exists (v4 attribution) | §1 |
| The exact shipped→target delta | §2 (gap ledger) |
| New columns/tables (all additive) | §3 |
| New endpoints + validation | §4 |
| Worker (sprite/poster generation) | §5 |
| The reusable **Compare engine** | §6 |
| **Full UI/UX flow + every component** | §7 ← the largest section |
| Tests / DoD / deferred | §8 / §9 / §10 |

**Vocabulary (locked, from 02 + 04):** a **deliverable** owns an ordered **version stack** (`file_version` rows,
`versionNumber` ascending). `displayVersion` is `v{major}.{minor}` (e.g. `v2.1`). A **proxy/preview** is the
review-safe rendition the worker generates; the **source** is the original bytes. The **VersionRail** is the
left column in the Review Room and Deliverable detail. **Compare** = two versions shown together with synced
navigation. None of these names are invented here — they already exist in code.

---

## 1. v4 traceability — what this closes

| v4 requirement | Source | Closed by |
|---|---|---|
| **Version stacks** — "drag a new version onto an asset to stack iterations" | B9 / Frame.io A4.3 | §7.1 drag-to-stack + §7.2 |
| **Side-by-side compare with synced scrub** (video) / **synced zoom-pan** (image) | B9 / Frame.io A4.3 comparison viewer | §6 + §7.3 |
| **Hover-scrub frame previews** on the player/scrubber | Frame.io A4.3 streaming player | §5 sprite + §7.4 |
| **Bulk uploads while you keep working** | Frame.io A4.3 | §7.2 upload manager |
| **Minor *and* major version labels** alongside the number | Ziflow A9.1 / B9 | **already shipped** (09) — §7.1 surfaces it |
| **@-version references** in comments/chat (drag-a-version-to-tag) | B10 / v3 | §7.5 (engine shipped via `refVersionIds`; this adds the picker UI) |

Out of scope here (kept deferred to Phase 5 per v4 §E): forensic/DRM watermark proxies; 3D and live-web asset
versioning. See §10.

---

## 2. Gap ledger (as-built → target)

| # | Capability | As-built today (09 / code) | Target (v4 B9) | This doc |
|---|---|---|---|---|
| G1 | Version stack visual | Versions render as a flat list of buttons in `review-version-rail`; label is `V{n}.{0\|1}` | A true **stack**: thumbnail, poster, status dot, minor/major label, "latest" badge, supersede line | §7.1 |
| G2 | Add-next-version by drag | Upload happens via a separate action; no drag-onto-stack | **Drag a file onto the rail/stage** → starts an upload that becomes the next version | §7.1, §7.2 |
| G3 | Compare | `compare-picker` `<select>` renders a 2nd `MediaViewer`; both share one `currentTime`; **no synced zoom/pan, no divider, no diff** | Reusable **Compare engine**: side-by-side / split-slider / onion-skin, synced transport for time-media, synced zoom/pan for stills | §6, §7.3 |
| G4 | Hover-scrub | None — scrubber shows only a fill bar + comment markers | Hover the scrubber/thumbnail → **frame preview** from a sprite sheet + WEBVTT | §5, §7.4 |
| G5 | Bulk upload | One upload session at a time (resumable, fingerprinted — 09) | **Upload manager**: many files queued, parallel, each resumable, dismissible, backgrounded | §7.2 |
| G6 | @-version picker | `refVersionIds[]` accepted by API; chat supports drag-drop tag | A **version picker** + chip UI usable in comment/chat composers | §7.5 |
| G7 | Poster/thumbnail | `previewUrl` only | `posterFrameUrl` (still) + `thumbnailSpriteUrl` (scrub strip) | §3, §5 |

---

## 3. Domain-model deltas (additive, tag `Active: B2`)

Add to `file_version` (in `packages/db/src/schema/files.ts`). All nullable → no destructive migration, no backfill
required; existing rows simply have `null` until the worker regenerates.

```ts
// file_version — ADDITIVE columns for hover-scrub + poster
posterFrameUrl:      text("poster_frame_url"),        // single representative still (object key → signed at read)
thumbnailSpriteUrl:  text("thumbnail_sprite_url"),    // sprite sheet object key (grid of frames)
spriteIntervalMs:    integer("sprite_interval_ms"),   // ms between sprite cells (e.g. 2000)
spriteColumns:       integer("sprite_columns"),       // grid width  (e.g. 10)
spriteRows:          integer("sprite_rows"),          // grid height
spriteCellWidth:     integer("sprite_cell_width"),    // px
spriteCellHeight:    integer("sprite_cell_height"),   // px
durationMs:          integer("duration_ms"),          // probed media duration (drives scrubber + sprite math)
```

No new tables are required for Block 2. **Version stacks need no schema** — a deliverable's `file_version` rows
*are* the stack (ordered by `versionNumber`). Bulk upload reuses the existing multipart `upload_session` model
(09); the manager is client-side orchestration over many sessions.

> **Why columns, not a `sprite` table:** a sprite is 1:1 with a version and read together with it. A column keeps
> the read single-row and the worker write idempotent (overwrite on regenerate). Consistent with how `previewUrl`
> is already modeled.

---

## 4. API surface (new / changed)

All under the `files.versioning` flag gate (09). Validation is two-layer: Elysia `t` schema (→ 422 on shape) then
Zod domain refinement, per the project convention.

### 4.1 `GET /api/file-versions/:id/sprite`
Returns a signed URL for `thumbnailSpriteUrl` + the geometry needed to address cells, or `409` if not yet generated.
```jsonc
// 200
{ "url": "https://…signed…", "intervalMs": 2000, "columns": 10, "rows": 6,
  "cellWidth": 240, "cellHeight": 135, "durationMs": 118000 }
// 409  { "error": "SPRITE_NOT_READY" }
```
Tenant-guarded through the standard core guard; an id-guess across agencies → `404` (never `409`).

### 4.2 `GET /api/file-versions/:id/poster`
Signed URL for `posterFrameUrl`, or `409 POSTER_NOT_READY`. Used by the rail thumbnail and OG/share cards.

### 4.3 `POST /api/file-versions/deliverable/:deliverableId/upload-batch`
Opens N multipart sessions in one call so the **upload manager** can enqueue a folder/drop at once.
```jsonc
// request
{ "files": [ { "fileName": "hero_v3.mov", "fileSize": 824000000, "fileType": "video/quicktime",
               "fingerprint": "sha256:…", "purpose": "VERSION" },
             { "fileName": "hero_v3_thumb.png", "fileSize": 240000, "fileType": "image/png",
               "purpose": "COMPANION_PREVIEW", "targetVersionId": null } ] }
// 200 — one session descriptor per file (same shape as the single initiate today)
{ "sessions": [ { "sessionId": "…", "uploadId": "…", "partSize": 8388608, "key": "…" }, … ] }
```
Each entry validates with the **same** rules as the existing single `initiate` (size cap, mime allow-list,
purpose enum). Partial failure returns per-item `error` so the manager can show one row failed without aborting
the batch. **No new write semantics** — it is a fan-out over the shipped initiate.

### 4.4 No new compare endpoint
Compare is pure client state over data already returned by `GET /api/file-versions/deliverable/:id`. Documented
here so nobody builds a redundant endpoint.

---

## 5. Worker — sprite & poster generation

Extends `apps/worker/src/processors/media.ts` (the existing ffmpeg processor). Triggered by the **same**
`VERSION_UPLOADED` outbox event that already drives preview generation (relay media-eligibility rules unchanged,
09 §4b). After the review proxy is produced:

1. **Poster** — grab a representative frame:
   - video: `ffmpeg -ss {10% of duration} -i proxy -frames:v 1 -vf scale=640:-2 poster.jpg`
   - image: downscale the source to ≤640px long edge.
   - audio/pdf: skip poster (rail uses a glyph), set `posterFrameUrl = null`.
2. **Sprite** (time-media only) — tile frames at a fixed interval:
   - `intervalMs = clamp(round(durationMs / 60), 1000, 5000)` → ~60 cells max.
   - `ffmpeg -i proxy -vf "fps=1/{interval}, scale=240:-1, tile={cols}x{rows}" sprite.jpg`.
   - Persist `spriteIntervalMs/Columns/Rows/CellWidth/CellHeight/durationMs/thumbnailSpriteUrl`.
3. Upload both to object storage (R2 or local driver — same `objectStorage` abstraction). Write the columns in
   one `update`. Failure path mirrors preview: record `FAILED` reason, leave columns `null`, never throw the whole
   job (poster/sprite are enhancements, not gates).

**Idempotency:** keyed on `event.id` like all relay jobs; regeneration overwrites the same object keys. **Cost
guard:** sprite step is skipped when `durationMs < 4000` (a still poster suffices for very short clips).

---

## 6. The Compare engine (reusable client component)

A single component, `CompareStage`, replaces the ad-hoc dual-`MediaViewer` render in `review-room.tsx`. It is
**block-2 owned** (it is about versions/media) and **consumed by Block 3** (the Review Room) — built once, used
in both the Deliverable detail and the Review Room.

**File:** `apps/web/src/components/compare/compare-stage.tsx`
**Props:**
```ts
type CompareStageProps = {
  base: Version;                 // left / "A"
  against: Version | null;       // right / "B"  (null = single view, engine passes through)
  mode: "SIDE_BY_SIDE" | "SPLIT" | "ONION";
  currentTime: number;           // shared transport clock (seconds) for time-media
  onTime(t: number): void;
  zoom: { scale: number; x: number; y: number };  // shared for stills
  onZoom(next: CompareStageProps["zoom"]): void;
};
```
**Behavior by medium:**
- **Time-media (video/audio):** one transport clock drives both `<video>`/`<audio>` elements; the engine
  `requestVideoFrameCallback`-syncs B to A each frame and corrects drift > 1 frame (the "video drift correction"
  that 10 §Release-gaps flags). A single scrubber controls both. `SPLIT` shows A left / B right of a draggable
  vertical divider over the same frame; `ONION` cross-fades A↔B by an opacity slider (great for "did the logo
  move?").
- **Stills (image):** shared `zoom` (scale + pan offset) applied to both; wheel/pinch zoom and drag-pan on either
  pane moves both. `SPLIT` = a draggable wipe line; `ONION` = opacity blend; `SIDE_BY_SIDE` = two synced pan/zoom
  panes.
- **PDF:** synced page + zoom; `SPLIT`/`ONION` operate on the rendered page canvas.
- **Mixed types** (A is video, B is image): engine falls back to `SIDE_BY_SIDE` and disables `SPLIT`/`ONION`
  (with a tooltip "Split needs two of the same media type").

**States:** if `against` proxy is not `READY`, the B pane shows the same "Preview processing" fallback the single
viewer uses; the divider/onion controls disable until both are ready.

**Why a dedicated component:** the current code shares `currentTime` between two viewers but has no divider, no
zoom sync, no drift correction, and no diff mode — so it satisfies "two things on screen" but not v4's "comparison
viewer." Isolating it means the Review Room (§14) just renders `<CompareStage…/>` and stays small.

---

## 7. UI / UX flow — every screen, every component

All visuals derive from **04 §2 tokens** (graphite chrome, single tungsten accent, mono for timecode/version/size).
Status is **never color-only** (04 §9): every dot carries a label/icon. Motion is restrained and respects
`prefers-reduced-motion` (04 §8).

### 7.1 The VersionRail, upgraded (Deliverable detail + Review Room)

**Where:** `apps/web/src/routes/agency/deliverable-detail.tsx` (Versions tab) and `review-room.tsx`
(`review-version-rail`). Today each version is a flat `<button>` with a `Film` glyph + mono label + status word.
**Target component:** `VersionRail` (promote to `packages/ui` so both routes share it).

```
┌── VERSIONS ───────────┐
│  ⠿ drop a file to add │  ← drag-to-stack dropzone (G2); dashed --ash border, tungsten on dragover
│ ┌───────────────────┐ │
│ │▓▓ poster   v2.1 ● │ │  ← poster thumb · mono displayVersion · status dot (internal_review violet)
│ │   "tighter cut"   │ │  ← label
│ │   ⧉ LATEST        │ │  ← latest badge (mono, ash)
│ └───────────────────┘ │
│ ┌───────────────────┐ │
│ │▓▓ poster   v2.0 ○ │ │  ← hover plays a 3-frame sprite loop (G4)
│ │   2 comments      │ │
│ └───────────────────┘ │
│ ┌───────────────────┐ │
│ │▓▓ poster   v1.0 ✓ │ │  ← approved check, green dot + label "Approved"
│ └───────────────────┘ │
│ [ ⇆  Compare ]         │  ← enters Compare mode (§7.3); was a bare <select>
└───────────────────────┘
```

**Component anatomy**

| Element | Component | Props | Notes |
|---|---|---|---|
| Card | `VersionRail.Item` | `version, selected, onSelect, viewerDots?` | `data-selected`, `data-status`; the `viewerDots` slot is filled by Block 4 presence (§15) — leave the prop now |
| Thumb | `VersionThumb` | `posterUrl, fileType, spriteUrl?` | poster still by default; on `:hover`/focus, cycles 3 sprite cells (reduced-motion → static poster) |
| Label | `rx-mono` span | `displayVersion` | tabular figures; major bold, minor regular |
| Status | `StatusDot` (04 §6) | `status` | paired text label, never color-only |
| Latest badge | `Badge` | — | only on highest `versionNumber` |
| Dropzone | `VersionRail.Dropzone` | `onFiles(files)` | always present at top; `aria-label="Add a new version by dropping a file"`; keyboard alt = "Upload new version" button |

**Drag-to-stack (G2) interaction:** dropping file(s) on the dropzone **or** the media stage calls
`uploadManager.enqueue(files, { deliverableId, purpose: "VERSION" })` (§7.2). The new version appears immediately
as a **pending** card (spinner + "Uploading 38%") at the top of the stack, ascending to the real `versionNumber`
once `complete` returns. No full-page reload; the rail query is invalidated + `broadcastInvalidation` fired so
other viewers see it (Block 4).

**States:** *empty* (no versions) → the rail is replaced by a single large dropzone: *"Drop the first cut here, or
Upload new version."* *loading* → 3 skeleton cards. *error* (poster 409) → thumb falls back to a file-type glyph,
no error chrome (poster is non-essential).

### 7.2 Upload manager (bulk, resumable, backgrounded)

**New component:** `apps/web/src/components/upload/upload-manager.tsx`, mounted once in the agency shell so uploads
**survive route changes** (you can drop 12 files, navigate away, and watch them finish). A docked panel, bottom-right.

```
┌ Uploads ───────────────── ▾ ┐
│ hero_v3.mov     ▓▓▓▓▓░░ 71% │  ← per-file row: name (mono trunc), progress, speed, ✕ cancel
│   1.1 GB · 14 MB/s · ~9s    │
│ teaser_v3.mov   ⟳ resuming  │  ← reconnected; resumes from last completed part (09 fingerprint)
│ board_a.png     ✓ done      │
│ logo.ai         ✕ failed —  │  ← inline reason + Retry
│   "over 5 GB, link instead" │
├─────────────────────────────┤
│ 2 active · 1 queued   Clear │
└─────────────────────────────┘
```

**Anatomy**

| Element | Component | State/props |
|---|---|---|
| Dock | `UploadManager` | reads a Zustand/`useSyncExternalStore` `uploadStore` (id → {file, sessionId, parts, status, progress, speed}) |
| Row | `UploadRow` | `status ∈ queued\|signing\|uploading\|resuming\|completing\|done\|failed\|canceled` |
| Progress | `ProgressBar` | `value`; on `failed` turns to error color + reason |
| Controls | per-row `Cancel`/`Retry`; footer `Clear done` | cancel aborts the multipart (`abort` endpoint, 09) |

**Concurrency:** up to **3 files in parallel**, parts within a file uploaded `partSize`-chunked with up to 4 in
flight; backpressure when the tab is hidden. **Resume:** on mount or reconnect, the store rehydrates from
`GET /api/file-versions/uploads/:sessionId` (09) and **skips completed parts** — the manager re-requests the file
handle if the page reloaded (09: "requires re-selection after reload"), showing a *"Re-select hero_v3.mov to
resume"* row rather than silently stalling. **Batch open:** a multi-file drop calls `upload-batch` (§4.3) once.

**Copy (04 §7, action-named):** header `Uploads`; success toast *"3 versions uploaded."*; the over-cap error is the
exact 04 line: *"That file is over 5 GB — upload a smaller cut or paste an external link."*

**a11y:** the dock is an `aria-live="polite"` region announcing completions; every row control is keyboard
reachable; progress uses `role="progressbar"` with `aria-val:now`.

### 7.3 Compare mode (consumes §6 `CompareStage`)

Entering compare (rail `Compare` button, or `c` shortcut) swaps `review-media__canvas` for `<CompareStage>` and
reveals a **mode toolbar** above the scrubber:

```
[ A v2.1 ⇆ B v2.0 ▾ ]   ( ⬓ Side-by-side | ⊟ Split | ◑ Onion )   [ ⤢ Fit ]  [ × Exit compare ]
◄──────── one shared scrubber drives A & B ──────●───────────►   00:00:42:11
```

| Control | Component | Behavior |
|---|---|---|
| A/B picker | `VersionPicker` (×2) | choose which versions are A and B (defaults: latest vs previous) |
| Mode switch | `SegmentedControl` | `SIDE_BY_SIDE \| SPLIT \| ONION`; disabled modes greyed with tooltip when media types differ (§6) |
| Onion slider | `Slider` | only in `ONION`; A↔B opacity |
| Split divider | drag handle in `CompareStage` | only in `SPLIT`; keyboard ←/→ nudges 1% |
| Fit / zoom | `ZoomControl` | stills only; shared across panes |
| Exit | `Button` (ghost) | returns to single stage, keeps selected version A |

**States:** B-not-ready → B pane shows "Preview processing", mode switch limited to side-by-side. Single version in
the stack → the `Compare` button is hidden (current behavior preserved). Reduced-motion → onion cross-fade becomes
an instant toggle at 50%.

### 7.4 Hover-scrub frame preview (G4)

On the **scrubber track** (`scrubber-track`) and on rail thumbs: hovering (or keyboard-focusing + arrow) shows a
floating **frame bubble** sourced from the sprite (§5):

```
            ┌─────────┐
            │ ▓frame▓ │  ← sprite cell nearest the hovered time
            │00:00:42 │  ← mono time under the frame
            └────▲────┘
◄───────────────●──────────────────►
```

**Component:** `ScrubPreview` — given `spriteUrl, intervalMs, columns, rows, cell{W,H}, hoverTime`, it computes the
cell index `floor(hoverTime / (intervalMs/1000))` and renders a `background-position` crop. **No sprite yet (409)**
→ no bubble (graceful; the fill bar + markers still work exactly as today). Throttled to animation frames; hidden
on touch (no hover) where a long-press shows it instead.

### 7.5 @-version reference picker (G6)

Two entry points, one picker:
- **Comment composer** (`comment-composer` in review-room): a `🔖 Reference version` button opens `VersionPicker`;
  chosen versions render as removable `anchor-chip`s (`v2.0 ×`) and post as `refVersionIds[]` (already accepted).
- **Chat composer** (`chat-composer` in inbox): the existing **drag-a-version-into-chat** (`application/x-rexops-version`
  dataTransfer — real, in code) stays; the picker is the keyboard-accessible equivalent so it is not drag-only.

**Component:** `VersionPicker` — a popover listing the deliverable's stack (poster + `displayVersion` + status),
multi-select, returns `string[]`. Rendered chips link to the version in the rail. This makes the shipped
`refVersionIds` plumbing reachable without a mouse (a11y gap today).

### 7.6 Component inventory (Block 2 net-new / changed)

| Component | File | New? | Consumed by |
|---|---|---|---|
| `VersionRail`, `VersionRail.Item`, `VersionRail.Dropzone` | `packages/ui/version-rail/*` | promote+extend | deliverable-detail, review-room |
| `VersionThumb` | `packages/ui/version-rail/version-thumb.tsx` | new | VersionRail |
| `UploadManager`, `UploadRow` | `apps/web/.../components/upload/*` | new | agency shell (global) |
| `uploadStore` | `apps/web/.../lib/upload-store.ts` | new | UploadManager, drag-to-stack |
| `CompareStage` | `apps/web/.../components/compare/compare-stage.tsx` | new | review-room, deliverable-detail |
| `SegmentedControl`, `Slider`, `ZoomControl` | `packages/ui/*` | new (themed shadcn) | Compare toolbar |
| `ScrubPreview` | `apps/web/.../components/media/scrub-preview.tsx` | new | scrubber, VersionThumb |
| `VersionPicker` | `packages/ui/version-picker.tsx` | new | comment + chat composers |

All themed via `packages/ui` (04 §6 — shadcn never raw).

### 7.7 Motion, copy, a11y, responsive (deltas only)
- **Motion:** drag-to-stack drop → the new card slides in from the dropzone; sprite hover-loop is the *only*
  ambient motion and is reduced-motion-gated. Compare divider drag uses no inertia (precise instrument).
- **Copy:** `Compare`, `Exit compare`, `Add a new version`, `Re-select to resume`, `3 versions uploaded`. Sizes
  and durations are mono. No "Submit."
- **a11y:** Compare divider and onion slider are keyboard operable; upload dock is `aria-live`; every status dot
  has text; hover-scrub has a focus/long-press equivalent.
- **Responsive:** below `md`, the rail becomes a horizontal filmstrip (04 §11); compare collapses to a stacked
  A-over-B with a single shared scrubber; the upload dock becomes a collapsible bottom sheet.

---

## 8. Test matrix

| Layer | Test | Asserts |
|---|---|---|
| worker | sprite math | `intervalMs` clamp; cell index ↔ time mapping is exact at boundaries |
| worker | poster/sprite failure | columns stay `null`, job not failed, proxy still `READY` |
| api | `GET /sprite` not ready | `409 SPRITE_NOT_READY`; cross-tenant id → `404` |
| api | `upload-batch` partial fail | good files get sessions; bad file returns per-item `error`; no batch abort |
| web (unit) | `ScrubPreview` cell index | `floor(t / interval)` clamped to `cols*rows-1` |
| web (unit) | `CompareStage` drift | B corrected when `|tB - tA| > 1 frame` |
| web (e2e, gated) | drag-to-stack | dropping a file creates a pending card → resolves to `v{n+1}` |
| web (e2e, gated) | bulk resume | reload mid-upload → "re-select to resume" → completes skipping done parts |
| a11y | upload dock + compare | `accesslint` clean; keyboard path for divider/onion/picker |

E2E uses the `playwright` MCP against a seeded deliverable (04 §10 pillar 2). Browser/CORS proofs that 09 lists as
release gaps are satisfied here.

---

## 9. Definition of Done (Block 2 enhancements)
- [ ] Additive columns shipped; worker writes poster + sprite on `VERSION_UPLOADED`; idempotent regenerate.
- [ ] `VersionRail` shows poster, status dot+label, minor/major, latest badge; hover-scrub works; reduced-motion safe.
- [ ] Drag-to-stack creates the next version via the upload manager with optimistic pending card.
- [ ] `UploadManager` does ≥3 parallel files, per-file resume across reconnect + reload, cancel, retry, backgrounded.
- [ ] `CompareStage` does side-by-side / split / onion with synced transport (drift-corrected) and synced zoom/pan.
- [ ] `VersionPicker` gives a keyboard path to `refVersionIds` from comment + chat composers.
- [ ] Test matrix green; `accesslint` clean; CORS/large-file smokes recorded (closes 09 release gaps).

## 10. Deferred to Phase 5 (per v4 §E — do **not** build here)
Forensic/DRM watermark proxies (proxy-only downloads + latency tradeoff); 3D asset versions (rotate/zoom/eye-level);
live-web/HTML asset versions. The `Share` model already carries a `watermark` enum (`NONE|STANDARD|FORENSIC`) so
forensic is a later worker/render concern, not a schema change. These remain out of Block 2.
