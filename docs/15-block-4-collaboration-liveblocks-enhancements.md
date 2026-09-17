# 15 — Block 4 enhancement spec: feature-rich Liveblocks (who's-viewing, follow-mode, presence-aware rail, live updates) + collaboration depth

> **Status:** `planned` (forward spec) · **Feature keys:** `collaboration.live` (+ `review.wedge` host) · **Phase:** v4 Phase 3
> **Reads with:** [11-block-4-collaboration-notifications.md](./11-block-4-collaboration-notifications.md) (the *as-built*
> contract), [13](./13-block-2-files-versioning-enhancements.md) (`VersionRail` / `viewerDots` slot,
> `ScrubPreview`), [14](./14-block-3-review-approval-enhancements.md) (the Review Room comment/compare surface),
> and [02-domain-model.md](./02-domain-model.md).

**What is already built (do not rebuild):** Liveblocks **is** wired — `LiveblocksProvider` (`app.tsx`),
`RoomProvider` + `RoomBridge` (`lib/realtime.tsx`), a server auth endpoint (`liveblocks.routes.ts`) that scopes
tokens to `review:`/`board:`/`chat:` rooms and falls back to a dev token without a secret. Presence cursors render,
and `broadcastInvalidation` keeps queries in sync. The collaboration API (channels/DMs/threads/activity feed) and
notifications (in-app + Web Push + schedulers) are complete (11).

**What is shallow (this doc fixes):** the realtime layer is *thin*. Three concrete facts from the code:
1. `prepareSession(userId, { userInfo: { role, agencyId } })` — **no name/color/avatar**, so every cursor is an
   anonymous square (`presence-cursor`).
2. Presence declares `activeVersionId` and `selection` **but never sets them** — so there is no "who's viewing which
   version," no live playhead, no follow.
3. Live sync is **coarse**: a write fires `broadcastInvalidation` → everyone refetches the whole room. No granular
   "a comment appeared" event, no presence-aware rail.

This spec makes Liveblocks genuinely feature-rich, grounded in the **current Liveblocks API** (verified via docs):
identity flows through **server-signed `userInfo`** read as `other.info` (secure — never trust client presence for
identity); live view-state flows through **presence**; granular updates flow through **typed room events**
(`useBroadcastEvent`/`useEventListener`, already imported). Priorities per the product owner: **(A) who's-viewing-
version + follow-mode** and **(B) presence-aware version rail + granular live updates** are the primary tier;
named cursors / avatar stack / typing / live reactions are a **secondary polish tier** (§6.6).

---

## 0. How to read this

| If you want… | Go to |
|---|---|
| v4 attribution (B10/B11) | §1 |
| Shipped vs missing | §2 |
| **The Liveblocks architecture** (types, presence, identity, rooms, events) | §3 ← read before coding |
| Server changes (auth `userInfo`, audience rooms, worker broadcast) | §4 |
| Schema (almost nothing new) | §5 |
| **The features, in detail** | §6 |
| **Full UI/UX flow + component inventory** | §7 |
| Trust boundary / privacy | §8 |
| Tests / DoD / deps | §9 / §10 / §11 |

---

## 1. v4 traceability

| v4 requirement | Source | Status | This doc |
|---|---|---|---|
| **Presence + live updates** per board + review surface ("Figma feel") | B10 / v3 | thin → enrich | §6.1–6.3 |
| Per-record **activity feed** (Chatter) | B10 / Odoo A2.1 | API ✅, UI thin | §6.5 |
| Chat: channels + DMs + threads + drag-version-to-tag | B10 / v3 | ✅ (11) | §6.6 (typing/presence) |
| Notifications: event → in-app + Web Push, role/contentType-routed | B11 | ✅ (11) | §6.4 (make live) |
| Reminder / stalled escalation | B11 / Ziflow | ✅ scheduler (11) | — |
| **Live cursors with identity / avatar stack** | Frame.io / Liveblocks | missing | §6.6 (Tier 2) |

Out of scope / deferred (v4 §E, §5 carried risk): Stream-Chat replacement (chat stays Postgres-authoritative —
Liveblocks never stores messages); 3D/web presence.

---

## 2. Gap ledger

