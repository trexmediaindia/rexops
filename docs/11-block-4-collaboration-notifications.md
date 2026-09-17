# 11 — Block 4 specification: collaboration and notifications

Status: `credential-dependent`; feature key: `collaboration.live`.

## Required contract

- PostgreSQL channels/messages remain authoritative. Channels cover projects, sub-projects, deliverables, and
  tenant/client-safe DMs; messages support cursor pagination, search, threads, mentions, attachments, unread state,
  and promoted version references.
- Liveblocks rooms are `review:<deliverableId>`, `board:<projectId>`, and `chat:<channelId>`. Presence and broadcast
  invalidations are ephemeral; comments/messages are never duplicated into Liveblocks storage.
- Connected rooms invalidate TanStack Query after durable API commits. Slow polling is fallback-only.
- Activity projection is independent from notification recipient resolution. `sourceEventId` makes deliverable and
  file-version projections idempotent and client visibility is explicit.
- Notifications dedupe by source event and recipient, use recipient-role-safe links, and filter by attention type.
- Review-stage reminders fire once in the 24-hour due window; stalled stages escalate once after `dueAt`.
- Web Push displays payloads, prunes gone subscriptions, and routes notification clicks. The manifest includes real
  192/512 PNG icons.

## Current evidence

The API supports channel/DM discovery, cursor messages/activity, read state, mentions, attachments, and version
references. The web UI has a general channel switcher, DMs, threaded rendering, Liveblocks presence/cursors, and
query invalidation. Push handlers and icons exist and have a source-level test.

## Release gaps

- Two independent browser contexts with a real Liveblocks credential: presence, cursors, invalidation,
  disconnect/reconnect, and fallback polling.
- Real VAPID staging display/click smoke.
- Complete notification filter UI and provider-backed scheduler clock acceptance.
- Version drag payload acceptance across agency/client principals.

Production refuses to enable this feature without `LIVEBLOCKS_SECRET_KEY`.
