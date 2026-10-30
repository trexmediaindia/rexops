import { createId } from "@paralleldrive/cuid2";
import type { Principal } from "@rexops/core";
import {
  assertWritablePrincipal,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "@rexops/core";
import {
  accounts,
  agencies,
  auditLogs,
  clients,
  customFieldDefs,
  db,
  deliverables,
  members,
  organizations,
  outbox,
  pipelineStages,
  pipelines,
  projects,
  sessions,
  users,
} from "@rexops/db";
import { hashPassword } from "better-auth/crypto";
import { and, eq, inArray, isNull, type SQL, sql } from "drizzle-orm";
import { getDeliverable } from "../deliverables/deliverables.service";
import { getProject } from "../projects/projects.service";
import { assertNotLastOwner, generatePassword } from "../team/team.service";
import { purge } from "./purge";

/*
 * Every way to take something away, in one place:
 *
 *   archive / restore  — hides it and (for a client) locks its logins; nothing is lost
 *   suspend / restore  — one person or a whole agency can't sign in; nothing is lost
 *   remove             — a person is gone from the lists and can't sign in; what they
 *                        wrote stays, under their name
 *   delete permanently — the thing and everything inside it are erased, files included
 *
 * Permanent deletes ask for the exact name typed back, and only owners and admins
 * (or, for agencies, the platform admin) can do them.
 */

const CLIENT_ARCHIVED = "The client was archived.";
const AGENCY_SUSPENDED = "The agency was suspended.";

function requireAgencyAdmin(principal: Principal) {
  assertWritablePrincipal(principal);
  if (principal.role !== "AGENCY_OWNER" && principal.role !== "AGENCY_ADMIN") {
    throw new ForbiddenError("Only an owner or admin can do this.");
  }
  if (!principal.agencyId) throw new ForbiddenError();
  return principal.agencyId;
}

function requireSuperAdmin(principal: Principal) {
  if (principal.role !== "SUPER_ADMIN")
    throw new ForbiddenError("Only the platform admin can do this.");
  assertWritablePrincipal(principal);
}

function assertTyped(expected: string, typed: string | undefined) {
  if ((typed ?? "").trim() !== expected.trim()) {
    throw new ConflictError(`Type "${expected}" exactly to confirm.`);
  }
}

async function audit(
  principal: Principal,
  agencyId: string | null,
  action: string,
  targetType: string,
  targetId: string,
  meta: Record<string, unknown>,
) {
  await db.insert(auditLogs).values({
    actorUserId: principal.userId,
    agencyId,
    action,
    targetType,
    targetId,
    meta,
  });
}

/** Signs someone out everywhere and keeps them out. */
async function lockOut(userIds: string[], reason: string) {
  if (!userIds.length) return;
  await db
    .update(users)
    .set({ banned: true, banReason: reason })
    .where(and(inArray(users.id, userIds), eq(users.banned, false)));
  await db.delete(sessions).where(inArray(sessions.userId, userIds));
}

/** Lets back in only the people a lock with this reason shut out, not anyone suspended separately. */
async function unlock(where: SQL, reason: string) {
  await db
    .update(users)
    .set({ banned: false, banReason: null })
    .where(and(where, eq(users.banReason, reason), isNull(users.deletedAt)));
}

/**
 * A removed person disappears from every list and loses their password, but their name
 * stays on what they wrote. Their email is freed so the same address can be added again.
 */
async function removePerson(userId: string, reason: string) {
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        deletedAt: new Date(),
        banned: true,
        banReason: reason,
        email: sql`'removed-' || ${users.id} || '@removed.invalid'`,
      })
      .where(eq(users.id, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await tx.delete(accounts).where(eq(accounts.userId, userId));
    await tx.delete(members).where(eq(members.userId, userId));
  });
}

// ─── Team ─────────────────────────────────────────────────────────────────────

export async function removeTeamMember(principal: Principal, userId: string) {
  const agencyId = requireAgencyAdmin(principal);
  if (userId === principal.userId) throw new ForbiddenError("You can't remove yourself.");
  const [person] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), eq(users.agencyId, agencyId), isNull(users.deletedAt)))
    .limit(1);
  if (!person || person.role.startsWith("CLIENT_")) throw new NotFoundError();
  if (person.role === "AGENCY_OWNER") {
    if (principal.role !== "AGENCY_OWNER")
      throw new ForbiddenError("Only an owner can remove an owner.");
    await assertNotLastOwner(agencyId, userId);
  }
  await removePerson(userId, "Removed from the team.");
  await audit(principal, agencyId, "TEAM_MEMBER_REMOVED", "user", userId, {
    name: person.name,
    email: person.email,
  });
  return { ok: true };
}