| # | Capability | Today (code) | Target | Tier | § |
|---|---|---|---|---|---|
| L1 | Identity on presence | `userInfo` = role+agencyId only → anonymous squares | name + color + avatar via `userInfo`, read as `other.info` | A (enabler) | §3.3, §4.1 |
| L2 | Who's-viewing-version | `activeVersionId` declared, never set | set on version select; rail shows live viewer dots | **A** | §6.1 |
| L3 | Live playhead | `selection`/playhead unused | ghost playheads on scrubber; "Sara @ 00:42" | **A** | §6.2 |
| L4 | Follow-mode | none | mirror a teammate's version+playhead+selection live | **A** | §6.2 |
| L5 | Granular live updates | coarse `INVALIDATE` refetch | typed events (`COMMENT_ADDED`…) → optimistic patch + pulse | **A** | §6.3 |
| L6 | Live notifications | inbox polls 30s | worker broadcasts to `user:{id}` room → live bell | **A** | §6.4 |
| L7 | Activity feed UI | `listActivity`/`listVersionActivity` ✅, barely rendered | Chatter timeline on deliverable + dashboard | A | §6.5 |
| L8 | Board presence | `board:` room permitted, never joined | mount on the Block 5 board | A (seam) | §6.1 |
| L9 | Named cursors + avatar stack | anonymous squares, count only | labeled cursors + "who's here" | B | §6.6 |
| L10 | Typing indicator | none | "Mia is typing…" in chat + review composer | B | §6.6 |
| L11 | Live reactions | none | floating ephemeral 👍 on the stage | B | §6.6 |

---

## 3. The Liveblocks architecture (the core — build this first)

### 3.1 Typed configuration
Replace untyped hooks with a typed room so `presence`, `info`, and events are checked. Define once
(`apps/web/src/lib/liveblocks.config.ts`) via the global augmentation the current SDK supports:

```ts
declare global {
  interface Liveblocks {
    Presence: RexPresence;          // §3.2 — live, per-connection, mutable, JSON
    UserMeta: { id: string; info: RexUserInfo };  // §3.3 — server-signed identity, immutable
    RoomEvent: RexRoomEvent;        // §3.4 — broadcast payloads
    // Storage: stays EMPTY — comments/messages are Postgres-authoritative (v4: never duplicate into LB)
  }
}
```
> **Why Storage stays empty:** v4 B10 and 11 are explicit — Liveblocks carries *ephemeral* presence + invalidations
> only; durable comments/messages live in Postgres. This keeps the trust boundary and audit trail in one place.

### 3.2 Presence — live *view state* (NOT identity)
```ts
type RexPresence = {
  activeRoom: string;
  activeVersionId: string | null;          // L2: which version I'm looking at
  view: {                                  // L3/L4: my live position in that version
    playheadMs: number | null;             // video/audio time
    selection:                             // what I'm pointing at
      | { kind: "REGION"; x: number; y: number; w?: number; h?: number; page?: number }
      | { kind: "WAVEFORM"; startMs: number; endMs: number }
      | { kind: "PAGE"; page: number }
      | null;
    compareB: string | null;               // if I'm comparing, the B version
  } | null;
  cursor: { x: number; y: number } | null; // Tier B: pointer
  state: "active" | "idle";                // idle after 60s no input
  isCommenting: boolean;                   // Tier B: composer focused
  isTyping: boolean;                       // Tier B: chat typing
};
```
Presence is **public and untrusted** — never put names/emails here; identity is §3.3.

### 3.3 Identity — server-signed `userInfo` (the secure fix for L1/L9)
The auth endpoint already calls `prepareSession`; extend its `userInfo` (the only trustworthy source — the client
cannot forge it). Read on the client as `other.info` / `useSelf().info`:
```ts
type RexUserInfo = {
  name: string;             // display name
  color: string;            // deterministic from userId (hash → 04 palette-safe hue)
  avatarUrl: string | null;
  role: Principal["role"];  // already present
  agencyId: string;         // already present
  audience: "AGENCY" | "CLIENT" | "GUEST";  // §8 trust-boundary bucketing
};
```
`color` is computed server-side so everyone agrees on a user's color. `audience` drives §8.

### 3.4 Room events — granular live updates (L5)
```ts
type RexRoomEvent =
  | { type: "INVALIDATE"; queryKeys: string[][] }                      // keep as the safety net
  | { type: "COMMENT_ADDED"; versionId: string; comment: CommentLite } // optimistic insert + marker pulse
  | { type: "COMMENT_RESOLVED"; commentId: string }
  | { type: "DECISION_MADE"; versionId: string; decision: string }     // refresh decision bar + audit
  | { type: "VERSION_ADDED"; version: VersionLite }                    // new card slides into the rail
  | { type: "REACTION_FLY"; emoji: string; x: number; y: number };     // Tier B ephemeral
```
Rule: every mutation that today calls `broadcastInvalidation` *also* emits its specific event; receivers patch the
TanStack cache via `setQueryData` and only fall back to `invalidateQueries` if the payload is missing/old. This is
what turns "refetch flicker" into "it just appeared."

