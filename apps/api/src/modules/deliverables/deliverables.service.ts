import type { Principal } from "@rexops/core";
import {
  transitionDeliverable as applyTransition,
  assertClientRecordAccess,
  assertWritablePrincipal,
  can,
  ForbiddenError,
  NotFoundError,
  stripInternalDeliverableFields,
} from "@rexops/core";
import { db, deliverables, outbox, projectMembers, projects } from "@rexops/db";
import type {
  CreateDeliverableInput,
  MarkPublishedInput,
  TransitionDeliverableInput,
  UpdateDeliverableInput,
} from "@rexops/validators";
import { and, eq, inArray, isNull } from "drizzle-orm";

async function visibleProjectIds(principal: Principal) {
  if (principal.role !== "AGENCY_MEMBER" || principal.permissions.canViewAllClients) return null;
  const rows = await db
    .select({ projectId: projectMembers.projectId })
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.agencyId, principal.agencyId ?? ""),
        eq(projectMembers.userId, principal.userId),
      ),
    );
  return rows.map((row) => row.projectId);
}

export async function listDeliverables(principal: Principal) {
  if (principal.role === "SUPER_ADMIN") {
    return db.select().from(deliverables).where(isNull(deliverables.deletedAt));
  }
  if (!principal.agencyId) return [];
  const filters = [eq(deliverables.agencyId, principal.agencyId), isNull(deliverables.deletedAt)];
  if (principal.role.startsWith("CLIENT_")) {
    if (!principal.clientId) return [];
    filters.push(eq(deliverables.clientId, principal.clientId));
  }
  const projectIds = await visibleProjectIds(principal);
  if (projectIds && projectIds.length === 0) return [];
  if (projectIds) filters.push(inArray(deliverables.projectId, projectIds));

  const rows = await db
    .select()
    .from(deliverables)
    .where(and(...filters));
  return rows.map((row) => stripInternalDeliverableFields(principal, row));
}

export async function getDeliverable(principal: Principal, id: string) {
  const [deliverable] = await db
    .select()
    .from(deliverables)
    .where(and(eq(deliverables.id, id), isNull(deliverables.deletedAt)))
    .limit(1);
  if (!deliverable) throw new NotFoundError();
  assertClientRecordAccess(principal, deliverable);
  const projectIds = await visibleProjectIds(principal);
  if (projectIds && !projectIds.includes(deliverable.projectId)) throw new NotFoundError();
  return stripInternalDeliverableFields(principal, deliverable);
}

export async function createDeliverable(principal: Principal, input: CreateDeliverableInput) {
  if (!can(principal, "create", "deliverable") || !principal.agencyId) {
    throw new ForbiddenError();
  }
  assertWritablePrincipal(principal);

  const [project] = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.id, input.projectId),
        eq(projects.agencyId, principal.agencyId),
        isNull(projects.deletedAt),
      ),
    )
    .limit(1);
  if (!project) throw new NotFoundError();
  const projectIds = await visibleProjectIds(principal);
  if (projectIds && !projectIds.includes(project.id)) throw new NotFoundError();

  return db.transaction(async (tx) => {
    const [deliverable] = await tx
      .insert(deliverables)
      .values({
        ...input,
        agencyId: project.agencyId,
        clientId: project.clientId,
        createdByUserId: principal.userId,
      })
      .returning();
    if (!deliverable) throw new Error("Deliverable insert failed.");

    await tx.insert(outbox).values({
      agencyId: deliverable.agencyId,
      eventType: "DELIVERABLE_CREATED",
      payload: {
        deliverableId: deliverable.id,
        projectId: deliverable.projectId,
        contentType: deliverable.contentType,
      },
    });
    return deliverable;
  });
}

export async function updateDeliverable(
  principal: Principal,
  id: string,
  input: UpdateDeliverableInput,
) {
  if (!can(principal, "update", "deliverable")) throw new ForbiddenError();
  assertWritablePrincipal(principal);
  const existing = await getDeliverable(principal, id);
  const [updated] = await db
    .update(deliverables)
    .set(input)
    .where(
      and(
        eq(deliverables.id, id),
        eq(deliverables.agencyId, (existing as { agencyId: string }).agencyId),
      ),
    )
    .returning();
  if (!updated) throw new NotFoundError();
  return stripInternalDeliverableFields(principal, updated);
}

export async function transitionDeliverable(
  principal: Principal,
  id: string,
  input: TransitionDeliverableInput,
) {
  if (!can(principal, "update", "deliverable")) throw new ForbiddenError();
  assertWritablePrincipal(principal);
  const current = await getDeliverable(principal, id);
  const from = (current as { status: typeof deliverables.$inferSelect.status }).status;
  const next = applyTransition(from, input.to);

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(deliverables)
      .set({ status: next })
      .where(
        and(
          eq(deliverables.id, id),
          eq(deliverables.agencyId, (current as { agencyId: string }).agencyId),
          eq(deliverables.status, from),
        ),
      )
      .returning();
    if (!updated) throw new NotFoundError();
    await tx.insert(outbox).values({
      agencyId: updated.agencyId,
      eventType: "DELIVERABLE_STATUS_CHANGED",
      payload: { deliverableId: id, from, to: next, actorUserId: principal.userId },
    });
    return stripInternalDeliverableFields(principal, updated);
  });
}

/**
 * Records that an approved post or ad went out (the app tracks publishing, it does not
 * publish). Moves the work to DELIVERED, so it leaves every "to do" list.
 */
export async function markPublished(principal: Principal, id: string, input: MarkPublishedInput) {
  if (!can(principal, "update", "deliverable")) throw new ForbiddenError();
  assertWritablePrincipal(principal);
  const current = (await getDeliverable(principal, id)) as typeof deliverables.$inferSelect;
  if (current.status !== "APPROVED" && current.status !== "DELIVERED") {
    throw new ForbiddenError("Only approved work can be marked as posted.");
  }
  const next =
    current.status === "APPROVED" ? applyTransition("APPROVED", "DELIVERED") : "DELIVERED";
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(deliverables)
      .set({
        status: next,
        publishedAt: current.publishedAt ?? new Date(),
        publishUrl: input.publishUrl ?? current.publishUrl,
      })
      .where(and(eq(deliverables.id, id), eq(deliverables.agencyId, current.agencyId)))
      .returning();
    if (!updated) throw new NotFoundError();
    if (current.status !== next) {
      await tx.insert(outbox).values({
        agencyId: updated.agencyId,
        eventType: "DELIVERABLE_STATUS_CHANGED",
        payload: {
          deliverableId: id,
          from: current.status,
          to: next,
          actorUserId: principal.userId,
        },
      });
    }
    return stripInternalDeliverableFields(principal, updated);
  });
}

/** Undo a "posted" marked by mistake: back to approved, with the post link cleared. */
export async function undoPublished(principal: Principal, id: string) {
  if (!can(principal, "update", "deliverable")) throw new ForbiddenError();
  assertWritablePrincipal(principal);
  const current = (await getDeliverable(principal, id)) as typeof deliverables.$inferSelect;
  if (current.status !== "DELIVERED" || !current.publishedAt) {
    throw new ForbiddenError("This work has not been marked as posted.");
  }
  const [updated] = await db
    .update(deliverables)
    .set({ status: "APPROVED", publishedAt: null, publishUrl: null })
    .where(and(eq(deliverables.id, id), eq(deliverables.agencyId, current.agencyId)))
    .returning();
  if (!updated) throw new NotFoundError();
  return stripInternalDeliverableFields(principal, updated);
}
