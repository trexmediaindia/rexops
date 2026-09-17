# 04 — UI / UX Flow & Design System

> The experience contract. It realizes v4's **two opinionated surfaces over one dataset** — ClickUp-depth for the
> agency, Trello-simplicity for the client (v4 A6/B2) — with a distinctive, subject-grounded visual identity (not
> a templated dark-mode-with-neon default). Screens are annotated with the block that ships them. Build UI with
> the 3-pillar loop in §10.

---

## 1. Design thesis (the point of view)

**A review tool must never compete with the work it shows.** Color-grading suites are painted neutral 18% grey so
a colorist can judge color truthfully. RexOps borrows that discipline: **the interface chrome is a calibrated,
desaturated graphite; the only saturated color on screen is (a) the client's media and (b) tiny semantic status
dots.** Actions glow in a single warm "tungsten" accent — like a light coming on in a darkened edit bay.

This is the one deliberate risk: a near-monochrome product where **color equals meaning, never decoration.** It
makes the media pop, keeps the dense agency surface calm, and makes the client surface feel effortless.

Subject vernacular we lean into: **timecode, frames, takes, version stacks, slates, contact sheets, the review
room.** Data that is inherently tabular — timecode `00:00:12:04`, version labels `v2.1`, durations, file sizes,
counts — is set in **monospace with tabular figures**. That single typographic choice signals "precise instrument"
better than any illustration.

## 2. Token system

**Palette** (calibrated graphite + one warm accent + semantic dots only):
```
--ink      #0E0F12   deepest surface (app background; a calibrated near-black, never #000)
--graphite #16181D   raised surface / cards / sidebar
--slate    #20242B   inputs, wells, table rows
--ash      #3A4049   hairline borders, dividers, disabled
--mist     #8A929E   secondary text, icons, metadata
--paper    #E7EAEF   primary text on dark
--tungsten #F2A341   THE accent — primary action, focus ring, active nav. Used sparingly.
--tungsten-press #D8882A
```
**Semantic status dots/chips** (small only — never full-bleed fills; they encode the 02 state machine):
```
pending  #8A929E   in_progress #5B8DEF   internal_review #8B7CF0   under_client_review #2FB6A8
revision #E5733B   approved/delivered #3FB66B   archived #3A4049   error/destructive #E5484D
```
**Type** (a deliberate, non-default trio):
```
Display : "Space Grotesk"  — headings, screen titles, empty-state lines (technical, slightly quirky)
Body    : "IBM Plex Sans"  — UI text, labels, paragraphs (humanist, readable, has character)
Mono    : "IBM Plex Mono"  — timecode, version IDs, durations, sizes, counts, code-like data (tabular figures)
```
Type scale (rem): 0.75 / 0.8125 / 0.875 / 1 / 1.125 / 1.375 / 1.75 / 2.25. Weights: body 400/500, display 500/600.
Line-height 1.5 body, 1.15 display.

**Space / radius / elevation** (precise-instrument feel = restrained):
```
space   4 · 8 · 12 · 16 · 24 · 32 · 48 · 64
radius  sm 4 · md 6 · lg 10 (cards) · full (avatars/dots)   ← small radii; this is gear, not a toy
border  1px --ash hairlines do the structural work; shadows are subtle
shadow  card: 0 1px 0 rgba(0,0,0,.4), 0 8px 24px -12px rgba(0,0,0,.5)   (depth without glow)
```
**Light mode** is a later concern (Block 7); the calibrated dark is primary because review happens in the dark.
Tokens live in `packages/ui` (CSS variables + Tailwind theme); shadcn components are themed to them, never used raw.

## 3. The signature element — the Review Room

