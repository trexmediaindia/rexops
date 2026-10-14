import { createId } from "@paralleldrive/cuid2";
import type { Principal } from "@rexops/core";
import {
  assertClientRecordAccess,
  assertWritablePrincipal,
  ConflictError,
  can,
  ForbiddenError,
  NotFoundError,
} from "@rexops/core";
import { accounts, activityEvents, auditLogs, clients, db, outbox, users } from "@rexops/db";
import type {
  AddClientPersonInput,
  CreateClientInput,
  UpdateClientInput,
} from "@rexops/validators";
import { hashPassword } from "better-auth/crypto";
import { and, asc, eq, isNull } from "drizzle-orm";

function assertCanManageClients(principal: Principal) {
  if (!can(principal, "create", "client")) throw new ForbiddenError();
  if (!principal.agencyId) throw new ForbiddenError();
  assertWritablePrincipal(principal);
}

export async function listClients(principal: Principal) {
  if (!principal.agencyId && principal.role !== "SUPER_ADMIN") return [];
  if (principal.role.startsWith("CLIENT_")) {
    if (!principal.clientId || !principal.agencyId) return [];
    return db
      .select()
      .from(clients)
      .where(
        and(
          eq(clients.agencyId, principal.agencyId),
          eq(clients.id, principal.clientId),
          isNull(clients.deletedAt),
        ),
      );
  }
  if (principal.role === "SUPER_ADMIN") {
    return db.select().from(clients).where(isNull(clients.deletedAt));
  }
  return db
    .select()
    .from(clients)
    .where(and(eq(clients.agencyId, principal.agencyId ?? ""), isNull(clients.deletedAt)));
}

export async function getClient(principal: Principal, id: string) {
  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, id), isNull(clients.deletedAt)))
    .limit(1);
  if (!client) throw new NotFoundError();
  assertClientRecordAccess(principal, { agencyId: client.agencyId, clientId: client.id });
  return client;
}

export async function createClient(principal: Principal, input: CreateClientInput) {
  assertCanManageClients(principal);
  return db.transaction(async (tx) => {
    const [client] = await tx
      .insert(clients)
      .values({
        ...input,
        agencyId: principal.agencyId ?? "",
        createdByUserId: principal.userId,
      })
      .returning();
    if (!client) throw new Error("Client insert failed.");

    await tx.insert(activityEvents).values({
      agencyId: client.agencyId,
      subjectType: "PROJECT",
      subjectId: client.id,
      type: "STATUS_CHANGE",
      actorUserId: principal.userId,
      summary: `Client ${client.name} created`,
    });
    await tx.insert(outbox).values({
      agencyId: client.agencyId,
      eventType: "CLIENT_CREATED",
      payload: { clientId: client.id, actorUserId: principal.userId },
    });
    return client;
  });
}

export async function updateClient(principal: Principal, id: string, input: UpdateClientInput) {
  assertCanManageClients(principal);
  const existing = await getClient(principal, id);
  const [client] = await db
    .update(clients)
    .set(input)
    .where(and(eq(clients.id, id), eq(clients.agencyId, existing.agencyId)))
    .returning();
  if (!client) throw new NotFoundError();
  return client;
}

export async function archiveClient(principal: Principal, id: string) {
  return updateClient(principal, id, {
    status: "ARCHIVED",
  });
}

export type ClientUser = typeof users.$inferSelect;

/** People at a client company who can sign in to the client portal. Agency-side only. */
export async function listClientPeople(principal: Principal, clientId: string) {
  if (principal.role.startsWith("CLIENT_")) throw new ForbiddenError();
  const client = await getClient(principal, clientId);
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      banned: users.banned,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(eq(users.agencyId, client.agencyId), eq(users.clientId, client.id)))
    .orderBy(asc(users.createdAt));
}

/**
 * Gives someone at a client company a portal login. Like a team invite, nothing is emailed:
 * the temporary password comes back once in the response for the agency to pass on, and is
 * never stored or shown again.
 */
export async function addClientPerson(
  principal: Principal,
  clientId: string,
  input: AddClientPersonInput,
) {
  assertCanManageClients(principal);
  if (!can(principal, "invite", "client")) throw new ForbiddenError();
  const client = await getClient(principal, clientId);
  if (client.status === "ARCHIVED") {
    throw new ConflictError("Restore this client before adding people to it.");
  }

  const email = input.email.toLowerCase();
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) throw new ConflictError("Someone already uses that email address.");

  const temporaryPassword = generatePassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const userId = createId();
  const canApprove = input.role === "CLIENT_OWNER";

  const person = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(users)
      .values({
        id: userId,
        name: input.name,
        email,
        emailVerified: true,
        role: input.role,
        agencyId: client.agencyId,
        clientId: client.id,
        permissions: {
          canApprove,
          canInviteClients: canApprove,
          canManageTeam: false,
          canUploadFinal: false,
          canViewAllClients: false,
          canManageAutomations: false,
        },
      })
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        banned: users.banned,
        createdAt: users.createdAt,
      });
    if (!created) throw new Error("Client person insert failed.");

    await tx.insert(accounts).values({
      id: createId(),
      accountId: userId,
      providerId: "credential",
      userId,
      password: passwordHash,
      updatedAt: new Date(),
    });
    await tx.insert(auditLogs).values({
      actorUserId: principal.userId,
      agencyId: client.agencyId,
      action: "CLIENT_PERSON_ADDED",
      targetType: "user",
      targetId: userId,
      meta: { email, role: input.role, clientId: client.id },
    });
    return created;
  });

  return { ...person, temporaryPassword };
}

/** URL-safe, unambiguous alphabet: this string gets read aloud and retyped. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function generatePassword(length = 16) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
}
