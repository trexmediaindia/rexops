# ADR 0003 — Capability-signed local storage and multi-queue outbox fan-out

## Status

Accepted — 2026-06-22.

## Context

RexOps must run locally without cloud credentials while preserving the same private-media and asynchronous
contracts used with R2, ffmpeg, notifications, and automation.

## Decision

Use one object-storage interface with R2 and local-disk implementations. Local PUT/GET URLs carry expiring HMAC
capabilities; completed multipart parts are integrity-checked before assembly. Domain rows store object keys and
the API mints private preview/download URLs at access time.

Relay each transactional outbox event to the relevant BullMQ queues using the outbox id as the job id. Media,
notification, and automation consumers are independent. Queue producer connections live for the worker process.

## Consequences

The full upload/review loop runs offline with the production trust boundary. Consumers scale and retry
independently. External delivery still requires provider credentials.