### 3.5 Room taxonomy (extends the shipped `permittedRoom`)
| Room | Who | Purpose | Status |
|---|---|---|---|
| `review:{deliverableId}` | agency team | agency review presence + events | ✅ permitted, joined |
| `review:{deliverableId}:client` | client users (+ agency if hosting joint review) | client-side presence, isolated from internal names | **new** (§8) |
| `board:{projectId}` | project members | board presence (Block 5) | ✅ permitted, **not yet joined** (L8) |
| `chat:{channelId}` | channel members | chat presence/typing | ✅ permitted, joined |
| `user:{userId}` | only that user | live notification fan-out target (L6) | **new** (§4.2) |

`permittedRoom` currently rejects 3-part rooms (`rest.length` guard) and only allows `review|board|chat`. Extend it
to (a) accept the optional `:client` audience suffix on `review`, validating the actor may join that audience, and
(b) allow `user:{id}` **iff** `id === actor.userId`.

---

## 4. Server changes

### 4.1 Auth endpoint — richer `userInfo` (`liveblocks.routes.ts`)
```ts
// after permittedRoom passes, before authorize():
const me = await getUserIdentity(actor.userId);   // name, avatarUrl from identity table
const session = liveblocks.prepareSession(actor.userId, {
  userInfo: {
    name: me.name,
    color: colorForUser(actor.userId),            // deterministic hue
    avatarUrl: me.avatarUrl ?? null,
    role: actor.role,
    agencyId: actor.agencyId,
    audience: audienceFor(actor.role),            // AGENCY | CLIENT | GUEST
  } satisfies RexUserInfo,
});
```
The dev-token fallback (no secret) must carry the same fields so local dev shows real names/colors. `FULL_ACCESS`
is unchanged for joined rooms; presence privacy is handled by **room separation** (§8), not by token scoping.

### 4.2 Live notifications — worker broadcast (L6)
After `processNotify` writes a `notification` row (11), broadcast to the recipient's user room using
`@liveblocks/node` (already a dependency on the API; add to the worker):
```ts
// apps/worker/src/processors/notify.ts — after insert
if (liveblocks) {                                  // only if LIVEBLOCKS_SECRET_KEY present
  await liveblocks.broadcastEvent(`user:${recipientUserId}`,
    { type: "NOTIFICATION", unreadDelta: 1, preview: { title, url } });
}
```
The agency/client shell joins `user:{me}` and listens → the bell badge increments live and a toast slides in,
**without** the 30s poll (poll stays as fallback when realtime is off). No secret → no broadcast, poll continues —
graceful degradation, same pattern as Web Push.

### 4.3 No other server work
Activity feed, channels, notifications, schedulers, Web Push are all shipped (11). This block is realtime-layer +
UI.

---

## 5. Schema deltas
**None for presence** (ephemeral). The activity feed (`activity_event`), notifications (`notification`,
`push_subscription`), and channels/messages already exist (11). The only optional addition is a per-user
`last_seen_at` on a channel membership for unread counts, which `markChannelRead` already approximates — so
**effectively zero schema change**. Block 4 enhancement is a client + worker concern.

---

## 6. The features, in detail

### 6.1 Who's-viewing-version + presence-aware version rail (L2, primary)
On selecting a version, set presence: `updateMyPresence({ activeVersionId: version.id })`. The `VersionRail.Item`
fills the `viewerDots` slot left open in **13 §7.1** using `useOthers`:
```
others.filter(o => o.presence.activeVersionId === version.id)
      .map(o => <ViewerDot color={o.info.color} name={o.info.name} state={o.presence.state} />)
```
```
│ ┌───────────────────┐ │
│ │▓▓ poster   v2.1 ● │ │
│ │  ●●  +2 viewing   │ │  ← live colored dots (info.color), name on hover, dim when idle
│ └───────────────────┘ │
```
**a11y:** the dot group is `aria-label="Sara and 2 others are viewing v2.1"`. **Trust (§8):** a CLIENT principal in
the `:client` room sees only client peers; agency presence is bucketed as a single "Agency reviewing" pill.
**Board (L8):** the same pattern lands on the Block 5 board (`board:{projectId}`) showing who's on which card — mount
`RealtimeRoom id={board:…}` there.