// ─── Client people ────────────────────────────────────────────────────────────

async function clientPerson(principal: Principal, clientId: string, userId: string) {
  const agencyId = requireAgencyAdmin(principal);
  const [person] = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.id, userId),
        eq(users.agencyId, agencyId),
        eq(users.clientId, clientId),
        isNull(users.deletedAt),
      ),
    )
    .limit(1);
  if (!person) throw new NotFoundError();
  return { agencyId, person };
}

export async function setClientPersonAccess(
  principal: Principal,
  clientId: string,
  userId: string,
  suspended: boolean,
) {
  const { agencyId, person } = await clientPerson(principal, clientId, userId);
  if (suspended) {
    await db
      .update(users)
      .set({ banned: true, banReason: "Suspended by the agency." })
      .where(eq(users.id, userId));
    await db.delete(sessions).where(eq(sessions.userId, userId));
  } else {
    const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
    if (client?.status === "ARCHIVED") {
      throw new ConflictError(
        "Restore the client first; its logins are locked while it is archived.",
      );
    }
    await db.update(users).set({ banned: false, banReason: null }).where(eq(users.id, userId));
  }
  await audit(
    principal,
    agencyId,
    suspended ? "CLIENT_PERSON_SUSPENDED" : "CLIENT_PERSON_RESTORED",
    "user",
    userId,
    { name: person.name, clientId },
  );
  return { ok: true };
}

export async function removeClientPerson(principal: Principal, clientId: string, userId: string) {
  const { agencyId, person } = await clientPerson(principal, clientId, userId);
  await removePerson(userId, "Removed by the agency.");
  await audit(principal, agencyId, "CLIENT_PERSON_REMOVED", "user", userId, {
    name: person.name,
    email: person.email,
    clientId,
  });
  return { ok: true };
}

// ─── Clients ──────────────────────────────────────────────────────────────────

async function agencyClient(principal: Principal, clientId: string) {
  const agencyId = requireAgencyAdmin(principal);
  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.agencyId, agencyId), isNull(clients.deletedAt)))
    .limit(1);
  if (!client) throw new NotFoundError();
  return { agencyId, client };
}

/** Archiving hides the client and locks every login at that company until it is restored. */
export async function archiveClientAndLock(principal: Principal, clientId: string) {
  const { agencyId, client } = await agencyClient(principal, clientId);
  await db.update(clients).set({ status: "ARCHIVED" }).where(eq(clients.id, client.id));
  const people = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.clientId, client.id), isNull(users.deletedAt)));
  await lockOut(
    people.map((row) => row.id),
    CLIENT_ARCHIVED,
  );
  await audit(principal, agencyId, "CLIENT_ARCHIVED", "client", client.id, {
    name: client.name,
    loginsLocked: people.length,
  });
  const [updated] = await db.select().from(clients).where(eq(clients.id, client.id));
  return updated;
}

export async function restoreClient(principal: Principal, clientId: string) {
  const { agencyId, client } = await agencyClient(principal, clientId);
  await db.update(clients).set({ status: "ACTIVE" }).where(eq(clients.id, client.id));
  await unlock(eq(users.clientId, client.id), CLIENT_ARCHIVED);
  await audit(principal, agencyId, "CLIENT_RESTORED", "client", client.id, { name: client.name });
  const [updated] = await db.select().from(clients).where(eq(clients.id, client.id));
  return updated;
}

export async function deleteClientPermanently(
  principal: Principal,
  clientId: string,
  typedName: string | undefined,
) {
  const { agencyId, client } = await agencyClient(principal, clientId);
  assertTyped(client.name, typedName);
  const people = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.agencyId, agencyId), eq(users.clientId, client.id)));
  const summary = await purge(async (run) => {
    await run.remove(
      "project",
      (
        await db.select({ id: projects.id }).from(projects).where(eq(projects.clientId, client.id))
      ).map((row) => row.id),
    );
    await run.remove(
      "user",
      people.map((row) => row.id),
    );
    await run.remove("client", [client.id]);
  });
  await audit(principal, agencyId, "CLIENT_DELETED", "client", client.id, {
    name: client.name,
    removed: summary,
  });
  return { ok: true, removed: summary };
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export async function deleteProjectPermanently(
  principal: Principal,
  projectId: string,
  typedName: string | undefined,
) {
  const agencyId = requireAgencyAdmin(principal);
  const project = await getProject(principal, projectId);
  if (project.agencyId !== agencyId) throw new NotFoundError();
  assertTyped(project.name, typedName);
  const summary = await purge((run) => run.remove("project", [project.id]));
  await audit(principal, agencyId, "PROJECT_DELETED", "project", project.id, {
    name: project.name,
    removed: summary,
  });
  return { ok: true, removed: summary };
}

