import { createId } from "@paralleldrive/cuid2";
import { DEFAULT_PERMISSION_FLAGS, type PermissionFlags } from "@rexops/config";
import type { Principal } from "@rexops/core";
import {
  assertWritablePrincipal,
  ConflictError,
  can,
  ForbiddenError,
  NotFoundError,
} from "@rexops/core";
import {
  accounts,
  agencies,
  auditLogs,
  db,
  deliverables,
  members,
  outbox,
  projectMembers,
  sessions,
  users,
} from "@rexops/db";
import type { InviteTeamMemberInput, UpdateTeamMemberInput } from "@rexops/validators";
import { hashPassword } from "better-auth/crypto";
import { and, count, eq, inArray, isNull, max, ne, sql } from "drizzle-orm";

/** The three roles that appear on the Team roster. Client-side users live on the
 * clients screen and are filtered out of every query here. */
const AGENCY_ROLES = ["AGENCY_OWNER", "AGENCY_ADMIN", "AGENCY_MEMBER"] as const;

/** Deliverables that still count as open work against a teammate's load. */
const OPEN_STATUSES = [
  "PENDING",
  "IN_PROGRESS",
  "READY_FOR_INTERNAL_REVIEW",
  "UNDER_INTERNAL_REVIEW",
  "INTERNAL_APPROVED",
  "UNDER_CLIENT_REVIEW",
  "REVISION_REQUESTED",
] as const;

function requireAgency(principal: Principal) {
  if (!principal.agencyId) throw new ForbiddenError();
  return principal.agencyId;
}

/**
 * The roster, with the two numbers each row shows: open deliverables assigned to
 * the person and how many projects they sit on. Both are aggregated in Postgres
 * rather than fetched per row, so the page is three queries regardless of size.
 */
export async function listTeam(principal: Principal) {
  if (!can(principal, "read", "member")) throw new ForbiddenError();
  const agencyId = requireAgency(principal);

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      specialty: users.specialty,
      permissions: users.permissions,
      banned: users.banned,
      emailVerified: users.emailVerified,
      image: users.image,
      createdAt: users.createdAt,
      lastSeenAt: max(sessions.createdAt),
    })
    .from(users)
    .leftJoin(sessions, eq(sessions.userId, users.id))
    .where(
      and(
        eq(users.agencyId, agencyId),
        isNull(users.deletedAt),
        inArray(users.role, [...AGENCY_ROLES]),
      ),
    )
    .groupBy(users.id);

  const openWork = await db
    .select({ userId: deliverables.assignedToUserId, open: count() })
    .from(deliverables)
    .where(
      and(
        eq(deliverables.agencyId, agencyId),
        isNull(deliverables.deletedAt),
        inArray(deliverables.status, [...OPEN_STATUSES]),
      ),
    )
    .groupBy(deliverables.assignedToUserId);

  const projectLoad = await db
    .select({ userId: projectMembers.userId, projects: count() })
    .from(projectMembers)
    .where(eq(projectMembers.agencyId, agencyId))
    .groupBy(projectMembers.userId);

  const openByUser = new Map(openWork.map((row) => [row.userId, row.open]));
  const projectsByUser = new Map(projectLoad.map((row) => [row.userId, row.projects]));

  return rows
    .map((row) => ({
      ...row,
      banned: row.banned ?? false,
      permissions: {
        ...DEFAULT_PERMISSION_FLAGS,
        ...(row.permissions as Partial<PermissionFlags>),
      },
      openDeliverables: openByUser.get(row.id) ?? 0,
      projectCount: projectsByUser.get(row.id) ?? 0,
    }))
    .sort((a, b) => {
      const rank = AGENCY_ROLES.indexOf(a.role as never) - AGENCY_ROLES.indexOf(b.role as never);
      return rank !== 0 ? rank : a.name.localeCompare(b.name);
    });
}

/** Loads a roster row and proves it belongs to the actor's agency. */
async function requireTeammate(agencyId: string, userId: string) {
  const [teammate] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), eq(users.agencyId, agencyId), isNull(users.deletedAt)))
    .limit(1);
  if (!teammate || !AGENCY_ROLES.includes(teammate.role as never)) throw new NotFoundError();
  return teammate;
}

/** Owners are the only role that can create or unmake another owner. */
function assertCanAssignRole(principal: Principal, role: string) {
  if (
    role === "AGENCY_OWNER" &&
    principal.role !== "AGENCY_OWNER" &&
    principal.role !== "SUPER_ADMIN"
  ) {
    throw new ForbiddenError("Only an owner can grant the owner role.");
  }
}

/** Refuses any change that would leave the agency with no active owner. */
async function assertNotLastOwner(agencyId: string, userId: string) {
  const [remaining] = await db
    .select({ owners: count() })
    .from(users)
    .where(
      and(
        eq(users.agencyId, agencyId),
        eq(users.role, "AGENCY_OWNER"),
        isNull(users.deletedAt),
        ne(users.id, userId),
        sql`coalesce(${users.banned}, false) = false`,
      ),
    );
  if ((remaining?.owners ?? 0) === 0) {
    throw new ConflictError("An agency must keep at least one active owner.");
  }
}

/**
 * Adds a teammate straight into the tenant.
 *
 * There is no outbound email in this stack, so the invite is a credential the
 * inviter hands over: the row gets a generated password that is returned exactly
 * once in this response and is never readable again (only its hash is stored).
 */
