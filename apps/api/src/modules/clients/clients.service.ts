import type { Principal } from "@rexops/core";
import {
  assertClientRecordAccess,
  assertWritablePrincipal,
  can,
  ForbiddenError,
  NotFoundError,
} from "@rexops/core";
import { activityEvents, clients, db, outbox, type users } from "@rexops/db";
import type { CreateClientInput, UpdateClientInput } from "@rexops/validators";
import { and, eq, isNull } from "drizzle-orm";

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