### 6.2 Live playhead ghosts + follow-mode (L3/L4, primary — the headline feature)
While playing/scrubbing, throttle-broadcast my position into presence:
`updateMyPresence({ view: { playheadMs, selection, compareB } })` (≤ 10/s, animation-frame throttled).

**Ghost playheads:** the scrubber renders other viewers on the *same* `activeVersionId` as colored ghost ticks:
```
◄────────●(me)────────┊Sara┊──────────┊Leo┊────────►
            00:00:42        00:01:08       00:02:15      ← hover a ghost → name + jump
```
**Follow-mode:** the header presence avatars get a **Follow** affordance. Following `Sara`:
- my stage adopts her `activeVersionId`, my scrubber tracks her `playheadMs`, my viewer highlights her `selection`
  (region/page/waveform) — a live mirror, the Figma "follow" pattern;
- a persistent banner: **"Following Sara · Exit"** (or press `Esc`);
- **any local input** (scrub, select a version, click the stage) **exits follow** immediately;
- if Sara enters compare, I mirror her A/B (`compareB`).
This makes a live review call effortless: "everyone follow me" → the agency lead drives, clients watch the exact
frame being discussed. No screen-share, full quality, each on their own device.

**Implementation:** a `useFollow(targetConnectionId)` hook reads `useOther(connId, o => ({ver:o.presence.activeVersionId, view:o.presence.view}))` and applies it to local Review-Room state; it unsubscribes on any local interaction. Reduced-motion: ghost ticks don't animate; follow jumps are instant.

### 6.3 Granular live updates (L5, primary)
`RoomBridge` (today: only INVALIDATE) gains a `useLiveRoomEvents` handler:
- `COMMENT_ADDED` → `queryClient.setQueryData(["review-room", id], insert)` + pulse the new scrubber marker
  (04 §8) + bump the comments count — **no refetch**.
- `COMMENT_RESOLVED` / `DECISION_MADE` / `VERSION_ADDED` → targeted cache patches.
- Unknown/old event or patch failure → fall back to `invalidateQueries` (the current behavior, kept as a net).
Every mutation in `review-room.tsx` / `inbox.tsx` that calls `broadcastInvalidation` now *also* calls
`broadcast({ type: … })`. Result: sub-second, flicker-free updates with a guaranteed fallback.

### 6.4 Live notifications (L6, primary)
Shell joins `user:{me}`; on `NOTIFICATION` event → bell badge `++`, optimistic prepend to the inbox list, a
restrained toast (mirrors the verb, 04 §7). The 30s `refetchInterval` becomes `status === "connected" ? false :
30_000` (same trick chat already uses). Web Push (11) still fires for *backgrounded* tabs/OS — the two are
complementary (in-app live vs. out-of-app push).

### 6.5 Activity feed UI — Chatter (L7)
`listActivity(deliverableId)` and `listVersionActivity(versionId)` exist and are barely rendered. Add:
- **Deliverable detail → Activity tab:** `ActivityFeed` timeline (uploads, status changes, approvals, comments,
  shares-viewed) with mono timestamps and actor avatars; live-appends on the room's events (§6.3).
- **Dashboard recent activity** (04 §5.2) and **per-version** activity in the rail tooltip.
Client visibility: the feed is rendered from already-tenant-scoped API rows; the client variant simply receives
fewer rows (server-stripped). This is the Odoo Chatter pattern v4 B10 calls for.

### 6.6 Tier B — polish (named cursors, avatar stack, typing, live reactions)
Lower priority (owner deprioritized), included so Liveblocks is genuinely rich and because **identity (§3.3) is a
shared dependency**:
- **Named/colored cursors (L9):** replace the anonymous `presence-cursor` square with `info.color` + `info.name`
  label (the exact pattern from the Liveblocks docs `others.map(({presence, info}) => …)`).
- **"Who's here" avatar stack:** room header shows overlapping `Avatar`s from `useOthers` (`info.avatarUrl`/initials
  + color ring), idle dimmed, "+N" overflow; this is also where **Follow** (§6.2) lives.
- **Typing indicator (L10):** chat composer sets `isTyping` (debounced); `ChatPanel` shows "Mia is typing…" from
  others' presence. Same for the review comment composer (`isCommenting`).
