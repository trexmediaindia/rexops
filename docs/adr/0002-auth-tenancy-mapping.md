# ADR 0002 — Agency organization plus explicit domain tenancy

## Status

Accepted — 2026-06-22.

## Context

The agency↔client trust boundary is the product's highest-risk invariant. Better Auth organizations are useful
for agency staff membership and invitations, but client users are not agency staff and must never inherit
organization-wide visibility.

## Decision

An Agency maps to a Better Auth organization. Agency staff are organization members. Client organizations remain
first-class RexOps domain rows; client users carry `agencyId`, `clientId`, and a `CLIENT_*` role but are not
organization members. Every domain access is constrained by the framework-free tenant and record-rule guard.
Cross-tenant object guesses return 404. Super-admin is the only exemption and all cross-tenant actions are
audited. Impersonation is read-only.

## Consequences

Authorization remains explicit and testable independent of auth-provider membership semantics. Every
tenant-owned table carries `agencyId`, and client-facing reads additionally constrain `clientId` and strip
internal fields.