The one screen people remember. Center **media stage**; right **comment thread anchored to the playhead**; left
**version rail**; bottom **scrubber with comment markers at exact timecodes**.

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ Beach Vibe Reel · June Content Retainer · Imperial Living          ● under client review │  ← status dot + mono crumb
├──────────┬────────────────────────────────────────────────────────┬─────────────────────┤
│ VERSIONS │                                                        │ COMMENTS  (v2)       │
│          │                                                        │                       │
│ ┌──────┐ │                  [ media stage — the only             │ ┌───────────────────┐ │
│ │ v2 ● │ │                    saturated thing on screen ]         │ │ Sara  00:00:12:04 │ │  ← mono timecode
│ │thumb │ │                                                        │ │ logo too big here │ │
│ └──────┘ │                                                        │ └───────────────────┘ │
│ ┌──────┐ │                                                        │ ┌───────────────────┐ │
│ │ v1 ○ │ │                                                        │ │ + comment…        │ │
│ │thumb │ │                                                        │ └───────────────────┘ │
│ └──────┘ │                                                        │                       │
│ compare  │  ◄──── scrubber ──●──────────│marker│──────────────►   │ [Approve][Request…]   │  ← action = tungsten
└──────────┴────────────────────────────────────────────────────────┴─────────────────────┘
```

- **Version rail:** stacked cards v1…vN, thumbnail + status dot + mono label (`v2.1`); click loads that version;
  "Compare" enters synced side-by-side (v4 B9). Internal versions only render for agency principals.
- **Scrubber markers:** each comment is a tick at its exact timecode; hovering scrubs a frame preview; a new live
  comment makes its marker pulse once (respecting reduced-motion).
- **Comment composer:** click the stage to drop an anchored comment (region) / the scrubber to anchor at a time;
  audio shows a **waveform** with range selection; image shows region boxes; PDF shows page regions (02 §6 / v4 B8).
- **Decision bar:** `Approve` / `Request changes` / `Reject` in tungsten; on the client surface only the latest
  version shows it; on approve, an optional typed **e-signature** field appears (v4 B8 Ziflow).
- Agency principals get an **internal/client toggle** on the composer (v4 B8 Filestage team-only comments).

This screen is **Block 3**. Blocks 1–2 ship a simpler "deliverable detail" that grows into it.

## 4. Information architecture & navigation

**Agency surface (powerful)** — left sidebar, collapsible to icons; ⌘K command palette everywhere:
```
Dashboard · Clients · Projects · Work(Board/List/Calendar/Timeline) · Review queue · Inbox · Team · Settings
```
**Client surface (ruthlessly simple)** — minimal top bar, single-column, no PM chrome:
```
Home("What needs you") · Projects · For review · Approved · Notifications
```
**Super-Admin console** — separate, austere, audit-forward:
```
Agencies · Users · Audit log · Impersonate ("view as")
```
Role-based routing on login (03 §RBAC): `AGENCY_*` → agency shell; `CLIENT_*` → client shell; `SUPER_ADMIN` →
console. One React app, three route trees, guarded by session role.

## 5. Screen-by-screen specs

Each screen: **purpose · layout · key components · states (empty/loading/error) · primary actions · block.**
Empty/loading/error are first-class (frontend-design: "an empty screen is an invitation to act").

### 5.1 Login / auth — **B1**
Purpose: get the right person to the right shell. Centered card on `--ink`; product wordmark in Space Grotesk;
email + password (+ optional Google). Error area speaks plainly ("That email and password don't match."). On
success → role route. States: invalid creds (inline), rate-limited (explains the wait), invite-acceptance variant.

### 5.2 Agency Dashboard — **B1 shell → B7 full**
Purpose: the agency answers "what's pending on our side vs the client's" at a glance (v4 product goal). A row of
**stat cards** (mono numbers): Pending internal review · Waiting on client · Revisions requested · Approved this
week · Upcoming deadlines · Active projects. Below: **recent activity feed** (Chatter-style, v4 B10) and a
**per-client roll-up** table. Empty state (new agency): a guided "Create your first client" card. Loading:
skeleton cards. Error: a retry panel in the interface voice.

### 5.3 Clients (list + detail) — **B1**
List: TanStack Table — Client · Company · Active projects · Status dot · Actions(View/Edit/Archive/New project).
Filter + search. Detail: client info, projects under client, recent activity, client users (+ invite, +
review-only toggle), notes. Archive is soft (03 §10). Empty: "No clients yet — add the first one."

### 5.4 Projects (list + detail) — **B1 list → B5 four views**
List: Project · Client · Status · Priority · Due · Deliverables count · Pending reviews · Actions. Detail: brief,
status, dates, **deliverables table** (Title · Assignee · Due · Status dot · Latest version · Open), sub-projects,
activity. The detail's deliverables area is where the **four-view switch** (Board/List/Calendar/Timeline + saved
views — v4 B2) lands in **B5**; B1 ships the List only. Board columns = pipeline stages (v4 B1); drag moves stage.

### 5.5 Deliverable detail (agency) — **B1 basic → grows into Review Room B3**
Purpose: the agency's cockpit for one deliverable. Header (title, project/client crumb, status dot, assignee,
due). Tabs: **Versions** (rail), **Review**, **Activity** (Chatter), **Comments**, **Subtasks/Checklist**.
Primary actions (tungsten, action-named): `Upload new version` · `Send to client` · `Add internal note` ·
`Share for review`. B1 shows version list + status + notes; B2 adds real upload; B3 turns the Versions+Review tabs
into the Review Room.

### 5.6 Review Room — **B3** (the signature, §3 above). Agency and client variants differ only by what's visible
(internal versions/comments stripped for clients) and the composer's internal toggle.

### 5.7 Client Home ("What needs you") — **B1 shell → B3 full**
Purpose: the entire client mental model in one screen. Three stacked sections, nothing else:
`For your review (N)` · `Recently approved` · `What's new`. Each item is a big tappable card → opens the client
Review Room. No tables, no sidebars, no jargon. Empty: "You're all caught up." This screen is the embodiment of
the Trello-simplicity mandate (v4 A6/B2).

