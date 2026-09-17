# ADR 0007 — Generalized private attachment storage

Accepted: 2026-06-22.

Comments and messages share one multipart-backed attachment table. Uploads begin pending, become ready after
multipart completion, and are atomically claimed by one authorized parent. Downloads are signed only after the
parent resource's tenant and visibility checks pass.
