# 10 — Block 3 specification: review and approval

Status: `prototype`; feature key: `review.wedge`.

## Required contract

- Every submitted file version creates one durable `review_run` that snapshots a selected pipeline.
- Run stages preserve audience, order, mode, quorum, required/ordered approvers, SLA, escalation target, activation,
  due, completion, and status history.
- Sequential stages enforce approver order. Parallel stages enforce required approvers and quorum. Any request for
  changes or rejection ends the active stage immediately. Same-audience stages advance automatically.
- Approval rows are append-only in application code and protected by database update/delete triggers. Final client
  approval records typed name, consent text/version, timestamp, user, IP, and user agent.
- Anchors are validated against medium: video timecode/point/rectangle/path, image point/rectangle/polygon, PDF
  page region, and audio range.
- The shared viewer registry uses Video.js, Annotorious, PDF.js worker rendering, and wavesurfer regions. Guest
  review uses the same registry.
- Comments support real threads, resolve/reopen, task conversion, validated mentions, hashtags, normalized emoji
  reactions, and claimed private attachments.

## Current evidence

Local tests cover durable internal/client runs, parallel required approvers, client-stage filtering, visibility,
signed approval, comments/tasks, and tenant hiding. The database migration backfills legacy versions/runs and
installs approval immutability triggers.

## Release gaps

- Complete browser acceptance for every annotation tool, comment navigation, shared image zoom/pan, and video drift
  correction.
- Guest attachment upload and nested-thread composer acceptance.
- Owner/admin pipeline editor UI (the API supports creating ordered pipeline templates).
- Full v1→changes→v2→multi-stage→signature→delivery smoke.

The feature remains disabled by default until the browser and trust suites pass.