export async function inviteTeamMember(principal: Principal, input: InviteTeamMemberInput) {
  if (!can(principal, "invite", "member")) throw new ForbiddenError();
  assertWritablePrincipal(principal);
  const agencyId = requireAgency(principal);
  assertCanAssignRole(principal, input.role);

  const email = input.email.toLowerCase();
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) throw new ConflictError("Someone already uses that email address.");

  const [agency] = await db.select().from(agencies).where(eq(agencies.id, agencyId)).limit(1);
  if (!agency) throw new NotFoundError();

  const temporaryPassword = generatePassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const userId = createId();

  const teammate = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(users)
      .values({
        id: userId,
        name: input.name,
        email,
        role: input.role,
        specialty: input.specialty,
        agencyId,
        permissions: { ...DEFAULT_PERMISSION_FLAGS, ...input.permissions },
      })
      .returning();
    if (!created) throw new Error("Team member insert failed.");

    await tx.insert(accounts).values({
      id: createId(),
      accountId: userId,
      providerId: "credential",
      userId,
      password: passwordHash,
      updatedAt: new Date(),
    });

    // Keep the Better Auth organization roster in step with ours.
    if (agency.betterAuthOrgId) {
      await tx.insert(members).values({
        id: createId(),
        organizationId: agency.betterAuthOrgId,
        userId,
        role: input.role === "AGENCY_OWNER" ? "owner" : "member",
        createdAt: new Date(),
      });
    }

    await tx.insert(auditLogs).values({
      actorUserId: principal.userId,
      agencyId,
      action: "TEAM_MEMBER_INVITED",
      targetType: "user",
      targetId: userId,
      meta: { email, role: input.role },
    });
    await tx.insert(outbox).values({
      agencyId,
      eventType: "TEAM_MEMBER_INVITED",
      payload: { userId, email, role: input.role },
    });
    return created;
  });

  return { ...teammate, temporaryPassword, openDeliverables: 0, projectCount: 0 };
}

/**
 * Role, specialty, permission flags, and the active/suspended switch. Every path
 * that could strand the tenant without an owner — or let someone edit their own
 * access — is refused here rather than in the UI.
 */
export async function updateTeamMember(
  principal: Principal,
  userId: string,
  input: UpdateTeamMemberInput,
) {
  if (!can(principal, "update", "member")) throw new ForbiddenError();
  assertWritablePrincipal(principal);
  const agencyId = requireAgency(principal);
  const teammate = await requireTeammate(agencyId, userId);

  const changesAccess =
    input.role !== undefined || input.permissions !== undefined || input.banned !== undefined;
  if (changesAccess && teammate.id === principal.userId) {
    throw new ForbiddenError("You cannot change your own role or access.");
  }
  if (input.role) assertCanAssignRole(principal, input.role);
  if (
    teammate.role === "AGENCY_OWNER" &&
    principal.role !== "AGENCY_OWNER" &&
    principal.role !== "SUPER_ADMIN"
  ) {
    throw new ForbiddenError("Only an owner can edit another owner.");
  }
  if (
    teammate.role === "AGENCY_OWNER" &&
    ((input.role && input.role !== "AGENCY_OWNER") || input.banned === true)
  ) {
    await assertNotLastOwner(agencyId, teammate.id);
  }

  const permissions = input.permissions
    ? {
        ...DEFAULT_PERMISSION_FLAGS,
        ...(teammate.permissions as Partial<PermissionFlags>),
        ...input.permissions,
      }
    : undefined;

  const [updated] = await db
    .update(users)
    .set({
      ...(input.name ? { name: input.name } : {}),
      ...(input.role ? { role: input.role } : {}),
      ...(input.specialty ? { specialty: input.specialty } : {}),
      ...(permissions ? { permissions } : {}),
      ...(input.banned === undefined
        ? {}
        : {
            banned: input.banned,
            banReason: input.banned ? "Suspended by an agency admin." : null,
          }),
    })
    .where(and(eq(users.id, userId), eq(users.agencyId, agencyId)))
    .returning();
  if (!updated) throw new NotFoundError();

  if (teammate.role !== updated.role) {
    const [agency] = await db.select().from(agencies).where(eq(agencies.id, agencyId)).limit(1);
    if (agency?.betterAuthOrgId) {
      await db
        .update(members)
        .set({ role: updated.role === "AGENCY_OWNER" ? "owner" : "member" })
        .where(
          and(eq(members.organizationId, agency.betterAuthOrgId), eq(members.userId, updated.id)),
        );
    }
  }

  // A suspended teammate must not keep an open session.
  if (input.banned === true) await db.delete(sessions).where(eq(sessions.userId, userId));

  await db.insert(auditLogs).values({
    actorUserId: principal.userId,
    agencyId,
    action:
      input.banned === undefined
        ? "TEAM_MEMBER_UPDATED"
        : input.banned
          ? "TEAM_MEMBER_SUSPENDED"
          : "TEAM_MEMBER_REINSTATED",
    targetType: "user",
    targetId: userId,
    meta: { role: updated.role, banned: updated.banned ?? false },
  });

  return updated;
}

/** URL-safe, unambiguous alphabet — this string gets read aloud and retyped. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function generatePassword(length = 16) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
}
