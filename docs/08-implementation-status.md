# 08 — Implementation status

Last audited: 2026-06-22.

Statuses are evidence-based:

- `prototype`: implemented locally but the complete block Definition of Done has not passed.
- `verified`: local automated checks and the documented local smoke pass.
- `credential-dependent`: implementation exists but provider-backed acceptance is outstanding.
- `released`: enabled by default after all acceptance evidence is recorded.

| Area | Status | Evidence / remaining gate |
|---|---|---|
| Foundation / Block 1 | verified | Typecheck, boundaries, API tests, builds, tenant tests |
| Block 2 files/versioning | prototype | Semantic versions, resumable-session inspection, browser resume, companion previews, lifecycle errors implemented; R2 CORS and generated 1.8 GB staging resume remain credential-dependent |
| Block 3 review wedge | prototype | Durable runs, pipeline snapshots, ordered approvers, immutable approvals, typed anchors, viewer registry, reactions/mentions/attachments implemented; browser matrix and full v1→v2 acceptance remain |
| Block 4 collaboration | credential-dependent | Durable chat, paginated messages/activity, Liveblocks presence/invalidation, push handlers/icons implemented; real Liveblocks/VAPID two-browser staging acceptance remains |
| Blocks 5–7 | unreleased | Source retained; API/routing/workers/schedulers are feature-disabled by default |

The authenticated `GET /api/features/` response is the shared release registry. Production defaults are false for
`files.versioning`, `review.wedge`, `collaboration.live`, `work.views`, `automation`, and `analytics`.
`collaboration.live` cannot be enabled in production without `LIVEBLOCKS_SECRET_KEY`.

Provider-backed checks must not be replaced with local fallbacks in release evidence.
