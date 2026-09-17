# 09 — Block 2 specification: files and versioning

Status: `prototype`; feature key: `files.versioning`.

## Required contract

- Multipart storage supports initiate, list-parts, sign, complete, abort, expiry, and private download.
- `GET /api/file-versions/uploads/:sessionId` returns session metadata and completed parts. The browser persists
  session ID plus file fingerprint, requires re-selection after reload, and skips completed parts.
- `versionNumber` is immutable audit order. `majorVersion`, `minorVersion`, and `versionBump` produce
  `displayVersion` (`v1.0`, `v1.1`, `v2.0`) under the deliverable advisory lock.
- Upload purpose is `VERSION` or `COMPANION_PREVIEW`. Companion completion updates the target source version and
  never creates a new version.
- Preview state is explicit: `PENDING | PROCESSING | READY | FAILED`, with error and generated timestamp.
- Source-only versions cannot enter review without a ready companion preview.

## Current evidence

Local API tests cover multipart completion, list-parts inspection, semantic numbering, visibility, signed bytes,
validation, and tenant guessing. The worker records unsupported formats and ffmpeg failures as `FAILED`.

## Release gaps

- R2 staging CORS proof for signed media/canvas reads.
- Interrupted/reloaded generated 1.8 GB R2 smoke.
- Browser drag-to-stack and companion-preview acceptance in the supported browser matrix.

The feature remains disabled by default until those checks are recorded.
