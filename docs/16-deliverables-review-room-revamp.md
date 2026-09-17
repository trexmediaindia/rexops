# Deliverables Review Room — Complete Revamp Plan

> **Target file when approved:** copy this document to `docs/16-deliverables-review-room-revamp.md`
> (the only repo doc that does not yet exist for this surface; it reads alongside
> `docs/14-block-3-review-approval-enhancements.md`, `docs/13-block-2-files-versioning-enhancements.md`,
> and `docs/02-domain-model.md`).
>
> **Feature key:** `review.wedge` · **Phase:** revamp of Block 3 surfaces · **Status:** planned
>
> **Decisions locked with the user (2026-06-30):**
> 1. Annotation engine = **best-of-breed per medium** (Annotorious image · Konva video/PDF · wavesurfer audio).
> 2. Approval model = **two-stage, approver-gated** (internal approvers sign the internal stage; the client signs
>    the client stage; every decision button is gated by the authenticated user's real role **and** membership in
>    the currently-active stage's approver list — never by the URL).
> 3. Compare entry = **picker dialog** (A/B dropdowns with an A≠B guard + mode choice, then enter compare).
> 4. Scope = **frontend rebuild + deeper backend rework** (unify the two status models, strip INTERNAL comments
>    server-side for clients, introduce a strict typed anchor schema).

---

## Table of contents

1. [Context — why this revamp](#1-context--why-this-revamp)
2. [Current-state assessment (grounded in code)](#2-current-state-assessment-grounded-in-code)
3. [Target architecture overview](#3-target-architecture-overview)
4. [Library decisions and rationale](#4-library-decisions-and-rationale)
5. [Information architecture & the new layout](#5-information-architecture--the-new-layout)
6. [The unified, typed anchor model](#6-the-unified-typed-anchor-model)
7. [Annotation layer — per medium](#7-annotation-layer--per-medium)
8. [Comment ↔ anchor navigation (`focusAnchor`)](#8-comment--anchor-navigation-focusanchor)
9. [Comments panel revamp](#9-comments-panel-revamp)
10. [Compare revamp](#10-compare-revamp)
11. [Identity, roles & the approve-button fix](#11-identity-roles--the-approve-button-fix)
12. [Status-model unification](#12-status-model-unification)
13. [Client view & guest/share parity](#13-client-view--guestshare-parity)
14. [Backend changes](#14-backend-changes)
15. [Component inventory (new / changed / deleted)](#15-component-inventory-new--changed--deleted)
16. [End-to-end data-flow walkthroughs](#16-end-to-end-data-flow-walkthroughs)
17. [Phased implementation roadmap](#17-phased-implementation-roadmap)
18. [Testing & verification](#18-testing--verification)
19. [Risks & mitigations](#19-risks--mitigations)
20. [Dependencies to add / remove](#20-dependencies-to-add--remove)
21. [Open questions deferred](#21-open-questions-deferred)

---

## 1. Context — why this revamp

The `agency/deliverables` review experience is the product's core "wedge": the screen where an uploaded
deliverable (video / image / PDF / audio) is annotated, discussed, compared across versions, and formally
approved. The **backend for this is already rich and tested** (full anchored-comment model, threading, reactions,
resolve, comment→task, a real review pipeline with INTERNAL→CLIENT stages, quorum, SLA, append-only approvals with
e-signature, and the compare data). See `docs/02-domain-model.md` §5 and `docs/14-block-3-review-approval-enhancements.md`
§2 (the "API shipped, UI missing" ledger).

**The problems are concentrated in the frontend**, and they are exactly the ones the user reported:

- **Compare** never lets you choose which two versions to compare — the button auto-grabs one.
- **Anchors / tags / rectangles** are bad: the annotation library is half-wired, saved annotations are never drawn
  back onto the media, and the in-progress pin is misaligned.
- **Comments** with a timestamp or region don't reliably take you to that spot — navigation is timecode-only and
  ignores regions, PDF pages, and audio ranges.
- **Approve** shows on the agency screen when it should be gated to the right approver during the right stage.
- Plus a long tail of structural flaws (two competing status models, INTERNAL comments leaking into the client
  payload, single-level reply nesting, a hard-coded static client home, and a near-duplicate guest viewer stack).

**Intended outcome:** a single, coherent, best-in-class review room where annotation, commenting, compare, and
approval all feel deliberate and reliable — built on the existing backend, with a small, well-scoped set of
backend hardening changes. This document is ~80% a UI/UX + frontend-architecture specification and ~20% backend
delta, matching where the real work is.

---

## 2. Current-state assessment (grounded in code)

All paths are absolute under `/Users/naman/Desktop/manas/rexops`. Line numbers are from the current tree.

### 2.1 The files that make up the surface today

| Concern | File | Size |
|---|---|---|
| Review room page (layout, state, mutations, decision bar, share dialog) | `apps/web/src/routes/review-room.tsx` | 1159 |
| Media stage host + compare modes | `apps/web/src/components/compare/compare-stage.tsx` | 248 |
| Per-format viewers + annotation drawing | `apps/web/src/components/viewers/viewer-registry.tsx` | 290 |
| Comment list / cards / replies / reactions | `apps/web/src/components/review/comment-thread.tsx` | 417 |
| Version rail (list + select + thumbs) | `apps/web/src/components/versioning/version-rail.tsx` | 203 |
| Version picker / chips popover | `apps/web/src/components/versioning/version-picker.tsx` | 107 |
| Version view types | `apps/web/src/components/versioning/types.ts` | 30 |
| Audit / stage timeline | `apps/web/src/components/review/audit/stage-timeline.tsx` | — |
| Presence (avatars, ghost playheads, viewer dots, follow) | `apps/web/src/components/presence/*` | — |
| Scrub sprite thumbnail | `apps/web/src/components/media/scrub-preview.tsx` | — |
| Guest/share variant (parallel impl) | `apps/web/src/routes/share-review.tsx` | 358 |
| Agency cockpit (version stage + revisions + activity) | `apps/web/src/routes/agency/deliverable-detail.tsx` | 390 |
| Client home (static demo) | `apps/web/src/routes/client/home.tsx` | — |
| Routing | `apps/web/src/router.tsx` | — |
| Deliverable CRUD + transition | `apps/api/src/modules/deliverables/deliverables.{routes,service}.ts` | — |

### 2.2 Annotation — the worst offender

- `@annotorious/react` is imported **only** in `viewer-registry.tsx:1` and rendered inside `ImageViewer`
  (lines ~138–156) as `<ImageAnnotator tool={tool}>`, but **no `onCreateAnnotation` handler reads its output** —
  so the rectangle/polygon UI is decorative and emits no anchor. The only image anchor is a manual
  `<img onDoubleClick>` POINT (line ~143).
- **Video** uses a hand-rolled `<svg class="proof-overlay">` overlay (`VideoViewer`, line ~80) with its own
  Point/Box/Draw toolbar (~62–76); regions are normalized 0–1 against the SVG box and stamped with
  `timecodeMs = round(currentTime*1000)`.
- **PDF** wraps the canvas in a `<button>`; click emits a POINT normalized to the canvas DOM bounds — but the
  canvas size changes with `scale`/`rotation`, and rotation is **not** accounted for, so a point saved at one
  zoom/rotation will not map back cleanly.
- **Audio** uses wavesurfer + RegionsPlugin (`enableDragSelection`) and emits `WAVEFORM_RANGE` on
  `region-updated` only (not on create); no notion of "the" anchor if several regions exist.
- **Saved annotations are never re-rendered onto the media** (grep for `geometry`/`REGION` confirms no draw-back).
  Only the *in-progress* POINT pin renders, and it is positioned on the **outer** `review-media__canvas` div, so
  it ignores letterboxing and the `transform: translate()/scale()` applied to `.compare-stage__pane`
  (`compare-stage.tsx:178`) → it visibly drifts when zoomed/panned or when media doesn't fill the canvas.
- Each viewer ships its **own** toolbar, so the toolset is inconsistent across media. The `anchor` field on the
  comment model is untyped (`Record<string, unknown>`) with ad-hoc `Number(anchor?.timecodeMs)` casts scattered
  across `review-room.tsx` (818/827/832/907) and `comment-thread.tsx` (250–253).

### 2.3 Comment ↔ region navigation — timecode-only

- Scrubber markers (`review-room.tsx:816–835`) only show comments where
  `anchorType === "TIMECODE" || anchor?.timecodeMs`; clicking calls `setTime(...)`. Region/waveform comments with
  no `timecodeMs` never appear.
- The comment-card anchor button (`comment-thread.tsx:249–259` → `review-room.tsx:905–908`) only does
  `selectVersion + setTime(timecodeMs)`. A REGION does not scroll/zoom/highlight; a WAVEFORM_RANGE never seeks
  audio; a PDF region never jumps to its `page`.
- Programmatic seeks are unreliable: video has a `0.35s` dead-band (`viewer-registry.tsx:46`) that drops small
  seeks; **wavesurfer has no `currentTime`→player sync effect at all**, so audio seeks do nothing.
- There is no "active comment" state, so clicking a comment never highlights it or its on-media annotation, and
  hovering an annotation never highlights its comment.

### 2.4 Compare — no real chooser

- `Compare` button (`review-room.tsx:638–652`) and the `c` hotkey (~406–423) both do
  `versions.find(v => v.id !== selected.id)` — **B is auto-picked; the user never chooses.**
- A/B `VersionPicker` dropdowns exist but only render **after** compare is already active
  (`.compare-toolbar`, ~672–723); the A picker is unfiltered so **A can equal B** (compare a version with itself).
- Pane B's `onAnchor` is a no-op (`compare-stage.tsx:207`) — you can only annotate version A.
- `share-review.tsx` has **no compare at all**.
- Modes `SIDE_BY_SIDE | SPLIT | ONION` exist; SPLIT/ONION silently downgrade to side-by-side across differing
  media; still media (image/pdf) get pan/zoom, A/V get a `requestAnimationFrame` drift-sync loop driven off raw
  DOM elements.

### 2.5 Roles & the approve leak

- **There is no real role detection on the review screen.** Agency-vs-client is a single React prop `clientMode`
  hard-wired by the route: `/agency/review/$id` → `clientMode=false`, `/client/review/$id` →
  `clientMode=true` (`router.tsx:95–167`). The session is read only for `user.id`/`user.name`
  (`review-room.tsx:278–280`); `user.role` is never consulted, and **no route is role-guarded.**
- The decision bar gate is `canDecide = (clientMode && status==="UNDER_CLIENT_REVIEW") || (!clientMode &&
  status==="UNDER_INTERNAL_REVIEW")` (`review-room.tsx:207–216`). Because `clientMode` is just the URL, **any**
  authenticated user opening `/agency/review/$id` during `UNDER_INTERNAL_REVIEW` sees Approve/Reject — with no
  check that they are an assigned approver. The structured approver data exists
  (`ReviewRun.stages[].approvers`, `stage-timeline.tsx:32–38`) but `DecisionBar` never receives it.
- The real role/permission model lives only in the API (`deliverables.service.ts`): `principal.role`
  (`SUPER_ADMIN`, `AGENCY_MEMBER`, `CLIENT_*` by prefix), `principal.permissions.canApprove`, `agencyId`,
  `clientId`, plus `can()`, `assertWritablePrincipal`, `assertClientRecordAccess`,
  `stripInternalDeliverableFields`.

### 2.6 Other structural flaws

- **Two parallel status models**: a flat `deliverable.status` 10-state enum (`deliverables.routes.ts:86–97`) and a
  structured review-run/stage/approver pipeline (`stage-timeline.tsx`). The decision UI keys only off the flat
  string.
- **INTERNAL comments are filtered client-side only** — the room query fetches *all* comments
  (`review-room.tsx:318`) and the client just hides the INTERNAL tab (~873–874). Confidentiality depends on the
  backend stripping, which is not guaranteed for the client principal.
- **Reply nesting is single-level** despite a recursive `CommentCard` (it passes `replies={[]}` to children,
  `comment-thread.tsx:332–333`).
- **Client home is fully static** with hard-coded demo IDs and a non-navigating "Open review" `<button>`
  (`client/home.tsx:29–52`).
- **`share-review.tsx` duplicates** the viewer/anchor/comment stack — two implementations to keep in sync.
- Agency and client are in **different Liveblocks rooms** (`review:$id` vs `review:$id:client`) so presence never
  crosses sides.

---

## 3. Target architecture overview

The revamp keeps the existing 3-zone review-room shell but rebuilds each zone around four pillars:

```
                         ┌────────────────────────────────────────────────────────────────┐
                         │  ReviewRoom (single component; mode derived from session, not URL)│
                         └────────────────────────────────────────────────────────────────┘
   ┌──────────────┐        ┌───────────────────────────────────────────┐        ┌───────────────────────┐
   │ VERSION RAIL │        │            MEDIA STAGE                     │        │   COMMENTS / ACTIVITY  │
   │ multi-select │        │  ┌─────────────────────────────────────┐  │        │  threaded, anchored,   │
   │ for compare  │        │  │  MediaViewer (per medium)           │  │        │  filterable, live      │
   │ + LATEST     │        │  │   + AnnotationLayer (per medium)    │  │        │                        │
   │ + status     │        │  │     • Annotorious  (image)          │  │        │  CommentComposer       │
   └──────────────┘        │  │     • Konva overlay (video, pdf)    │  │        │   anchor chip + tools  │
                           │  │     • wavesurfer Regions (audio)    │  │        └───────────────────────┘
                           │  └─────────────────────────────────────┘  │        ┌───────────────────────┐
                           │  UnifiedTransport (one scrubber+markers)  │        │  AUDIT DRAWER          │
                           │  CompareController (dialog → A/B + mode)  │        │  stages + approvals    │
                           │  DecisionBar (role + approver gated)      │        └───────────────────────┘
                           └───────────────────────────────────────────┘
```

Cross-cutting layers introduced or hardened:

- **`ReviewSession` context** — resolves the *authenticated* viewer's capabilities once (role side, whether they
  are an approver on the active stage, can comment, can annotate, can compare, can share, internal-visibility),
  and every gated control reads from it. Replaces the `clientMode` prop as the source of truth.
- **`Anchor` (typed)** — a discriminated union shared by viewers, the composer, the comment list, navigation, and
  the API DTOs. Replaces `Record<string, unknown>`.
- **`AnnotationLayer` contract** — a per-medium component that both **captures** new annotations and **renders**
  all stored annotations for the current version + position, with a single shared `AnnotationToolbar`.
- **`focusAnchor(anchor)`** — one imperative API on the stage that every medium implements (seek / scroll-to-page
  / pan-zoom-to-region / select-waveform-region) so a comment click always lands you on the spot.
- **`CompareController`** — owns version A/B selection (via the dialog), mode, sync, and lets **both** panes be
  annotated.

---

## 4. Library decisions and rationale

Per the user's choice, annotation is **best-of-breed per medium**. Net new dependencies are small; most of the
stack is already installed.

| Need | Library | Status | Why |
|---|---|---|---|
| **Image** region annotation (rect / polygon / point) | `@annotorious/react` v3 | already in `apps/web/package.json` | Purpose-built, W3C Web Annotation model, TS, React bindings, draws stored annotations back natively. We finally wire its `onCreateAnnotation`/`onSelectionChanged` + load stored annotations. ([annotorious.dev](https://annotorious.dev/react/image-annotation/)) |
| **Video** + **PDF** drawing overlay (box / arrow / freehand / point / polygon) | `konva` + `react-konva` | **add** | Best React canvas library for interactive annotation overlays — declarative shapes, drag/transform, hit-testing; we size a `<Stage>` to the media element and sync to `currentTime` (video) or page (pdf). Chosen over Fabric.js because it has official React bindings and a stronger event/drag model for annotation tools. ([dev.to comparison](https://dev.to/lico/react-comparison-of-js-canvas-libraries-konvajs-vs-fabricjs-1dan), [react-konva](https://github.com/konvajs/react-konva)) |
| **Audio** waveform regions + markers | `wavesurfer.js` v7 + RegionsPlugin | already installed | A region with only a `start` is a marker; ranges carry `start`+`end`; supports click-to-seek and custom `content`. We add the missing `currentTime`→player sync and render stored ranges. ([wavesurfer regions](https://wavesurfer.xyz/docs/)) |
| **Video** player | `video.js` | already installed | Keep, but **hide native controls** (`controls:false`) and drive a single app transport; Konva overlay layered above. |
| **PDF** rendering | `pdfjs-dist` v6 | already installed | Keep; render page to canvas, Konva overlay per page; add proper page→region coordinate mapping that survives zoom/rotation. |
| **Version compare** slider (split / onion / side-by-side) | `react-compare-slider` v4 | **add** | Zero-dependency, supports **images, video, canvas, and arbitrary React nodes** (so it works for every medium and even for two annotated viewers), accessible (keyboard + screen reader). The strongest, most-used option per the 2026 survey. ([croct survey](https://blog.croct.com/post/best-react-before-after-image-comparison-slider-libraries), [react-compare-slider](https://react-compare-slider.vercel.app/)) |
| **Pipeline / stage editor** drag-reorder (deferred sub-feature) | `@dnd-kit/core` + `@dnd-kit/sortable` | **add (only if pipeline editor is in scope this pass)** | Accessible DnD for stage reordering (matches `docs/14` §6.5). Can be deferred. |

**Explicitly not chosen:** Velt SDK (hosted, would replace our own comment/realtime backend we already own);
`react-image-annotate` / `react-pdf-highlighter` (unmaintained, last publish years ago);
Fabric.js (no official React bindings, weaker annotation-tool ergonomics than Konva).

---

## 5. Information architecture & the new layout

### 5.1 The shell (kept, refined)

`ReviewRoom` stays wrapped by `AgencyShell` / `ClientShell` inside a `RealtimeRoom`, but:

- The shell choice and the room id derive from **`ReviewSession.side`** (resolved from `session.user.role`),
  not from a `clientMode` prop. Agency and client join the **same** Liveblocks room (`review:$deliverableId`)
  with role baked into presence, so presence/cursors/typing cross sides (with INTERNAL-only affordances hidden
  for clients). This removes the "two different rooms" split.

### 5.2 Three-zone workspace (desktop ≥ `lg`)

```
┌ HEADER ─────────────────────────────────────────────────────────────────────────────────────┐
│  ‹ Back   Eyebrow · Deliverable title            PresenceAvatars   StatusChip   Audit   Share │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
┌ VERSION RAIL ─┐┌ MEDIA STAGE ────────────────────────────────────────────────┐┌ COMMENTS ──────┐
│ ▣ v2.1  LATEST ││ ┌ AnnotationToolbar (per medium, unified styling) ────────┐ ││ [Open·Resolved·│
│ ▢ v2.0         ││ │  ▭ Box   → Arrow   ✎ Draw   • Point   ⬠ Poly   ⤺ Undo  │ ││  Mine·Internal]│
│ ▢ v1.0         ││ └─────────────────────────────────────────────────────────┘ ││ ─────────────  │
│ ───────────    ││ ┌ MediaViewer + AnnotationLayer ─────────────────────────┐  ││ CommentThread  │
│ [+ upload]     ││ │   media, with stored annotations drawn + live capture  │  ││  (nested,      │
│ ───────────    ││ │   region pins/boxes track the media transform exactly  │  ││   anchored)    │
│ Compare ▾      ││ └─────────────────────────────────────────────────────────┘  ││  …             │
│ (opens dialog) ││ UnifiedTransport: ◀▶ play · 00:00:42 · ──●────── markers     ││ ─────────────  │
│                ││ DecisionBar  (only the actions this viewer may take)        ││ CommentComposer│
└────────────────┘└─────────────────────────────────────────────────────────────┘└────────────────┘
```

- **Version rail (left):** each item shows `displayVersion` (`v{major}.{minor}`), a `LATEST` badge, status chip,
  thumbnail (existing `VersionThumb` sprite scrub), and a **compare checkbox** that appears on hover / when the
  Compare affordance is engaged. The rail's "Compare ▾" opens the **CompareDialog** (§10).
- **Media stage (center):** a single `AnnotationToolbar` at the top (medium-aware tools, consistent styling),
  the `MediaViewer` + `AnnotationLayer`, then the `UnifiedTransport` (one scrubber with comment markers,
  ghost playheads, sprite hover preview), then the `DecisionBar`.
- **Comments (right):** filter segmented control, typing indicator, `CommentThread`, and `CommentComposer`.
- **Audit drawer:** slides over the right edge (read-only stage/approval trail). **Share dialog:** agency-share
  side only.

### 5.3 Responsive

- `< lg`: rail collapses to a horizontal version chip-strip above the stage; comments become a bottom sheet over
  the stage (drag handle to expand); audit becomes a full-screen modal. Mobile-first for the client/guest room.
- `< md`: annotation tools collapse into an overflow menu; compare is side-by-side only.

### 5.4 Motion & a11y (carry forward `docs/04` intent)

- A newly arriving live comment pulses its scrubber marker once; resolving animates the card into the Resolved
  group; `prefers-reduced-motion` → instant.
- Status is **never color-only** (every chip carries text). Threads are `role="tree"`; the mention menu is a
  combobox; reactions are toggle buttons with `aria-pressed`; the audit drawer is a labeled region.
- Keyboard: `c` compare dialog, `r` reply, `e` resolve, `[`/`]` prev/next comment, `space` play/pause,
  `←/→` frame-step (video), `Esc` exit compare / unfollow / close dialog.

---

## 6. The unified, typed anchor model

This is the spine of fixing both "anchors are bad" and "comment navigation is bad." A single discriminated union
lives in a new shared module and is used by viewers, the composer, the comment list, navigation, and the API DTO.

**New file:** `apps/web/src/components/review/anchor.ts` (mirrored by a Zod schema in
`packages/core` / the reviews module DTO — see §14.3).

```ts
// Normalized geometry is ALWAYS 0..1 relative to the *intrinsic media frame*
// (not the DOM box), so it survives zoom/pan/rotation/letterboxing.
export type NormalizedPoint = { x: number; y: number };
export type Geometry =
  | { kind: "POINT";     x: number; y: number }
  | { kind: "RECTANGLE"; x: number; y: number; width: number; height: number }
  | { kind: "ARROW";     x1: number; y1: number; x2: number; y2: number }
  | { kind: "POLYGON";   points: NormalizedPoint[] }
  | { kind: "PATH";      points: NormalizedPoint[] };          // freehand

export type Anchor =
  | { type: "NONE" }
  | { type: "TIMECODE";      timecodeMs: number }                                   // AV, no region
  | { type: "REGION";        geometry: Geometry; timecodeMs?: number; page?: number } // image/video/pdf
  | { type: "WAVEFORM_RANGE"; startMs: number; endMs: number };
// (VIEWPOINT_3D / WEB_SELECTOR remain in the enum for the future; not built now.)
```

Rules that remove today's bugs:

- **Coordinates are intrinsic-frame-normalized**, computed by inverting the viewer's current
  transform (zoom/pan/rotation/letterbox), so an annotation captured at 2× zoom renders correctly at 1× and in
  compare panes. (Today's POINT is normalized against a DOM box that changes with scale.)
- **`timecodeMs` is carried on REGION for video** (so the same record both pins a frame and a place), enabling the
  scrubber marker *and* the on-frame box.
- **`page` is carried on REGION for PDF** so navigation can jump to the page.
- A `WAVEFORM_RANGE` always has both `startMs` and `endMs`; audio with no drag falls back to `TIMECODE` at the
  playhead (fixing the current "audio → NONE" gap).
- The comment model's `anchor` column becomes this typed shape end-to-end (frontend `ReviewComment.anchor: Anchor`,
  backend Zod-validated — §14.3).

**Anchor labelling** (one helper, used by composer chip, comment card, marker tooltip):
`anchorLabel(anchor)` → `@ 00:00:42` (timecode/region+timecode), `Region` (image/pdf region),
`p.3 region` (pdf), `0:12–0:18` (waveform), `General` (none).

---

## 7. Annotation layer — per medium

### 7.1 Shared contract

Every viewer renders `{ media element } + <AnnotationLayer>`. The layer is responsible for **both** capture and
render, and exposes an imperative handle for navigation.

```ts
type AnnotationLayerProps = {
  versionId: string;
  medium: "image" | "video" | "pdf";          // audio uses the wavesurfer-native path (§7.5)
  tool: AnnotationTool;                         // from the shared AnnotationToolbar
  annotations: StoredAnnotation[];              // all comments' anchors for this version (+page/time filtered)
  activeAnnotationId: string | null;            // the focused comment's anchor (highlight)
  transform: ViewerTransform;                   // {zoom, panX, panY, rotation, contentRect} from the viewer
  positionMs?: number;                          // current video time (to show only near-in-time marks)
  page?: number;                                // current pdf page
  onCreate: (anchor: Anchor) => void;           // a finished annotation → composer anchor chip
  onHoverAnnotation: (id: string | null) => void; // reverse-highlight the comment
};
export type AnnotationLayerHandle = { focusGeometry: (g: Geometry) => void };
```

`AnnotationTool = "select" | "point" | "box" | "arrow" | "draw" | "polygon"`. A single
`AnnotationToolbar` (new, `components/review/annotation-toolbar.tsx`) renders the medium-appropriate subset and is
styled once — replacing the three divergent per-viewer toolbars.

`ViewerTransform` is the key to alignment: each viewer reports the rect of the *rendered content* inside its box
(`contentRect`) plus zoom/pan/rotation. The annotation layer maps intrinsic-normalized geometry → screen via this
transform, and inverts it on capture. This guarantees overlays line up under letterboxing, zoom, pan, rotation,
and compare panes — fixing flaws 2.2 (misaligned pin) and 2.4 (still-zoom drift).

### 7.2 Image — Annotorious (properly wired)

- Render `<Annotorious><ImageAnnotator>` with the image. **Wire the events:** subscribe to
  `onCreateAnnotation` / `onSelectionChanged` (via the Annotorious store/hooks) and translate the W3C target
  selector into our `Anchor` (`REGION` with `RECTANGLE`/`POLYGON`/`POINT` geometry, normalized to the image's
  intrinsic size).
- **Load stored annotations** into Annotorious on mount (map our `StoredAnnotation[]` → W3C annotations) so they
  draw back — and set the selected one when `activeAnnotationId` changes.
- Hover on an Annotorious shape → `onHoverAnnotation(id)` to reverse-highlight the comment; click → `focusAnchor`.
- This replaces the dead double-click POINT path; Annotorious becomes the real image engine (decision: best-of-breed).

### 7.3 Video — Konva overlay, time-synced

- `VideoViewer` keeps `video.js` but with `controls:false`; the app `UnifiedTransport` is the only transport.
- A `react-konva` `<Stage>` is absolutely positioned over the `<video>`, sized to the rendered video rect
  (letterbox-aware) and re-measured on resize/fullscreen.
- **Capture:** the active `AnnotationTool` drives shape creation — `box` (drag → RECTANGLE), `arrow` (drag →
  ARROW), `draw` (pointer move → PATH), `point` (click → POINT), `polygon` (click-to-add, dbl-click close). On
  finish, `onCreate({ type:"REGION", geometry, timecodeMs: round(currentTime*1000) })`.
- **Render-back:** stored REGION annotations whose `timecodeMs` is within a small window of `positionMs`
  (e.g. ±150 ms, or "pinned open" while their comment is active) are drawn as Konva shapes; others are hidden so
  the frame isn't cluttered — Frame.io behavior. The active annotation is highlighted (thicker stroke + label).
- **Frame stepping:** `←/→` step ±1 frame using the version's fps (fall back to 24 if unknown; today's `timecode()`
  hard-codes 24 — we thread real fps from `durationMs`/metadata when available).

### 7.4 PDF — Konva overlay per page, transform-correct

- Render the page to canvas via `pdfjs-dist`; compute a `contentRect` + `rotation` and pass to the layer.
- The Konva `<Stage>` overlays the page canvas; capture/render use intrinsic-page-normalized coordinates that
  **account for `scale` and `rotation`** (fixing 2.2's PDF mapping bug). Each annotation carries `page`.
- Stored annotations for the **current page** render; navigation to another page (via a comment) flips the page
  then draws + focuses.
- Add a continuous-scroll option later (deferred); single-page with prev/next is the v1.

### 7.5 Audio — wavesurfer Regions, synced

- Keep wavesurfer + RegionsPlugin. **Add the missing `currentTime`→`ws.setTime()` sync effect** so programmatic
  seeks move the audio playhead (fixes 2.3).
- **Render stored ranges** as regions on load (not just live drags); a region with only `start` is a marker.
- Drag-select → `onCreate({ type:"WAVEFORM_RANGE", startMs, endMs })`; click a region → `focusAnchor` seeks to
  `startMs` and visually selects it; no-drag comment falls back to `TIMECODE` at the playhead.
- Single source of truth for "the pending anchor": only the last-created/selected region feeds the composer.

### 7.6 Annotation persistence flow

A finished annotation does **not** immediately persist; it becomes the **composer's pending anchor chip**
(`anchor-chip`, e.g. `Region pinned ✕` or `@ 00:00:42`). On **Send**, the comment is created with that typed
`anchor`. This matches the existing round-trip but with the typed model and guaranteed render-back. The composer
shows a live preview of the pending shape on the media (using the same layer, in a "pending" style) so the user
sees exactly what they pinned before sending.

---

## 8. Comment ↔ anchor navigation (`focusAnchor`)

One imperative function on the media stage, implemented per medium, fixes the "clicking a comment should take me
there" requirement comprehensively. The stage exposes a ref handle:

```ts
type MediaStageHandle = {
  focusAnchor: (versionId: string, anchor: Anchor) => void;
};
```

`focusAnchor` does, in order:
1. **Switch version** if `versionId !== selected.id` (and exit/adjust compare if needed).
2. **Seek time** for AV: `TIMECODE`/`REGION.timecodeMs` → set transport time; for video, **remove the 0.35 s
   dead-band** for explicit (non-throttled) seeks; for audio, call the new wavesurfer sync.
3. **Go to PDF page** for `REGION.page`.
4. **Select audio region** for `WAVEFORM_RANGE` (seek `startMs`, highlight the region).
5. **Pan/zoom to region** for image/video/pdf `REGION` so the region is comfortably centered and the annotation
   layer highlights it (`activeAnnotationId`), with a brief pulse.
6. **Highlight the comment card** (scroll into view in the thread, set `activeCommentId`).

Reverse direction: hovering/selecting an on-media annotation calls `onHoverAnnotation(id)` →
`setActiveCommentId(id)` so the relationship is bidirectional. Scrubber markers, comment-card anchor chips, and
the Revisions "Jump" links all call `focusAnchor`, so there is exactly one navigation path. This removes the
timecode-only limitation (2.3) and the dead region/page/waveform clicks.

---

## 9. Comments panel revamp

The backend already supports everything here (`docs/14` §2 ledger); this is a UI build. Replace the flat article
list with a proper recursive thread.

### 9.1 Thread & cards

- `CommentThread` (rebuild `components/review/comment-thread.tsx`) groups by `parentId` into **true multi-level
  nesting** (fix 2.6's single-level cap) with sensible indent caps and "continue thread" affordance for deep
  chains. Roots vs replies via `parentId`, recursive `CommentCard` that actually passes children.
- `CommentCard` shows: avatar · author · **anchor chip** (`anchorLabel`, clickable → `focusAnchor`) · overflow
  menu · body · reaction bar · actions row (Reply / Resolve / Convert to task) · `TaskChip` once
  `spawnedTaskId` set.
- `CommentBody` parses `@mention` (bound to `mentionUserIds`) and `#hashtag` (bound to `hashtags[]`) into chips.
- `ReactionBar` shows per-emoji counts with a filled state when *I* reacted; clicking **toggles** via the
  unique-constraint endpoints (no double counts).
- Resolve moves the card into a dimmed, collapsible "Resolved" group; its scrubber/annotation marker dims but
  stays.
- **Active-comment highlight:** the card matching `activeCommentId` gets a highlight ring and its annotation is
  emphasized on the media (the §8 bidirectional link).

### 9.2 Composer

- `CommentComposer` (extend) with: pending **anchor chip** (✕ to clear), `@` mention autocomplete
  (`MentionMenu` querying `/api/reviews/users`, inserting real `userId`s only — mirrors `validateMentions`),
  `#` hashtag tokens, attachment button, **Agency-only toggle** (hidden for clients; visibility forced
  `CLIENT_VISIBLE`), reference-version chips (`VersionChips`/`VersionPicker` → `refVersionIds`), textarea, Send.
- Optimistic insert with a pending dot; reconciled on invalidate + live event (`broadcastInvalidation`).

### 9.3 Convert-to-task & revisions loop

- "Convert to task" (agency only) calls `comments/:id/task`; idempotent → relabels to **View task** once
  `spawnedTaskId` is set; the `RevisionList` on `deliverable-detail.tsx` shows the spawned `COMMENT_FEEDBACK`
  tasks, each linking back to the source comment+anchor via `focusAnchor` (jump into the room). This finally makes
  the feedback→task loop visible (`docs/14` §6.2).

### 9.4 Filters & live

- Segmented filter `Open / Resolved / Mine / Internal` (Internal hidden for clients). Live `COMMENT_ADDED` /
  `COMMENT_RESOLVED` / `REACTION_FLY` events merge into the query cache (keep the existing realtime bus).

---

## 10. Compare revamp

### 10.1 Entry — the dialog (user's choice)

- A `CompareDialog` (new, `components/compare/compare-dialog.tsx`) opened from the rail's "Compare" affordance
  (and the `c` hotkey): two `VersionPicker` dropdowns (A and B) **with an A≠B guard** (B's options exclude A and
  vice-versa; default A = current selected, B = previous version), plus a mode radio
  (`Split` / `Onion` / `Side-by-side`). `Compare` confirms → enters compare with explicit A/B.
- This fixes 2.4's "no chooser" and the "A can equal B" bug.

### 10.2 The stage — `react-compare-slider`

- Rebuild `CompareStage` around `react-compare-slider` for `SPLIT` (wipe handle) and reuse its node-rendering for
  `SIDE_BY_SIDE`; `ONION` keeps an opacity blend control. Because the slider accepts **arbitrary React nodes**, A
  and B are each a full `MediaViewer` (+ `AnnotationLayer`), so compare works for every medium and shows
  annotations on both sides.
- **Both panes annotatable:** pane B's `onCreate` is wired (no more no-op) so the user can annotate either version;
  comments stay attributed to the version they were drawn on (the anchor carries `fileVersionId`), and a subtle
  `A`/`B` watermark prevents mis-attribution.
- Keep the A/V drift-sync (RAF) and still-media pan/zoom, but lift them to read from the typed transform so
  overlays stay aligned. Mode auto-downgrades to side-by-side only across genuinely different media, with a small
  inline note explaining why.
- Compare toolbar: swap A/B, change mode, zoom/fit, exit (restores single stage).

### 10.3 Share/guest compare

- Guest/share room reuses the same `CompareStage` (read-only annotate per `share.allowComment`), closing the
  "share has no compare" gap.

---

## 11. Identity, roles & the approve-button fix

This is the central correctness fix. The approve leak has two root causes (2.5): mode derived from URL, and no
approver check. Both are fixed by a real capability layer.

### 11.1 `ReviewSession` — capabilities from the authenticated user

New context `apps/web/src/components/review/review-session.tsx`, provided high in the route. It combines:

- `session.user` (id, name, **role**) from `authClient.useSession()` — role is now actually read.
- The deliverable's `status`, the structured `stages` (`GET …/stages`), and the active stage's `approvers`.

It derives:

```ts
type ReviewSide = "AGENCY" | "CLIENT" | "GUEST";
type ReviewCapabilities = {
  side: ReviewSide;                       // from role (CLIENT_* → CLIENT; AGENCY_*/SUPER_ADMIN → AGENCY; share → GUEST)
  canComment: boolean;
  canAnnotate: boolean;
  canCompare: boolean;
  canShare: boolean;                      // agency only
  canSeeInternal: boolean;                // agency only
  activeStage: ReviewStage | null;        // the currently-ACTIVE stage of the review run
  isApproverOnActiveStage: boolean;       // user.id ∈ activeStage.approvers AND activeStage.type matches side
  decision: {
    canApprove: boolean;                  // see gate below
    canRequestChanges: boolean;
    canReject: boolean;
    requiresESignature: boolean;          // true on CLIENT-stage approve
  };
};
```

### 11.2 The decision gate (replaces `clientMode && status`)

A decision action is offered **iff all** hold:

1. The user's `side` matches the **active stage's `type`** (`INTERNAL` stage → AGENCY side; `CLIENT` stage →
   CLIENT side).
2. The user is in that stage's **approver list** (`isApproverOnActiveStage`), respecting `mode`
   (SEQUENTIAL → it must be their turn by `approverOrder`; PARALLEL → any listed approver who hasn't yet decided),
   and quorum not already met.
3. `principal.permissions.canApprove` is true (defense-in-depth; server already enforces).

So:
- **Agency screen during `UNDER_INTERNAL_REVIEW`:** only an assigned **internal** approver sees
  Approve/Request-changes/Reject. A random agency viewer sees the quiet "No decision required" state — fixing the
  leak.
- **Client screen during `UNDER_CLIENT_REVIEW`:** only the client-of-record approver sees the decision bar, with
  the **e-signature** field (`requiresESignature`).
- Agency still gets the **workflow** actions it should: `Submit for review` (`READY_FOR_INTERNAL_REVIEW`) and
  `Promote to client` (`INTERNAL_APPROVED`) — these are workflow transitions, not approvals, and are gated by
  agency side + permission, not by approver membership.

`DecisionBar` is refactored to take `capabilities.decision` + `activeStage` instead of `clientMode`+`status`, and
renders only the buttons it's allowed. The server endpoints (`/decisions`, `/submit-internal`, `/promote`) already
authorize independently, so this is the UI half of a defense-in-depth pair.

### 11.3 Route guards

Add `beforeLoad` role guards in `router.tsx`: a `CLIENT_*` user hitting `/agency/review/$id` is redirected to
`/client/review/$id` and vice-versa; unauthorized cross-tenant access 404s (mirrors server). The component no
longer trusts the URL for capability — but the guard keeps users on their correct shell.

---

## 12. Status-model unification

Per the user's scope choice, reconcile the two competing models (2.6) so the UI has one source of truth.

- Treat the **review-run/stage pipeline as authoritative** for *where in review* a deliverable is, and keep
  `deliverable.status` as a **derived projection** for list/board filtering (it already is meant to be derived per
  `docs/02` §3). Define an explicit mapping `stageState → deliverableStatus` in `@rexops/core`
  (e.g. active INTERNAL stage → `UNDER_INTERNAL_REVIEW`; all internal passed → `INTERNAL_APPROVED`; active CLIENT
  stage → `UNDER_CLIENT_REVIEW`; client passed → `APPROVED`; any reject → `REVISION_REQUESTED`).
- The reviews service recomputes `deliverable.status` from stage transitions inside the same transaction that
  records a decision (it already emits `DELIVERABLE_STATUS_CHANGED`), removing drift between the decision bar and
  the status chip.
- The UI reads stage state from `GET …/stages` for the decision bar/audit and shows the derived
  `deliverable.status` only as a coarse label. No more gating UI off a string that can disagree with the stages.

This is additive (a mapping function + recompute-on-decision), not a schema migration.

---

## 13. Client view & guest/share parity

### 13.1 Single `ReviewRoom`, one viewer stack

- Collapse `share-review.tsx`'s duplicate viewer/anchor/comment stack into the shared components
  (`MediaViewer`, `AnnotationLayer`, `CompareStage`, `CommentThread`, `CommentComposer`). The guest page becomes a
  thin wrapper that supplies a `GUEST` `ReviewSession` (identity by name, capabilities from `share.allowComment` /
  `allowDownload`) and the public endpoints. One comment/annotation UI to maintain (fixes 2.6 duplication).

### 13.2 Real client home

- Replace the static `client/home.tsx` (hard-coded demo IDs, dead "Open review" button) with a data-fetched
  "For your review (N)" list from the client-scoped deliverables endpoint, each card linking to
  `/client/review/$id`. Remove the non-navigating button.

### 13.3 INTERNAL comment confidentiality

- The room comment query must rely on **server-side stripping** for client/guest principals (§14.4), not the
  client-side tab filter. The client never receives INTERNAL rows in the payload.

---

## 14. Backend changes

Small, additive, and mostly hardening. Reviews module owns comments/stages/decisions
(`apps/api/src/modules/reviews/*`); deliverables module owns CRUD/transition.

### 14.1 Threaded comments endpoint (`docs/14` §4.2 — server gap A)

`GET /api/reviews/deliverables/:id/comments?view=threaded&cursor=…` → `{ roots, repliesByParent, nextCursor }`.
Pure projection over existing rows; default stays the flat array for back-compat. Enables deep threads + paging.

### 14.2 Guest attachment upload (`docs/14` §4.3 — server gap B)

`POST /api/public/shares/:token/attachments` — share-scoped, rate-limited, mime/size-capped signed upload writing
into the existing attachments module with `audience: GUEST`, gated by `share.allowComment`. Closes guest parity.

### 14.3 Typed anchor schema (scope choice)

- Add a Zod schema for `Anchor` (§6) in the reviews DTO; `createComment` validates `anchor` against it and
  `normalizedAnchor`s per medium. Reject malformed geometry (today it's `Record<string, unknown>`). No new table —
  the `comment.anchor jsonb` column gains a validated shape; `anchorType` stays the enum.
- Add the two tiny additive columns from `docs/14` §3 if not present: `resolvedByUserId`, `editedAt`.

### 14.4 Server-side INTERNAL stripping for clients (scope choice)

- `listComments` (and the threaded view) must drop `visibility = INTERNAL` rows when the principal is `CLIENT_*`
  or a guest share — at the **query**, not the client. Mirror the existing `stripInternalDeliverableFields`
  pattern (`deliverables.service.ts`) for comments. Closes the confidentiality concern (2.6 / §13.3).

### 14.5 Status recompute (scope choice, §12)

- A `recomputeDeliverableStatus(deliverableId, tx)` helper in the reviews service called inside `decideReview` /
  stage transitions, using the `@rexops/core` `stageState → deliverableStatus` mapping. Same transaction, same
  outbox event. No schema change.

### 14.6 Tasks read (already specced, `docs/14` §4.4)

- `GET /api/work/deliverables/:id/tasks` + `PATCH /api/work/tasks/:id` behind `review.wedge` for the revisions
  loop (may already exist per `deliverable-detail.tsx` usage; confirm and reuse).

> **No new tables.** Everything above is an endpoint projection, a validator, a query-level filter, or a derived
> recompute — consistent with `docs/02` §10 additivity policy.

---

## 15. Component inventory (new / changed / deleted)

| Component / module | File | Action |
|---|---|---|
| Typed `Anchor` model + `anchorLabel` | `apps/web/src/components/review/anchor.ts` | **new** |
| `ReviewSession` context + capabilities | `apps/web/src/components/review/review-session.tsx` | **new** |
| `AnnotationToolbar` (unified, medium-aware) | `apps/web/src/components/review/annotation-toolbar.tsx` | **new** |
| `AnnotationLayer` (image/video/pdf capture+render) | `apps/web/src/components/viewers/annotation-layer.tsx` | **new** |
| `MediaViewer` (wraps per-medium viewer + layer + transform) | `apps/web/src/components/viewers/media-viewer.tsx` | **new** (absorbs `viewer-registry.tsx`) |
| `UnifiedTransport` (one scrubber + markers + sprite hover) | `apps/web/src/components/review/unified-transport.tsx` | **new** |
| `CompareDialog` (A/B pickers + mode, A≠B guard) | `apps/web/src/components/compare/compare-dialog.tsx` | **new** |
| `MentionMenu` | `apps/web/src/components/review/mention-menu.tsx` | **new** |
| `TaskChip` | `apps/web/src/components/work/task-chip.tsx` | **new** |
| Per-medium viewers (Annotorious image, video.js+Konva, pdfjs+Konva, wavesurfer) | `apps/web/src/components/viewers/viewer-registry.tsx` | **rebuild** |
| `CompareStage` (react-compare-slider, both panes annotatable) | `apps/web/src/components/compare/compare-stage.tsx` | **rebuild** |
| `CommentThread` / `CommentCard` / `CommentBody` (multi-level) | `apps/web/src/components/review/comment-thread.tsx` | **rebuild** |
| `CommentComposer` (anchor chip, mention, hashtag, attach) | (split out of `review-room.tsx`) | **new/extract** |
| `DecisionBar` (capability-gated) | (in `review-room.tsx` today) → `apps/web/src/components/review/decision-bar.tsx` | **extract + rebuild** |
| `ReviewRoom` (mode from session, `focusAnchor` host) | `apps/web/src/routes/review-room.tsx` | **major refactor** |
| Guest room → thin wrapper over shared stack | `apps/web/src/routes/share-review.tsx` | **rebuild (dedupe)** |
| Client home → data-fetched review list | `apps/web/src/routes/client/home.tsx` | **rebuild** |
| Role `beforeLoad` guards + single room id | `apps/web/src/router.tsx` | **change** |
| `RevisionList` jump uses `focusAnchor` | `apps/web/src/components/work/revision-list.tsx` | **change** |
| Reviews service: threaded view, INTERNAL strip, status recompute, anchor Zod | `apps/api/src/modules/reviews/*` | **change** |
| `stageState → deliverableStatus` mapping | `packages/core/*` | **new** |
| Public guest attachment upload | `apps/api/src/modules/.../public shares` | **new** |

**CSS:** extend `apps/web/src/enhancements.css` with the new `annotation-toolbar`, `annotation-layer`,
`unified-transport`, `compare-dialog`, and active-comment/annotation highlight tokens, reusing the existing theme
variables (`--ash`, `--mist`, `--paper`, `--graphite`, `--tungsten`, mono font). No new design system.

---

## 16. End-to-end data-flow walkthroughs

### 16.1 Annotate a video frame and comment

1. User picks the `box` tool in `AnnotationToolbar`; drags on the Konva overlay over the `<video>`.
2. The layer inverts the current `ViewerTransform` → intrinsic-normalized `RECTANGLE`; on pointer-up calls
   `onCreate({ type:"REGION", geometry, timecodeMs })`.
3. `ReviewRoom` sets the composer's pending anchor; an `anchor-chip` (`@ 00:00:42`) appears and a "pending" box is
   shown on the frame.
4. User types `logo too big @Mia #branding`, hits Send → `createComment({ fileVersionId, message, anchorType:
   "REGION", anchor, mentionUserIds:[mia], hashtags:["branding"] })`.
5. Server `normalizedAnchor`s, validates via the Zod schema, writes the row + `COMMENT_ADDED` outbox + mention
   notification; returns the row.
6. Query invalidates; the comment appears in the thread; its REGION renders on the frame at its `timecodeMs`, and
   a scrubber marker appears. Live event pulses the marker.

### 16.2 Click a comment → land on the spot (every medium)

1. User clicks a comment's anchor chip (or a scrubber marker, or a Revisions "Jump").
2. `focusAnchor(versionId, anchor)` runs: switch version if needed → seek/flip-page/select-region per medium →
   pan/zoom the region into view → set `activeAnnotationId` + `activeCommentId` → pulse both.
3. Hovering the on-media annotation reverse-highlights the comment, and vice-versa.

### 16.3 Compare two chosen versions

1. User clicks Compare → `CompareDialog` opens with A=current, B=previous, mode=Split; A≠B enforced.
2. Confirm → `CompareStage` mounts two `MediaViewer`s in `react-compare-slider`; A/V sync via RAF; both panes
   show their stored annotations; either pane is annotatable (anchor carries the right `fileVersionId`).
3. Exit → single stage restored.

### 16.4 Approve — only the right person, the right stage

1. `ReviewSession` resolves `side` from `session.user.role` and `isApproverOnActiveStage` from `GET …/stages`.
2. `DecisionBar` shows Approve/Request-changes/Reject **only** if side matches the active stage type, the user is
   an eligible approver (order/quorum), and `canApprove`. Client approve requires e-signature.
3. On Approve → `POST …/decisions`; server records the append-only `approval` (+ e-sign on client), recomputes
   `deliverable.status`, emits outbox; audit drawer + status chip update live.

---

## 17. Phased implementation roadmap

Each phase is independently shippable behind the `review.wedge` flag and verifiable.

**Phase 0 — Foundations (no visible change)**
- Add deps (`konva`, `react-konva`, `react-compare-slider`).
- Introduce the typed `Anchor` model (`anchor.ts`) + `anchorLabel`; refactor all `Record<string,unknown>` anchor
  reads to the union (compile-time safety). Backend: add the `Anchor` Zod schema + validate in `createComment`.

**Phase 1 — `ReviewSession` + approve fix** *(highest-value correctness)*
- Build `ReviewSession` context + capabilities; refactor `DecisionBar` to be capability-gated; add router role
  guards; single room id. Verify the approve leak is gone (agency non-approver sees no Approve; client approver
  does, with e-sign).

**Phase 2 — Annotation layer (per medium)**
- `AnnotationToolbar` + `AnnotationLayer` contract + `ViewerTransform`. Wire Annotorious (image) properly; Konva
  overlays for video + pdf with correct transform math; wavesurfer render-back + `currentTime` sync. Render stored
  annotations; pending-anchor preview. Verify alignment under zoom/pan/rotation/letterbox.

**Phase 3 — `focusAnchor` navigation**
- Implement the imperative handle per medium; wire comment chips, scrubber markers, Revisions jumps; bidirectional
  active-highlight. Verify clicking any anchor type lands correctly.

**Phase 4 — Comments panel**
- Rebuild `CommentThread` (multi-level), `CommentBody`, `ReactionBar`, composer (mention/hashtag/attach), convert-
  to-task + `TaskChip` + `RevisionList` loop. Backend threaded endpoint + server-side INTERNAL stripping.

**Phase 5 — Compare**
- `CompareDialog` + `CompareStage` on `react-compare-slider`; both panes annotatable; share/guest compare.

**Phase 6 — Status unification + client/guest dedupe**
- `stageState → deliverableStatus` mapping + recompute-on-decision; collapse `share-review.tsx` to the shared
  stack; real client home; guest attachment upload.

**Phase 7 — Polish**
- Motion, a11y pass (accesslint), keyboard shortcuts, responsive bottom-sheet/modal, fps threading, audit drawer
  refinements. (Optional: pipeline editor with dnd-kit — can defer.)

---

## 18. Testing & verification

| Layer | Test | Asserts |
|---|---|---|
| web unit | `anchor.ts` round-trip | intrinsic-normalize → screen → intrinsic is stable under zoom/pan/rotation |
| web unit | `AnnotationLayer` capture | each tool emits the correct `Geometry`; video stamps `timecodeMs`; pdf stamps `page` |
| web unit | `focusAnchor` | TIMECODE seeks; REGION pans+highlights; WAVEFORM seeks+selects; PDF flips page |
| web unit | `ReviewSession.decision` gate | agency non-approver → no Approve; internal approver → Approve; client → Approve+e-sign; quorum/order respected |
| web unit | `ReactionBar` toggle | second click removes (unique constraint), no double count |
| web unit | `CommentBody` parse | `@id`/`#tag` render as chips bound to stored arrays |
| web unit | Convert-to-task idempotency | second click → "View task", not a new task |
| web unit | `CompareDialog` guard | cannot pick A == B; B options exclude A |
| api | threaded view | groups by `parentId`; cursor paginates roots only |
| api | INTERNAL stripping | client principal never receives `visibility=INTERNAL` rows |
| api | anchor validation | malformed geometry → 422; valid per-medium anchors normalize |
| api | guest attachment | scoped to token; respects `allowComment`; mime/size cap; foreign token → 404 |
| api | status recompute | decision transitions recompute `deliverable.status` per the mapping, same tx |
| e2e (gated) | annotate→comment→navigate | draw on each medium, comment, click it elsewhere, land on the spot |
| e2e (gated) | compare | pick A/B in dialog, split/onion sync, annotate both panes |
| e2e (gated) | approve flow | only the right approver sees/uses Approve; e-sign recorded; audit shows it |
| a11y | accesslint | thread tree, mention combobox, toolbar, audit region clean; status never color-only |

**Manual verification (per `superpowers:verification-before-completion`):** run the stack locally
(`docs/runbooks/local-development.md`; see project memory "RexOps Docker local run"), open a deliverable with one
asset per medium, and walk §16's four flows. Use the Playwright MCP to drive: annotate a video box, post a
comment, click it from the thread, confirm the frame seeks + region highlights; open Compare, pick two versions,
verify the slider + both-pane annotations; log in as an agency non-approver and confirm **no** Approve button,
then as the client approver and confirm Approve + e-signature. Screenshot each for the PR.

---

## 19. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Konva overlay alignment under fullscreen/responsive resize | Re-measure `contentRect` on `ResizeObserver` + fullscreen change; unit-test the transform inversion; the `ViewerTransform` contract centralizes the math. |
| Annotorious ↔ our `Anchor` mapping drift | Single adapter module with round-trip tests; load + create both go through it. |
| `react-compare-slider` with two heavy `MediaViewer`s (perf) | Lazy-mount B only in compare; pause the hidden pane's playback; reuse the existing RAF drift-sync, not per-frame React renders. |
| Approve gate vs. server authority disagreeing | Server `/decisions` remains the authority; UI gate is defense-in-depth; e2e asserts both agree. |
| Status recompute causing unexpected board moves | Mapping is explicit and table-tested; recompute only on real stage transitions, in the same tx, behind the flag. |
| INTERNAL stripping breaking agency view | Strip only for `CLIENT_*`/guest principals; agency unaffected; api test covers both. |
| Scope creep (pipeline editor, 3D/clips) | Explicitly deferred (§21); the flag lets phases ship independently. |

---

## 20. Dependencies to add / remove

**Add** (`apps/web/package.json`):
- `konva` + `react-konva` — video/pdf annotation overlay.
- `react-compare-slider` — version compare (split/onion/side-by-side, any node).
- *(optional, only if pipeline editor lands this pass)* `@dnd-kit/core` + `@dnd-kit/sortable`.

**Keep / better-use:** `@annotorious/react` (now actually wired for image), `wavesurfer.js` (+ RegionsPlugin,
now with sync + render-back), `video.js` (native controls off), `pdfjs-dist` (transform-correct overlay).

**Remove:** the bespoke `proof-overlay` SVG annotation code in `VideoViewer` and the dead Annotorious-without-
handlers path (superseded by `AnnotationLayer`); the duplicate viewer/anchor stack in `share-review.tsx`.

---

## 21. Open questions deferred

- **Pipeline / stage editor** (`docs/14` §6.5) — owner UI to configure stages/quorum/SLA. Valuable but separable;
  proposed for Phase 7 or a follow-up, gated on whether you want it in this pass.
- **3D / live-web / screen+voice clips** annotation — explicitly Phase 5 deferred per `docs/14` §9.
- **Continuous-scroll PDF** (vs single-page prev/next) — v2 enhancement.
- **Forensic watermark** on shares — enum exists; out of scope here.

---

## 22. Detailed component specifications

These are execution-ready sketches for the highest-risk new components. They are illustrative (names/props are
canonical; bodies are abbreviated) and should be read with §6–§11.

### 22.1 `ReviewSession` — capability resolution

```tsx
// apps/web/src/components/review/review-session.tsx
type ReviewStage = {
  id: string; name: string; type: "INTERNAL" | "CLIENT";
  mode: "SEQUENTIAL" | "PARALLEL"; requiredCount: number;
  status: "PENDING" | "ACTIVE" | "PASSED" | "REJECTED";
  dueAt: string | null;
  approvers: Array<{ userId: string; name: string; required: boolean; approverOrder: number }>;
  decisions: Array<{ decidedByUserId: string; decision: "APPROVE"|"REQUEST_CHANGES"|"REJECT" }>;
};

function resolveCapabilities(args: {
  role: string;                       // session.user.role
  userId: string;
  isShare: boolean;
  permissions: { canApprove?: boolean };
  stages: ReviewStage[];
  shareGrants?: { allowComment: boolean; allowDownload: boolean };
}): ReviewCapabilities {
  const side: ReviewSide =
    args.isShare ? "GUEST"
    : args.role.startsWith("CLIENT_") ? "CLIENT"
    : "AGENCY";

  const activeStage = args.stages.find((s) => s.status === "ACTIVE") ?? null;

  const sideMatchesStage =
    activeStage != null &&
    ((side === "AGENCY" && activeStage.type === "INTERNAL") ||
     (side === "CLIENT" && activeStage.type === "CLIENT"));

  const myApprover = activeStage?.approvers.find((a) => a.userId === args.userId) ?? null;
  const alreadyDecided = activeStage?.decisions.some((d) => d.decidedByUserId === args.userId) ?? false;
  const quorumMet =
    activeStage != null &&
    activeStage.decisions.filter((d) => d.decision === "APPROVE").length >= activeStage.requiredCount;

  // For SEQUENTIAL stages it must be this approver's turn (lowest undecided approverOrder).
  const myTurn =
    activeStage == null || myApprover == null ? false :
    activeStage.mode === "PARALLEL" ? true :
    Math.min(
      ...activeStage.approvers
        .filter((a) => !activeStage.decisions.some((d) => d.decidedByUserId === a.userId))
        .map((a) => a.approverOrder)
    ) === myApprover.approverOrder;

  const isApproverOnActiveStage =
    sideMatchesStage && myApprover != null && !alreadyDecided && !quorumMet && myTurn;

  const canApprove =
    isApproverOnActiveStage && (side === "GUEST" || args.permissions.canApprove !== false);

  return {
    side,
    canComment: side !== "GUEST" || (args.shareGrants?.allowComment ?? false),
    canAnnotate: side !== "GUEST" || (args.shareGrants?.allowComment ?? false),
    canCompare: true,
    canShare: side === "AGENCY",
    canSeeInternal: side === "AGENCY",
    activeStage,
    isApproverOnActiveStage,
    decision: {
      canApprove,
      canRequestChanges: canApprove,
      canReject: canApprove,
      requiresESignature: side === "CLIENT" && (activeStage?.type === "CLIENT"),
    },
  };
}
```

`ReviewSession` provides this via context; `DecisionBar`, `CommentComposer`, `AnnotationToolbar`, the Share button,
and the comment filter all read it instead of `clientMode`.

### 22.2 `DecisionBar` — capability-gated

```tsx
// apps/web/src/components/review/decision-bar.tsx
function DecisionBar({ status }: { status: string }) {
  const cap = useReviewSession();

  // Agency workflow transitions (not approvals): gated by side + permission, not approver membership.
  if (cap.side === "AGENCY" && status === "READY_FOR_INTERNAL_REVIEW")
    return <WorkflowButton action="submit-internal">Submit for review</WorkflowButton>;
  if (cap.side === "AGENCY" && status === "INTERNAL_APPROVED")
    return <WorkflowButton action="promote">Promote to client</WorkflowButton>;

  // Approval decisions: only an eligible approver on the active stage of THEIR side.
  if (!cap.decision.canApprove)
    return <div className="decision-bar decision-bar--quiet">No decision is required from you right now.</div>;

  return (
    <div className="decision-bar">
      {cap.decision.requiresESignature && <ESignatureField /* typed-name, validated length */ />}
      <button onClick={() => decide("APPROVE")}><Check size={16}/> Approve</button>
      <button onClick={() => decide("REQUEST_CHANGES")}><Pencil size={16}/> Request changes</button>
      <button onClick={() => decide("REJECT")}><X size={16}/> Reject</button>
    </div>
  );
}
```

The Approve button is **structurally absent** unless `cap.decision.canApprove` — which can never be true for an
agency non-approver, fixing the leak at the source.

### 22.3 `AnnotationLayer` — capture & render (video/pdf via Konva)

```tsx
// apps/web/src/components/viewers/annotation-layer.tsx  (Konva path)
function KonvaAnnotationLayer({
  tool, annotations, activeAnnotationId, transform, positionMs, page, onCreate, onHoverAnnotation,
}: AnnotationLayerProps) {
  const [draft, setDraft] = useState<Geometry | null>(null);

  // intrinsic(0..1) -> screen(px) using the reported content rect (+ rotation for pdf)
  const toScreen = (p: NormalizedPoint) => projectPoint(p, transform);
  const toIntrinsic = (sx: number, sy: number) => unprojectPoint(sx, sy, transform);

  const visible = annotations.filter((a) =>
    a.anchor.type === "REGION" &&
    (page == null || a.anchor.page === page) &&
    (positionMs == null || a.anchor.timecodeMs == null ||
      Math.abs(a.anchor.timecodeMs - positionMs) < 150 || a.id === activeAnnotationId)
  );

  return (
    <Stage width={transform.contentRect.width} height={transform.contentRect.height}
           style={{ position: "absolute", left: transform.contentRect.left, top: transform.contentRect.top }}
           onPointerDown={startDraft} onPointerMove={extendDraft} onPointerUp={commitDraft}>
      <Layer>
        {visible.map((a) => (
          <AnnotationShape key={a.id} geometry={a.anchor.geometry} toScreen={toScreen}
            active={a.id === activeAnnotationId}
            onMouseEnter={() => onHoverAnnotation(a.id)} onMouseLeave={() => onHoverAnnotation(null)} />
        ))}
        {draft && <AnnotationShape geometry={draft} toScreen={toScreen} pending />}
      </Layer>
    </Stage>
  );

  function commitDraft() {
    if (!draft) return;
    onCreate({ type: "REGION", geometry: draft, timecodeMs: positionMs, page });
    setDraft(null);
  }
}
```

For **image**, the layer instead delegates to Annotorious (load stored annotations on mount, subscribe to
create/select, map W3C ↔ `Anchor`). For **audio**, capture/render live in the wavesurfer Regions path (§7.5), not
Konva.

### 22.4 `UnifiedTransport` — one scrubber, all media

```tsx
// apps/web/src/components/review/unified-transport.tsx
function UnifiedTransport({ durationMs, positionMs, markers, fps, onSeek, onPlayPause, playing }: {
  durationMs: number; positionMs: number; fps: number;
  markers: Array<{ id: string; timecodeMs: number; resolved: boolean; active: boolean }>;
  onSeek: (ms: number) => void; onPlayPause: () => void; playing: boolean;
}) {
  return (
    <div className="unified-transport">
      <button onClick={onPlayPause} aria-label={playing ? "Pause" : "Play"}>{playing ? "❚❚" : "►"}</button>
      <span className="rx-mono">{timecode(positionMs, fps)}</span>
      <div role="slider" aria-valuenow={positionMs} aria-valuemax={durationMs}
           className="unified-transport__track" onPointerDown={seekFromPointer}>
        <div className="unified-transport__fill" style={{ width: `${(positionMs/durationMs)*100}%` }} />
        {markers.map((m) => (
          <button key={m.id} className="unified-transport__marker"
            data-resolved={m.resolved} data-active={m.active}
            style={{ left: `${(m.timecodeMs/durationMs)*100}%` }}
            onClick={() => onSeek(m.timecodeMs)} />
        ))}
        <GhostPlayheads /> <ScrubPreview />
      </div>
    </div>
  );
}
```

This replaces both the video.js native bar and the bespoke `review-scrubber`; it is the single transport for
video and audio (audio routes `onSeek` through the new wavesurfer sync), and is hidden for stills.

### 22.5 `CompareStage` — `react-compare-slider` with two viewers

```tsx
// apps/web/src/components/compare/compare-stage.tsx
import { ReactCompareSlider } from "react-compare-slider";

function CompareStage({ base, against, mode, onAnchorA, onAnchorB }: CompareStageProps) {
  const A = <MediaViewer version={base} onCreate={onAnchorA} /* full annotate */ />;
  const B = <MediaViewer version={against} onCreate={onAnchorB} muted lowPriority />;

  if (mode === "SIDE_BY_SIDE")
    return <div className="compare-stage" data-mode="side"><Pane label={`A · ${base.displayVersion}`}>{A}</Pane>
                                                          <Pane label={`B · ${against.displayVersion}`}>{B}</Pane></div>;
  if (mode === "ONION")
    return <div className="compare-stage" data-mode="onion">{A}<div className="onion-overlay">{B}</div>
             <BlendControl /* sets --compare-opacity */ /></div>;
  // SPLIT
  return <ReactCompareSlider itemOne={A} itemTwo={B} className="compare-stage" data-mode="split" />;
}
```

Both `onAnchorA`/`onAnchorB` are real (no no-op pane); annotations attribute to the correct `fileVersionId`. A/V
drift-sync remains a RAF loop reading the rendered `<video>/<audio>` elements (not per-frame React state).

### 22.6 `CompareDialog` — A/B with the A≠B guard

```tsx
// apps/web/src/components/compare/compare-dialog.tsx
function CompareDialog({ versions, defaultA, onConfirm, onClose }: CompareDialogProps) {
  const [a, setA] = useState(defaultA);
  const [b, setB] = useState(versions.find((v) => v.id !== defaultA)?.id ?? null);
  const [mode, setMode] = useState<CompareMode>("SPLIT");
  const bOptions = versions.filter((v) => v.id !== a);
  const aOptions = versions.filter((v) => v.id !== b);
  return (
    <Dialog onClose={onClose} title="Compare versions">
      <VersionPicker label="A" versions={aOptions} selectedIds={[a]} multiple={false}
        onChange={(ids) => ids[0] && setA(ids[0])} />
      <VersionPicker label="B" versions={bOptions} selectedIds={b ? [b] : []} multiple={false}
        onChange={(ids) => setB(ids[0] ?? null)} />
      <ModeRadio value={mode} onChange={setMode} options={["SPLIT","ONION","SIDE_BY_SIDE"]} />
      <button disabled={!a || !b || a === b} onClick={() => onConfirm({ a, b: b!, mode })}>Compare</button>
    </Dialog>
  );
}
```

The disabled guard plus the mutually-exclusive option lists make A == B impossible.

---

## 23. The transform math (alignment correctness)

Today's misalignment comes from normalizing against a DOM box that changes with zoom. The fix is to normalize
against the **intrinsic content** and project through the viewer's reported transform.

```ts
// ViewerTransform reported by each viewer
type ViewerTransform = {
  contentRect: { left: number; top: number; width: number; height: number }; // rendered media rect within the viewer box
  zoom: number;            // 1 = fit
  panX: number; panY: number;   // px offset applied to the content
  rotation: 0 | 90 | 180 | 270; // pdf only
};

// intrinsic (0..1, pre-rotation) -> screen px
function projectPoint(p: NormalizedPoint, t: ViewerTransform) {
  const r = rotateUnit(p, t.rotation);                       // handle pdf page rotation
  return {
    x: t.contentRect.left + t.panX + r.x * t.contentRect.width  * t.zoom,
    y: t.contentRect.top  + t.panY + r.y * t.contentRect.height * t.zoom,
  };
}

// screen px -> intrinsic (inverse of the above; used on capture)
function unprojectPoint(sx: number, sy: number, t: ViewerTransform): NormalizedPoint {
  const u = {
    x: (sx - t.contentRect.left - t.panX) / (t.contentRect.width  * t.zoom),
    y: (sy - t.contentRect.top  - t.panY) / (t.contentRect.height * t.zoom),
  };
  return rotateUnit(u, (360 - t.rotation) % 360 as 0|90|180|270);
}
```

`contentRect` is computed from the media's intrinsic aspect ratio vs. the viewer box (letterbox math), so a 16:9
video in a 4:3 box maps correctly. A `ResizeObserver` + fullscreen/`loadedmetadata` listeners keep `contentRect`
current. Unit tests assert `unproject(project(p)) ≈ p` across a matrix of zoom/pan/rotation/letterbox cases.

---

## 24. `stageState → deliverableStatus` mapping (full)

Authoritative recompute used by §12 / §14.5. Implemented in `@rexops/core`; the reviews service calls it inside
the decision transaction.

| Review-run / stage condition | Derived `deliverable.status` |
|---|---|
| No review run yet, file uploaded | `READY_FOR_INTERNAL_REVIEW` |
| Internal stage `ACTIVE` | `UNDER_INTERNAL_REVIEW` |
| Any stage decision `REJECT` or `REQUEST_CHANGES` (open) | `REVISION_REQUESTED` |
| All internal stages `PASSED`, client stage `PENDING` | `INTERNAL_APPROVED` |
| Client stage `ACTIVE` | `UNDER_CLIENT_REVIEW` |
| Client stage `PASSED` (final approval) | `APPROVED` |
| Marked delivered (post-approval handoff) | `DELIVERED` |
| Soft-archived | `ARCHIVED` |

Edge rules: a re-opened revision resets the relevant stage to `ACTIVE` and the status back to the matching
`UNDER_*`; promotion (`promote`) is what flips a passed-internal run to spin up the client stage; the mapping is a
pure function of stage rows so the status chip can never disagree with the audit drawer.

---

## 25. Annotation tool matrix & keyboard map

**Tools offered per medium** (single `AnnotationToolbar`, medium-aware subset):

| Tool | Image (Annotorious) | Video (Konva) | PDF (Konva) | Audio (wavesurfer) |
|---|---|---|---|---|
| Select / move | ✓ | ✓ | ✓ | — |
| Point | ✓ (dbl-click) | ✓ | ✓ | — |
| Box / rectangle | ✓ | ✓ | ✓ | — |
| Arrow | — (via polygon) | ✓ | ✓ | — |
| Freehand draw (PATH) | — | ✓ | ✓ | — |
| Polygon | ✓ | ✓ | ✓ | — |
| Range select | — | — | — | ✓ (drag on waveform) |
| Timecode-only | — | ✓ (no shape) | — | ✓ (no drag → marker) |

**Keyboard map** (review room):

| Key | Action |
|---|---|
| `space` | play / pause (AV) |
| `←` / `→` | frame step (video) / nudge (audio) |
| `[` / `]` | previous / next comment (with `focusAnchor`) |
| `c` | open Compare dialog |
| `r` | reply to active comment |
| `e` | resolve / reopen active comment |
| `v` | select tool · `b` box · `a` arrow · `d` draw · `p` point |
| `Esc` | close dialog / exit compare / unfollow |

---

## 26. CSS / design tokens to add

Extend `apps/web/src/enhancements.css` (reusing existing theme vars `--ash`, `--mist`, `--paper`, `--graphite`,
`--tungsten`, `--accent`, IBM Plex Mono). New class families, no new design system:

- `.annotation-toolbar`, `.annotation-toolbar__tool[data-active]` — segmented tool buttons.
- `.annotation-layer`, `.annotation-shape`, `.annotation-shape[data-active]`, `.annotation-shape--pending` —
  stroke/fill tokens (active = `--accent`, pending = dashed `--mist`).
- `.unified-transport`, `.unified-transport__track/__fill/__marker[data-resolved][data-active]`.
- `.compare-dialog`, `.compare-stage[data-mode]`, `.onion-overlay`, `--compare-opacity`, `--compare-divider`.
- `.comment-card[data-active]` (highlight ring), `.comment-thread__group--resolved` (dimmed/collapsible).
- `.anchor-chip`, `.task-chip`, `.mention-chip`, `.hashtag-chip`.
- `.decision-bar`, `.decision-bar--quiet`, `.esignature-field`.
- Responsive: `.review-comments--sheet` (bottom sheet `< lg`), `.audit-drawer--modal` (`< md`).

---

## 27. Definition of Done

- [ ] **Approve gating:** an agency non-approver never sees Approve; an assigned internal approver sees it during
      `UNDER_INTERNAL_REVIEW`; the client approver sees it (with e-signature) during `UNDER_CLIENT_REVIEW`;
      SEQUENTIAL order and quorum are respected. Verified live for all three personas.
- [ ] **Annotation:** each medium captures and **re-renders** stored annotations, aligned under
      zoom/pan/rotation/letterbox and in compare panes; one shared toolbar; Annotorious wired for image, Konva for
      video/pdf, wavesurfer regions for audio.
- [ ] **Navigation:** clicking any anchor (timecode, region, pdf page, waveform range) lands on the exact spot and
      highlights both the comment and its on-media annotation; the relationship is bidirectional.
- [ ] **Compare:** the dialog lets you pick A and B explicitly (A ≠ B enforced) + a mode; both panes annotate;
      split/onion/side-by-side work and sync; guest/share can compare.
- [ ] **Comments:** multi-level threads, @mention autocomplete, #hashtags, per-user reaction toggle, resolve/reopen,
      convert-to-task (idempotent → View task) with the Revisions loop visible.
- [ ] **Backend:** typed anchor validation; threaded comments endpoint; server-side INTERNAL stripping for clients;
      status recompute on decision; guest attachment upload.
- [ ] **Dedup & client:** one viewer/comment stack shared by agency/client/guest; client home is data-fetched with
      working links.
- [ ] **Quality:** unit + api + gated e2e green; `accesslint` clean; status never color-only; keyboard map works;
      responsive sheet/modal verified; screenshots attached to the PR.

---

### Appendix A — sources for the library research

- Annotorious (image annotation): https://annotorious.dev/react/image-annotation/
- Konva vs Fabric for React annotation overlays: https://dev.to/lico/react-comparison-of-js-canvas-libraries-konvajs-vs-fabricjs-1dan · https://github.com/konvajs/react-konva
- wavesurfer.js v7 Regions (markers + ranges): https://wavesurfer.xyz/docs/
- react-compare-slider (and 2026 survey): https://react-compare-slider.vercel.app/ · https://blog.croct.com/post/best-react-before-after-image-comparison-slider-libraries
- Frame.io-style timestamped comments pattern: https://dev.to/astrodevil/how-to-implement-frameio-style-comments-in-your-video-player-app-2nhf
- PDF.js overlay/annotation layers in React: https://blog.react-pdf.dev/understanding-pdfjs-layers-and-how-to-use-them-in-reactjs
