# ADR 0004 — Semantic display versions with immutable audit order

Accepted: 2026-06-22.

`file_version.version_number` remains the immutable sequence. Display identity is stored separately as
`major_version`, `minor_version`, and `version_bump`, unique per deliverable. This avoids deriving false `vN.1`
labels from a boolean and preserves stable audit references.
