import type { Principal } from "@rexops/core";
import { assertWritablePrincipal, ForbiddenError, NotFoundError } from "@rexops/core";
import { agencies, db, users } from "@rexops/db";
import type { UpdateAgencyInput } from "@rexops/validators";
import { count, eq, isNull } from "drizzle-orm";

/**
 * Tenant roster for the root console, with the member headcount each row shows.
 * SUPER_ADMIN only — this is the one cross-tenant read in the module.
 */
export async function listAgencies(principal: Principal) {
  if (principal.role !== "SUPER_ADMIN") throw new ForbiddenError();
  const rows = await db.select().from(agencies).where(isNull(agencies.deletedAt));
  const counts = await db
    .select({ agencyId: users.agencyId, members: count() })
    .from(users)
    .where(isNull(users.deletedAt))
    .groupBy(users.agencyId);
  const byAgency = new Map(counts.map((row) => [row.agencyId, row.members]));
  return rows.map((agency) => ({ ...agency, memberCount: byAgency.get(agency.id) ?? 0 }));
}

export async function getAgency(principal: Principal, id: string) {
  const [agency] = await db.select().from(agencies).where(eq(agencies.id, id)).limit(1);
  if (!agency || agency.deletedAt) throw new NotFoundError();
  if (principal.role !== "SUPER_ADMIN" && principal.agencyId !== id) throw new NotFoundError();
  return agency;
}

export async function updateAgency(principal: Principal, id: string, input: UpdateAgencyInput) {
  if (
    principal.role !== "SUPER_ADMIN" &&
    !["AGENCY_OWNER", "AGENCY_ADMIN"].includes(principal.role)
  ) {
    throw new ForbiddenError();
  }
  if (principal.role !== "SUPER_ADMIN" && principal.agencyId !== id) throw new NotFoundError();
  assertWritablePrincipal(principal);
  const [agency] = await db.update(agencies).set(input).where(eq(agencies.id, id)).returning();
  if (!agency) throw new NotFoundError();
  return agency;
}