// ─── Pieces of work ───────────────────────────────────────────────────────────

export async function restoreDeliverable(principal: Principal, deliverableId: string) {
  const agencyId = requireAgencyAdmin(principal);
  const deliverable = await getDeliverable(principal, deliverableId);
  if (deliverable.agencyId !== agencyId) throw new NotFoundError();
  if (deliverable.status !== "ARCHIVED") return deliverable;
  // Back to the team: whatever it was waiting on before, someone should look again.
  const [updated] = await db
    .update(deliverables)
    .set({ status: "IN_PROGRESS" })
    .where(eq(deliverables.id, deliverable.id))
    .returning();
  await audit(principal, agencyId, "DELIVERABLE_RESTORED", "deliverable", deliverable.id, {
    title: deliverable.title,
  });
  return updated;
}

export async function deleteDeliverablePermanently(
  principal: Principal,
  deliverableId: string,
  typedName: string | undefined,
) {
  const agencyId = requireAgencyAdmin(principal);
  const deliverable = await getDeliverable(principal, deliverableId);
  if (deliverable.agencyId !== agencyId) throw new NotFoundError();
  assertTyped(deliverable.title, typedName);
  const summary = await purge((run) => run.remove("deliverable", [deliverable.id]));
  await audit(principal, agencyId, "DELIVERABLE_DELETED", "deliverable", deliverable.id, {
    title: deliverable.title,
    removed: summary,
  });
  return { ok: true, removed: summary };
}

// ─── Agencies (platform admin) ────────────────────────────────────────────────

/**
 * A new agency and its first owner, with a temporary password returned once for the
 * platform admin to pass on (nothing is emailed).
 */
export async function createAgencyWithOwner(
  principal: Principal,
  input: { name: string; slug: string; owner: { name: string; email: string } },
) {
  requireSuperAdmin(principal);
  const email = input.owner.email.trim().toLowerCase();
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing) throw new ConflictError("Someone already uses that email address.");
  const [slugTaken] = await db
    .select({ id: agencies.id })
    .from(agencies)
    .where(eq(agencies.slug, input.slug))
    .limit(1);
  if (slugTaken) throw new ConflictError("Another agency already uses that short name.");

  const temporaryPassword = generatePassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const organizationId = createId();
  const agencyId = createId();
  const ownerId = createId();
  const agency = await db.transaction(async (tx) => {
    await tx
      .insert(organizations)
      .values({ id: organizationId, name: input.name, slug: input.slug, createdAt: new Date() });
    const [created] = await tx
      .insert(agencies)
      .values({ id: agencyId, name: input.name, slug: input.slug, betterAuthOrgId: organizationId })
      .returning();
    await tx.insert(users).values({
      id: ownerId,
      name: input.owner.name,
      email,
      emailVerified: true,
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
    await tx.insert(accounts).values({
      id: createId(),
      accountId: ownerId,
      providerId: "credential",
      userId: ownerId,
      password: passwordHash,
      updatedAt: new Date(),
    });
    await tx.insert(members).values({
      id: createId(),
      organizationId,
      userId: ownerId,
      role: "owner",
      createdAt: new Date(),
    });
    // The same starting kit a bootstrapped agency gets: a review pipeline and the
    // built-in fields, so the new agency can send work for approval on day one.
    const pipelineId = createId();
    await tx
      .insert(pipelines)
      .values({ id: pipelineId, agencyId, name: "Default internal → client", isDefault: true });
    await tx.insert(pipelineStages).values([
      {
        id: createId(),
        agencyId,
        pipelineId,
        name: "Internal review",
        type: "INTERNAL",
        sequence: 1,
        requiresInternalApproval: true,
      },
      {
        id: createId(),
        agencyId,
        pipelineId,
        name: "Client review",
        type: "CLIENT",
        sequence: 2,
        requiresClientApproval: true,
      },
    ]);
    await tx.insert(customFieldDefs).values(
      (
        [
          ["content_type", "Content Type", "SINGLE_SELECT"],
          ["platform", "Platform", "SINGLE_SELECT"],
          ["aspect_ratio", "Aspect Ratio", "SINGLE_SELECT"],
          ["campaign", "Campaign", "TEXT"],
        ] as const
      ).map(([key, label, type], position) => ({
        agencyId,
        scope: "DELIVERABLE" as const,
        key,
        label,
        type,
        groupable: true,
        isBuiltIn: true,
        position,
      })),
    );
    await tx.insert(outbox).values({
      agencyId,
      eventType: "AGENCY_PROVISIONED",
      payload: { agencyId, ownerId, ownerEmail: email },
    });
    return created;
  });
  await audit(principal, agencyId, "AGENCY_PROVISIONED", "agency", agencyId, { ownerEmail: email });
  return { ...agency, owner: { name: input.owner.name, email, temporaryPassword } };
}

async function existingAgency(agencyId: string) {
  const [agency] = await db
    .select()
    .from(agencies)
    .where(and(eq(agencies.id, agencyId), isNull(agencies.deletedAt)))
    .limit(1);
  if (!agency) throw new NotFoundError();
  return agency;
}

export async function suspendAgency(principal: Principal, agencyId: string) {
  requireSuperAdmin(principal);
  const agency = await existingAgency(agencyId);
  await db.update(agencies).set({ suspendedAt: new Date() }).where(eq(agencies.id, agency.id));
  const people = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.agencyId, agency.id), isNull(users.deletedAt)));
  await lockOut(
    people.map((row) => row.id),
    AGENCY_SUSPENDED,
  );
  await audit(principal, agency.id, "AGENCY_SUSPENDED", "agency", agency.id, {
    name: agency.name,
    loginsLocked: people.length,
  });
  return { ok: true };
}

