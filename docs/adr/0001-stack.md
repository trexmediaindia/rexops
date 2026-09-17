# ADR 0001 — TypeScript/Bun modular monorepo

## Status

Accepted — 2026-06-22.

## Context

RexOps needs one type spine across an authenticated SPA, a tenant-aware API, and background media/notification
workers. The review workflow requires transactions, server-originated realtime authorization, and independently
scalable workers.

## Decision

Use Bun workspaces and Turborepo; React/Vite for the SPA; Elysia and Eden Treaty for the API boundary; Drizzle
over PostgreSQL; BullMQ/Redis for asynchronous work. Framework-free domain and authorization logic lives in
`@rexops/core`. The API exports its Elysia instance without listening so tests run in-process.

## Consequences

The stack has one language and shared validation/types. Package boundaries must be enforced mechanically.
Fast-moving integrations are verified against current primary documentation before implementation.
