import { createId } from "@paralleldrive/cuid2";
import type { Principal } from "@rexops/core";
import { assertWritablePrincipal, ForbiddenError, NotFoundError } from "@rexops/core";
import { agencies, auditLogs, db, members, organizations, outbox, users } from "@rexops/db";
import type { CreateAgencyInput, UpdateAgencyInput } from "@rexops/validators";
import { count, eq, isNull } from "drizzle-orm";

function requireSuperAdmin(principal: Principal) {
  if (principal.role !== "SUPER_ADMIN") throw new ForbiddenError();
  assertWritablePrincipal(principal);
}

export async function createAgency(principal: Principal, input: CreateAgencyInput) {
  requireSuperAdmin(principal);
  return db.transaction(async (tx) => {
    const organizationId = createId();
    const agencyId = createId();
    const ownerId = createId();

    await tx.insert(organizations).values({
      id: organizationId,
      name: input.name,
      slug: input.slug,
      createdAt: new Date(),
    });
    const [agency] = await tx
      .insert(agencies)
      .values({
        id: agencyId,
        name: input.name,
        slug: input.slug,
        betterAuthOrgId: organizationId,
      })
      .returning();
    await tx.insert(users).values({
      id: ownerId,
      name: input.owner.name,
      email: input.owner.email,
      role: "AGENCY_OWNER",
      agencyId,
      permissions: {
        canApprove: true,
        canInviteClients: true,
        canManageTeam: true,
        canUploadFinal: true,
        canViewAllClients: true,
        canManageAutomations: true,
      },
    });
    await tx.insert(members).values({
      id: createId(),
      organizationId,
      userId: ownerId,
      role: "owner",
      createdAt: new Date(),
    });
    await tx.insert(auditLogs).values({
      actorUserId: principal.userId,
      agencyId,
      action: "AGENCY_PROVISIONED",
      targetType: "agency",
      targetId: agencyId,
      meta: { ownerEmail: input.owner.email },
    });
    await tx.insert(outbox).values({
      agencyId,
      eventType: "AGENCY_PROVISIONED",
      payload: { agencyId, ownerId, ownerEmail: input.owner.email },
    });
    return agency;
  });
}

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