### 5.8 Inbox / Notifications — **B1 feed → B4 live + push**
Unified mentions + approvals-to-give + changes-to-action + assignments (v4 B12 Asana Inbox). Rows: type icon,
title, mono timestamp, read/unread, deep link. Mark read / mark-all. B4 makes it real-time + Web Push.

### 5.9 Team & Settings — **B1**
Members table (name, specialty, role, permission flags as toggles — `canApprove` etc.), invite flow. Agency
settings: name, slug, logo, brand color (white-label groundwork, v2). Settings is gated by role.

### 5.10 Super-Admin console — **B1 basic**
Agencies list, provision-agency action, users, **audit log** table (actor · action · target · time), and a
read-only **Impersonate** ("view as") entry (writes blocked + audit-logged, 03 §10).

### 5.11 Work views (Board/List/Calendar/Timeline) — **B5**
One dataset, four lenses, one-click switch, per-view saved filter/sort/group/visible-fields (v4 B2). Board
columns = pipeline stages; List has roll-up columns (count/sum/avg); Calendar drag reschedules; Timeline shows
dependencies and auto-shifts dependents (v4 B2/B3). Client surface gets a **stripped Board+List only**.

## 6. Component inventory (mapped to shadcn, themed in `packages/ui`)
Buttons (primary=tungsten, secondary=ghost-on-graphite, destructive=error) · StatusDot/StatusChip (semantic) ·
DataTable (TanStack) · Card · Tabs · Dialog/Sheet · Toast (mirrors the verb) · Command palette (cmdk) · Avatar ·
Tooltip · Form fields (TanStack Form) · VersionRail (custom) · MediaStage (custom, viewer-registry host) ·
Scrubber+Markers (custom) · CommentThread (custom) · Annotation layers (Annotorious/canvas/PDF.js/wavesurfer) ·
SidebarNav · EmptyState · SkeletonLoader · ErrorPanel. **shadcn is never used raw** — always through the themed
wrappers so the calibrated palette holds.

## 7. Copy guidelines (words are design material)
- **Name actions by what happens, kept consistent through the flow.** `Send to client` (not "Submit") →
  toast `Sent to client`. `Request changes` → `Changes requested`. `Approve` → `Approved`. `Upload new version`.
  `Add internal note`. `Share for review`.
- **Plain, user-side vocabulary:** "Waiting on client," not "status=UNDER_CLIENT_REVIEW." A person manages
  *notifications*, not *push subscriptions*.
- **Errors give direction, in the interface's voice, no apology:** "That file is over 5 GB — upload a smaller cut
  or paste an external link." Empty states invite the next action.
- One label does one job; an example demonstrates; nothing does double duty.

## 8. Motion (restrained, where it serves)
Review Room load: stage fades up, rail slides in (one orchestrated moment). New live comment: its scrubber marker
pulses once. Stage/status changes: 150ms cross-fade on the status dot. Drag (board/assign): standard dnd-kit
lift+shadow. **No scattered ambient effects.** Everything respects `prefers-reduced-motion` (replace motion with
instant state).

## 9. Accessibility baseline (WCAG 2.2 AA — non-negotiable, Block 1 onward)
Calibrated palette is contrast-checked (`--paper` on `--ink`, `--tungsten` on `--ink` ≥ AA for UI/large text;
secondary `--mist` only for non-essential metadata at ≥ AA where it carries meaning). Visible keyboard focus
(tungsten ring) on every interactive element; full keyboard paths for review actions and the command palette;
status is **never color-only** — every dot pairs with a label/icon (critical for the colorblind on a status-driven
app); media has captions/transcripts hooks; reduced-motion honored; forms have associated labels + error text.
Audited continuously with the accesslint skill (§10).

## 10. The build-UI workflow (3 pillars — use every screen)
1. **Taste** — before coding a screen, set direction with `frontend-design` (+ `ui-ux-pro-max` / `theme-factory`
   for palettes/components) so it's intentional, not templated. Derive everything from §2 tokens.
2. **Eyes** — after building, render it and *look*: drive the real browser via `playwright` / `chrome-devtools`
   MCP, screenshot across viewports (mobile → wide), check the console. Use `design-review` to critique
   visual/UX/responsive and report findings by severity.
3. **Guardrails** — lint the result: `web-design-guidelines` (Web Interface Guidelines) + `accesslint` (WCAG 2.2)
   + `vercel:react-best-practices` / composition patterns. Red = fix before "done."

## 11. Responsive
Agency surface is desktop-first (dense tables, four views) but must not break below `md`: sidebar collapses to a
drawer, tables become stacked cards, the Review Room reflows to stage-over-thread with the rail as a horizontal
strip. **Client surface is mobile-first** (clients review on phones) — single column, big tap targets (≥44px),
the Review Room usable one-thumb. PWA installable (manifest + service worker, B4) so iOS clients get Web Push.
