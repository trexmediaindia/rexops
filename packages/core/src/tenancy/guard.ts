import type { Principal, TenantRow } from "./types";

export class NotFoundError extends Error {
  readonly status = 404;

  constructor(message = "Resource not found.") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ForbiddenError extends Error {
  readonly status = 403;

  constructor(message = "You do not have access to this action.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class ConflictError extends Error {
  readonly status = 409;

  constructor(message = "The resource is not ready for this action.") {
    super(message);
    this.name = "ConflictError";
  }
}

export function isSuperAdmin(principal: Principal) {
  return principal.role === "SUPER_ADMIN";
}

export function assertTenantAccess(principal: Principal, row: TenantRow) {
  if (isSuperAdmin(principal)) return;
  if (!principal.agencyId || row.agencyId !== principal.agencyId) {
    throw new NotFoundError();
  }
}

export function assertClientRecordAccess(principal: Principal, row: TenantRow) {
  assertTenantAccess(principal, row);
  if (
    principal.role.startsWith("CLIENT_") &&
    (!principal.clientId || row.clientId !== principal.clientId)
  ) {
    throw new NotFoundError();
  }
}

export function tenantPredicate(principal: Principal) {
  return (row: TenantRow) => {
    if (row.deletedAt) return false;
    if (isSuperAdmin(principal)) return true;
    return Boolean(principal.agencyId && row.agencyId === principal.agencyId);
  };
}

export function clientRecordPredicate(principal: Principal) {
  return (row: TenantRow) => {
    if (!tenantPredicate(principal)(row)) return false;
    if (!principal.role.startsWith("CLIENT_")) return true;
    return Boolean(principal.clientId && row.clientId === principal.clientId);
  };
}

export function assertWritablePrincipal(principal: Principal) {
  if (principal.impersonating) {
    throw new ForbiddenError("Impersonation is read-only.");
  }
}