- **Live reactions (L11):** a 👍 button broadcasts `REACTION_FLY{emoji,x,y}` → a floating emoji animates up on every
  viewer's stage and disappears (ephemeral, never stored). Reduced-motion → a brief static badge.

---

## 7. UI/UX flow + component inventory

All tokens per **04 §2**; presence color comes from `info.color` (the *one* place non-media color is allowed to
multiply, justified because it encodes identity — still small dots/rings, never fills). Motion restrained,
reduced-motion honored (04 §8). Status/identity never color-only — every dot/ring has a name on hover/focus (04 §9).

### 7.1 Review Room, presence-enriched (the canvas from 04 §3)
```
┌ Beach Vibe Reel · Imperial Living            ● under client review   ◐◐◓ +2  [Follow ▾] ┐
│                                                                       └ who's here / follow ┘
├──────────┬───────────────────────────────────────────────┬───────────────────────────────┤
│ VERSIONS │            [ media stage / CompareStage ]      │ COMMENTS · v2.1            04 │
│ v2.1 ●   │                                                │ (live-appended via §6.3)      │
│  ●● view │                                                │ Sara is typing…               │
│ v2.0 ○   │  ◄────●me───┊Sara┊────┊Leo┊──────►  00:00:42   │ [ @ # 📎 ☑ internal ]          │
│ v1.0 ✓   │      ghost playheads (§6.2)                    │                                │
└──────────┴───────────────────────────────────────────────┴───────────────────────────────┘
  [ Following Sara · Exit ]   ← banner appears only in follow-mode
```

### 7.2 Component inventory (Block 4 net-new / changed)