export async function restoreAgency(principal: Principal, agencyId: string) {
  requireSuperAdmin(principal);
  const agency = await existingAgency(agencyId);
  await db.update(agencies).set({ suspendedAt: null }).where(eq(agencies.id, agency.id));
  await unlock(eq(users.agencyId, agency.id), AGENCY_SUSPENDED);
  await audit(principal, agency.id, "AGENCY_RESTORED", "agency", agency.id, { name: agency.name });
  return { ok: true };
}

/** Sets a new temporary password for an agency's owner, for when they are locked out. */
export async function resetAgencyOwnerPassword(principal: Principal, agencyId: string) {
  requireSuperAdmin(principal);
  const agency = await existingAgency(agencyId);
  const [owner] = await db
    .select()
    .from(users)
    .where(
      and(eq(users.agencyId, agency.id), eq(users.role, "AGENCY_OWNER"), isNull(users.deletedAt)),
    )
    .limit(1);
  if (!owner) throw new NotFoundError("This agency has no owner.");
  const temporaryPassword = generatePassword();
  const password = await hashPassword(temporaryPassword);
  const [account] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, owner.id), eq(accounts.providerId, "credential")))
    .limit(1);
  if (account) {
    await db
      .update(accounts)
      .set({ password, updatedAt: new Date() })
      .where(eq(accounts.id, account.id));
  } else {
    await db.insert(accounts).values({
      id: createId(),
      accountId: owner.id,
      providerId: "credential",
      userId: owner.id,
      password,
      updatedAt: new Date(),
    });
  }
  await db.delete(sessions).where(eq(sessions.userId, owner.id));
  await audit(principal, agency.id, "AGENCY_OWNER_PASSWORD_RESET", "user", owner.id, {
    email: owner.email,
  });
  return { owner: { name: owner.name, email: owner.email, temporaryPassword } };
}

export async function deleteAgencyPermanently(
  principal: Principal,
  agencyId: string,
  typedName: string | undefined,
) {
  requireSuperAdmin(principal);
  const agency = await existingAgency(agencyId);
  assertTyped(agency.name, typedName);
  const summary = await purge(
    async (run) => {
      await run.remove("agency", [agency.id]);
      if (agency.betterAuthOrgId) {
        await run.remove("organization", [agency.betterAuthOrgId]);
      }
    },
    // Everything that carries this agency's id goes, including the optional links
    // (its people, notifications, audit trail).
    { alsoFollow: (edge) => edge.parent === "agency" },
  );
  // The platform keeps one line saying it happened.
  await db.insert(auditLogs).values({
    actorUserId: principal.userId,
    agencyId: null,
    action: "AGENCY_DELETED",
    targetType: "agency",
    targetId: agency.id,
    meta: { name: agency.name, removed: summary },
  });
  return { ok: true, removed: summary };
}

/** For the sign-in check: is this agency currently suspended? */
export async function isAgencySuspended(agencyId: string) {
  const [row] = await db
    .select({ suspendedAt: agencies.suspendedAt })
    .from(agencies)
    .where(eq(agencies.id, agencyId))
    .limit(1);
  return Boolean(row?.suspendedAt);
}
