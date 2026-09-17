# ADR 0006 — PostgreSQL chat with Liveblocks presence

Accepted: 2026-06-22.

Channels, messages, comments, and attachments remain durable PostgreSQL records. Liveblocks carries only presence,
cursor/selection state, and lightweight invalidation events after API commits. This avoids split-brain durable data.