| Component | File | New? | Feature |
|---|---|---|---|
| `liveblocks.config.ts` (typed `Presence`/`UserMeta`/`RoomEvent`) | `apps/web/src/lib/` | new | §3 |
| `RoomBridge` (extend: set view presence, handle typed events) | `lib/realtime.tsx` | extend | L2/L3/L5 |
| `useLiveRoomEvents` | `lib/use-live-room-events.ts` | new | L5 |
| `useFollow` | `lib/use-follow.ts` | new | L4 |
| `PresenceAvatars` (+ `FollowMenu`) | `components/presence/presence-avatars.tsx` | new | §6.1/6.2/6.6 |
| `ViewerDots` | `components/presence/viewer-dots.tsx` | new | L2 (fills 13's `viewerDots` slot) |
| `GhostPlayheads` | `components/presence/ghost-playheads.tsx` | new | L3 |
| `FollowBanner` | `components/presence/follow-banner.tsx` | new | L4 |
| `LiveCursors` (named, replaces `presence-cursor`) | `components/presence/live-cursors.tsx` | new | L9 |
| `LiveBell` (live notification badge + toast) | `components/notifications/live-bell.tsx` | new | L6 |
| `ActivityFeed`, `ActivityItem` | `components/activity/*` | new | L7 |
| `TypingIndicator` | `components/presence/typing-indicator.tsx` | new | L10 |
| `ReactionFly` | `components/presence/reaction-fly.tsx` | new | L11 |
| worker Liveblocks client | `apps/worker/src/lib/liveblocks.ts` | new | L6 |

All identity rendering reads `other.info` (never presence) per §3.3. All themed through `packages/ui`.

### 7.3 States, motion, copy, a11y, responsive
- **States:** realtime **off** (no secret / disconnected) → all presence components hide gracefully, polling
  resumes, follow disabled, a small "Fallback" pill (already in code) explains it. **Alone in the room** → no dots,
  no stack, no ghosts (don't render empty chrome).
- **Motion:** ghost playheads ease toward their target (no jitter); a new live comment pulses its marker once;
  reactions float ~1.2s; avatar join/leave fades. All reduced-motion-gated.
- **Copy (04 §7):** `Follow`, `Following Sara · Exit`, `2 viewing`, `Mia is typing…`, `Sara is here`. Plain, no
  jargon ("viewing," not "presence subscription").
- **a11y:** follow is keyboard-triggerable from the avatar menu; ghost playheads and viewer dots expose names to
  screen readers; the live bell announces via `aria-live="polite"`; identity is never color-only.
- **Responsive:** below `md`, presence avatars collapse to a single "+N here" chip that opens a sheet; ghost
  playheads still render on the horizontal scrubber; follow banner is a full-width bottom bar.

---

## 8. Trust boundary & privacy (explicit — this is an agency↔client product)

Presence can leak who is looking and when, **across** the agency↔client line. Rules:
1. **Separate review presence rooms by audience.** Agency presence lives in `review:{id}`; client presence in
   `review:{id}:client`. They do **not** see each other by default — so internal reviewer names never reach a
   client, and a client browsing at 2am isn't surfaced to the whole agency room beyond intended signals.
2. **Bucketing fallback.** Where a shared room is unavoidable, the client UI renders any `info.audience === "AGENCY"`
   other as a single generic **"Agency reviewing"** pill — never the internal name.
3. **Opt-in joint live review.** A scheduled/"live review" session explicitly places both audiences in one room
   where names are mutually visible **by design** (they're on a call together).
4. **Guests** (share links): presence limited to the share room; `audience: "GUEST"`, no name unless the share
   collects one; never see internal presence.
5. Identity is **server-signed** (`userInfo`) — the client cannot spoof a name/role into the room.
These rules are enforced in `permittedRoom` (room admission) + client audience-bucketing, and mirror the
field-level INTERNAL/CLIENT stripping the core guard already does for data (01 §Tenancy).

---

## 9. Test matrix

| Layer | Test | Asserts |
|---|---|---|
| api | `permittedRoom` audience | client may join `review:{id}:client`, not `review:{id}`; `user:{x}` only if `x===me` |
| api | `userInfo` shape | name/color/avatar/audience present; color deterministic per userId |
| worker | live notification | broadcast fires to `user:{recipient}` only when secret set; no-op otherwise |
| web (unit) | `useFollow` | mirrors target version+playhead+selection; any local input unsubscribes |
| web (unit) | `useLiveRoomEvents` | `COMMENT_ADDED` patches cache w/o refetch; bad payload → invalidate fallback |
| web (unit) | color/identity | identity read from `info`, never `presence` |
| web (e2e, gated, 2 contexts) | who's-viewing + ghosts | B selects v2 → A's rail shows B's dot; B scrubs → A sees ghost move |
| web (e2e, gated) | follow-mode | A follows B; B changes version+time; A mirrors; A scrubs → A exits follow |
| web (e2e, gated) | live update | B comments → A sees the card appear + marker pulse without a full reload |
| web (e2e, gated) | trust boundary | client context never sees an agency reviewer's name; sees "Agency reviewing" |
| a11y | presence + bell | `accesslint` clean; names exposed to SR; live regions announce |

The 2-context Liveblocks e2e closes the exact "two independent browser contexts with a real Liveblocks credential"
gap 11 flags. Requires `LIVEBLOCKS_SECRET_KEY` (see §11).

## 10. Definition of Done (Block 4 enhancements)
- [ ] Typed `Presence`/`UserMeta`/`RoomEvent`; identity via server-signed `userInfo` (name/color/avatar/audience); Storage stays empty.
- [ ] **Who's-viewing-version**: presence set on select; `ViewerDots` live on the rail (and Block-5 board seam mounted).
- [ ] **Live playhead + follow-mode**: ghost playheads; `useFollow` mirrors version+time+selection; any local input exits; banner + `Esc`.
- [ ] **Granular live updates**: typed events patch the cache (comment/decision/version) with INVALIDATE fallback; marker pulse.
- [ ] **Live notifications**: worker broadcasts to `user:{id}`; live bell + toast; poll only as fallback.
- [ ] **Activity feed** (Chatter) rendered on deliverable + dashboard, live-appending.
- [ ] **Trust boundary** enforced (separate audience rooms / bucketing); identity server-signed; verified by e2e.
- [ ] Tier-B polish (named cursors, avatar stack, typing, reactions) behind the same identity layer.
- [ ] Test matrix green incl. 2-context Liveblocks e2e; `accesslint` clean; closes 11's release gaps.

## 11. Dependencies & graceful degradation
- **`LIVEBLOCKS_SECRET_KEY`** (+ `VITE_LIVEBLOCKS_AUTH_URL`) — without it: dev token in dev (names/colors still work
  via the dev-token `userInfo`), `503` in prod (feature stays off, per `collaboration.live` flag rule, 12). All
  presence/follow/live-update UI **hides** and polling resumes — never a broken screen.
- **Worker live notifications** need the secret too; absent → Web Push + poll still deliver (no regression).
- **`@liveblocks/node`** added to the worker (already on the API).
- Everything here is **additive to a working system** (11): turning the realtime layer off degrades to today's
  polling behavior, not to errors. See [12-block-2-4-status-and-flags.md](./12-block-2-4-status-and-flags.md) for
  the flag/env model.
