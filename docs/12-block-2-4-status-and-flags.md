# 12 — Blocks 2–4 status + release flags (plain English)

Audit date: 2026-06-22. Verified against real code, not the planning docs.

## Are Blocks 2–4 built? — Yes, all three.

| Block | Feature | State | Where |
|---|---|---|---|
| 2 | Files & versioning | ✅ Built | multipart upload, R2 **and** local-disk driver, semantic versions, ffmpeg preview pipeline, companion previews |
| 3 | Review & approval | ✅ Built | review runs/stages, 3-outcome decisions, anchored comments, e-signature, share links, attachments |
| 4 | Collaboration & notifications | ✅ Built | activity feed, channels/DMs/messages, notification inbox, **Web Push works**, **Liveblocks presence wired**, schedulers |

The two old gaps are now **closed**:
- Web Push: `apps/web/public/sw.js` has `push` + `notificationclick` handlers (displays + routes clicks). Icons (192/512/svg) exist.
- Liveblocks: client is wired (`LiveblocksProvider`, `RoomProvider`, `useStatus`) — real presence, not just polling.

## Loose ends (minor)

- `apps/web/src/sw.ts` is a **dead stub** (only `install`). The real worker is `public/sw.js`. Delete the stub to avoid confusion.
- `sw.js` defaults its icon to `/icons/rexops.svg`; manifest uses the PNGs. Cosmetic.
- Things that need a **live credential to fully prove** (work in dev without them): Liveblocks 2-browser presence, real VAPID push delivery, R2 cloud storage + CORS, 1.8 GB resumable upload. These are "needs staging proof", not "missing code".
- Not built yet (intended later): pipeline-editor UI, notification-filter UI. APIs exist; UIs don't.

---

## What are "release flags"? — On/off switches per feature.

6 flags, set by env vars, **default `false`**:

```
FEATURE_FILES_VERSIONING   → files.versioning   (Block 2)
FEATURE_REVIEW_WEDGE       → review.wedge        (Block 3)
FEATURE_COLLABORATION_LIVE → collaboration.live  (Block 4)
FEATURE_WORK_VIEWS         → work.views          (Block 5)
FEATURE_AUTOMATION         → automation          (Block 6)
FEATURE_ANALYTICS          → analytics           (Block 7)
```

How they work (`apps/api/src/app.ts`): a flag that's `false` makes that feature's routes return **404**. The worker (`relay.ts`) also checks them before queuing media/notify jobs. So a flag gates the **whole feature**, front to back.

One special rule: `collaboration.live` **stays off in production** unless `LIVEBLOCKS_SECRET_KEY` is set, even if you flip the flag.

(In `test` mode, Blocks 2 & 3 default to `on` so tests run.)

---

## "If I add the env, do I get the feature?" — Yes, in two steps.

**Step 1 — turn it on:** set the `FEATURE_*` flag to `true`. That alone mounts the routes + UI.

**Step 2 — give it its backing service** (only if you want the *cloud-grade* version; most work in dev without it):

| Feature | Flag to set | Extra env for full power | Works without that env? |
|---|---|---|---|
| Files & versioning | `FEATURE_FILES_VERSIONING=true` | `R2_*` (cloud storage), `REDIS_URL` (previews), `ffmpeg` binary | **Yes** — falls back to local-disk storage. Previews need Redis + ffmpeg. |
| Review & approval | `FEATURE_REVIEW_WEDGE=true` | none | **Yes** — no external service needed. |
| Collaboration & notifications | `FEATURE_COLLABORATION_LIVE=true` | `LIVEBLOCKS_SECRET_KEY` + `VITE_LIVEBLOCKS_AUTH_URL` (presence); `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` + `VITE_VAPID_PUBLIC_KEY` (push); `REDIS_URL` (worker) | **Partly** — without Liveblocks key, dev uses a fake token + polling. Without VAPID, push is skipped. |

**Plain answer:** Flag on = feature appears. Adding the matching env upgrades it from the dev fallback (local disk, polling, no push) to the real thing (R2 cloud, live presence, real push). The code path is already there in every case — you're feeding it credentials, not building anything.

Quick-start env for a full local run of Blocks 2–4:
```
FEATURE_FILES_VERSIONING=true
FEATURE_REVIEW_WEDGE=true
FEATURE_COLLABORATION_LIVE=true
REDIS_URL=redis://localhost:6379     # worker: previews + notifications
# optional upgrades:
R2_ENDPOINT=...  R2_ACCESS_KEY_ID=...  R2_SECRET_ACCESS_KEY=...   # cloud files
LIVEBLOCKS_SECRET_KEY=...  VITE_LIVEBLOCKS_AUTH_URL=...           # live presence
VAPID_PUBLIC_KEY=...  VAPID_PRIVATE_KEY=...  VITE_VAPID_PUBLIC_KEY=...  # web push
```
