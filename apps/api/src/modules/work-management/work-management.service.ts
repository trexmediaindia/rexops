import type { Principal } from "@rexops/core";
import {
  assertWritablePrincipal,
  ForbiddenError,
  NotFoundError,
  validateFieldValue,
} from "@rexops/core";
import {
  checklistItems,
  checklists,
  customFieldDefs,
  customFieldValues,
  db,
  deliverablePlacements,
  deliverables,
  dependencies,
  savedViews,
  tasks,
  users,
} from "@rexops/db";
import type {
  ChecklistInput,
  ChecklistItemInput,
  DependencyInput,
  FieldDefinitionInput,
  SavedViewInput,
  TaskInput,
} from "@rexops/validators";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { getDeliverable, listDeliverables } from "../deliverables/deliverables.service";
import { getProject } from "../projects/projects.service";

function requireAgency(principal: Principal) {
  if (!principal.agencyId) throw new ForbiddenError();
  return principal.agencyId;
}

export async function listWork(principal: Principal, projectId?: string) {
  const visible = (await listDeliverables(principal)) as Array<typeof deliverables.$inferSelect>;
  let rows = visible;
  if (projectId) {
    await getProject(principal, projectId);
    const placements = await db
      .select({ deliverableId: deliverablePlacements.deliverableId })
      .from(deliverablePlacements)
      .where(eq(deliverablePlacements.projectId, projectId));
    const placedIds = new Set(placements.map((placement) => placement.deliverableId));
    rows = rows.filter(
      (deliverable) => deliverable.projectId === projectId || placedIds.has(deliverable.id),
    );
  }
  if (!rows.length) return [];
  const ids = rows.map((deliverable) => deliverable.id);
  const [values, incoming] = await Promise.all([
    db
      .select({
        entityId: customFieldValues.entityId,
        fieldDefId: customFieldValues.fieldDefId,
        value: customFieldValues.value,
      })
      .from(customFieldValues)
      .where(
        and(
          eq(customFieldValues.entityType, "DELIVERABLE"),
          inArray(customFieldValues.entityId, ids),
        ),
      ),
    db
      .select({
        toDeliverableId: dependencies.toDeliverableId,
        fromDeliverableId: dependencies.fromDeliverableId,
      })
      .from(dependencies)
      .where(inArray(dependencies.toDeliverableId, ids)),
  ]);
  const byId = new Map(rows.map((row) => [row.id, row]));
  return rows.map((deliverable) => ({
    ...deliverable,
    customFields: Object.fromEntries(
      values
        .filter((value) => value.entityId === deliverable.id)
        .map((value) => [value.fieldDefId, value.value]),
    ),
    blockedBy: incoming
      .filter((edge) => edge.toDeliverableId === deliverable.id)
      .filter((edge) => {
        const blocker = byId.get(edge.fromDeliverableId);
        return !blocker || !["APPROVED", "DELIVERED"].includes(blocker.status);
      })
      .map((edge) => edge.fromDeliverableId),
  }));
}

export async function listSavedViews(principal: Principal) {
  const agencyId = requireAgency(principal);
  return db
    .select()
    .from(savedViews)
    .where(
      and(
        eq(savedViews.agencyId, agencyId),
        or(eq(savedViews.ownerUserId, principal.userId), eq(savedViews.isShared, true)),
      ),
    )
    .orderBy(asc(savedViews.position));
}

export async function createSavedView(principal: Principal, input: SavedViewInput) {
  const agencyId = requireAgency(principal);
  assertWritablePrincipal(principal);
  if (input.scope === "PROJECT" && input.scopeId) await getProject(principal, input.scopeId);
  const [view] = await db
    .insert(savedViews)
    .values({ ...input, agencyId, ownerUserId: principal.userId })
    .returning();
  return view;
}

export async function deleteSavedView(principal: Principal, id: string) {
  assertWritablePrincipal(principal);
  const [removed] = await db
    .delete(savedViews)
    .where(
      and(
        eq(savedViews.id, id),
        eq(savedViews.agencyId, requireAgency(principal)),
        eq(savedViews.ownerUserId, principal.userId),
      ),
    )
    .returning({ id: savedViews.id });
  if (!removed) throw new NotFoundError();
  return { removed: true };
}

export async function listFieldDefinitions(principal: Principal, scope: "DELIVERABLE" | "PROJECT") {
  const agencyId = requireAgency(principal);
  const filters = [eq(customFieldDefs.agencyId, agencyId), eq(customFieldDefs.scope, scope)];
  if (principal.role.startsWith("CLIENT_")) filters.push(eq(customFieldDefs.visibility, "CLIENT"));
  return db
    .select()
    .from(customFieldDefs)
    .where(and(...filters))
    .orderBy(asc(customFieldDefs.position));
}

export async function createFieldDefinition(principal: Principal, input: FieldDefinitionInput) {
  if (!["AGENCY_OWNER", "AGENCY_ADMIN"].includes(principal.role)) throw new ForbiddenError();
  assertWritablePrincipal(principal);
  const [definition] = await db
    .insert(customFieldDefs)
    .values({
      ...input,
      agencyId: requireAgency(principal),
      options: input.options,
    })
    .returning();
  return definition;
}

export async function setFieldValue(
  principal: Principal,
  fieldDefId: string,
  entityId: string,
  value: unknown,
) {
  assertWritablePrincipal(principal);
  const agencyId = requireAgency(principal);
  const [definition] = await db
    .select()
    .from(customFieldDefs)
    .where(and(eq(customFieldDefs.id, fieldDefId), eq(customFieldDefs.agencyId, agencyId)))
    .limit(1);
  if (!definition) throw new NotFoundError();
  if (definition.scope === "DELIVERABLE") await getDeliverable(principal, entityId);
  else await getProject(principal, entityId);
  if (principal.role.startsWith("CLIENT_") && definition.visibility !== "CLIENT") {
    throw new NotFoundError();
  }
  if (
    !validateFieldValue(
      {
        type: definition.type,
        options: definition.options?.filter(
          (option): option is string => typeof option === "string",
        ),
      },
      value,
    )
  ) {
    throw new ForbiddenError("The value does not match the custom-field definition.");
  }
  const [stored] = await db
    .insert(customFieldValues)
    .values({
      agencyId,
      fieldDefId,
      entityType: definition.scope,
      entityId,
      value,
    })
    .onConflictDoUpdate({
      target: [
        customFieldValues.fieldDefId,
        customFieldValues.entityType,
        customFieldValues.entityId,
      ],
      set: { value },
    })
    .returning();
  return stored;
}

async function dependencyCreatesCycle(agencyId: string, fromId: string, toId: string) {
  const rows = await db
    .select({
      from: dependencies.fromDeliverableId,
      to: dependencies.toDeliverableId,
    })
    .from(dependencies)
    .where(eq(dependencies.agencyId, agencyId));
  const outgoing = new Map<string, string[]>();
  for (const row of rows) outgoing.set(row.from, [...(outgoing.get(row.from) ?? []), row.to]);
  const queue = [toId];
  const visited = new Set<string>();
  while (queue.length) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    if (current === fromId) return true;
    visited.add(current);
    queue.push(...(outgoing.get(current) ?? []));
  }
  return false;
}

export async function createDependency(principal: Principal, input: DependencyInput) {
  assertWritablePrincipal(principal);
  const agencyId = requireAgency(principal);
  if (input.fromDeliverableId === input.toDeliverableId) {
    throw new ForbiddenError("A deliverable cannot depend on itself.");
  }
  const [from, to] = await Promise.all([
    getDeliverable(principal, input.fromDeliverableId),
    getDeliverable(principal, input.toDeliverableId),
  ]);
  if (
    (from as { agencyId: string }).agencyId !== agencyId ||
    (to as { agencyId: string }).agencyId !== agencyId
  ) {
    throw new NotFoundError();
  }
  if (await dependencyCreatesCycle(agencyId, input.fromDeliverableId, input.toDeliverableId)) {
    throw new ForbiddenError("This dependency would create a cycle.");
  }
  const [dependency] = await db
    .insert(dependencies)
    .values({ ...input, agencyId })
    .returning();
  return dependency;
}

export async function rescheduleWithDependents(
  principal: Principal,
  deliverableId: string,
  newDueDate: Date,
) {
  assertWritablePrincipal(principal);
  const deliverable = await getDeliverable(principal, deliverableId);
  const currentDueDate = (deliverable as { dueDate: Date | null }).dueDate;
  const delta = currentDueDate ? newDueDate.getTime() - currentDueDate.getTime() : 0;
  const edges = await db
    .select()
    .from(dependencies)
    .where(eq(dependencies.agencyId, requireAgency(principal)));
  const shifted = new Set([deliverableId]);
  const queue = [deliverableId];
  while (queue.length) {
    const current = queue.shift();
    for (const edge of edges.filter((candidate) => candidate.fromDeliverableId === current)) {
      if (!shifted.has(edge.toDeliverableId)) {
        shifted.add(edge.toDeliverableId);
        queue.push(edge.toDeliverableId);
      }
    }
  }
  const rows = await db
    .select()
    .from(deliverables)
    .where(inArray(deliverables.id, [...shifted]));
  for (const row of rows) await getDeliverable(principal, row.id);
  await db.transaction(async (tx) => {
    for (const row of rows) {
      const dueDate =
        row.id === deliverableId
          ? newDueDate
          : row.dueDate && delta
            ? new Date(row.dueDate.getTime() + delta)
            : row.dueDate;
      await tx.update(deliverables).set({ dueDate }).where(eq(deliverables.id, row.id));
    }
  });
  return { shifted: [...shifted] };
}

export async function addPlacement(principal: Principal, deliverableId: string, projectId: string) {
  assertWritablePrincipal(principal);
  const [deliverable, project] = await Promise.all([
    getDeliverable(principal, deliverableId),
    getProject(principal, projectId),
  ]);
  if (
    (deliverable as { clientId: string }).clientId !== (project as { clientId: string }).clientId
  ) {
    throw new ForbiddenError("A placement must remain inside the same client.");
  }
  const [placement] = await db
    .insert(deliverablePlacements)
    .values({ agencyId: requireAgency(principal), deliverableId, projectId })
    .onConflictDoNothing()
    .returning();
  return placement ?? { deliverableId, projectId };
}

export async function createChecklist(
  principal: Principal,
  deliverableId: string,
  input: ChecklistInput,
) {
  assertWritablePrincipal(principal);
  await getDeliverable(principal, deliverableId);
  const [checklist] = await db
    .insert(checklists)
    .values({ agencyId: requireAgency(principal), deliverableId, title: input.title })
    .returning();
  return checklist;
}

export async function addChecklistItem(
  principal: Principal,
  checklistId: string,
  input: ChecklistItemInput,
) {
  assertWritablePrincipal(principal);
  const [checklist] = await db
    .select()
    .from(checklists)
    .where(and(eq(checklists.id, checklistId), eq(checklists.agencyId, requireAgency(principal))))
    .limit(1);
  if (!checklist) throw new NotFoundError();
  await getDeliverable(principal, checklist.deliverableId);
  if (input.assignedToUserId) {
    const [assignee] = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.id, input.assignedToUserId),
          eq(users.agencyId, checklist.agencyId),
          isNull(users.deletedAt),
        ),
      )
      .limit(1);
    if (!assignee) throw new NotFoundError();
  }
  const [item] = await db
    .insert(checklistItems)
    .values({ ...input, agencyId: checklist.agencyId, checklistId })
    .returning();
  return item;
}

export async function toggleChecklistItem(principal: Principal, itemId: string, done: boolean) {
  assertWritablePrincipal(principal);
  const [existing] = await db
    .select({
      deliverableId: checklists.deliverableId,
    })
    .from(checklistItems)
    .innerJoin(checklists, eq(checklists.id, checklistItems.checklistId))
    .where(
      and(eq(checklistItems.id, itemId), eq(checklistItems.agencyId, requireAgency(principal))),
    )
    .limit(1);
  if (!existing) throw new NotFoundError();
  await getDeliverable(principal, existing.deliverableId);
  const [item] = await db
    .update(checklistItems)
    .set({ done })
    .where(
      and(eq(checklistItems.id, itemId), eq(checklistItems.agencyId, requireAgency(principal))),
    )
    .returning();
  if (!item) throw new NotFoundError();
  return item;
}

export async function createTask(principal: Principal, deliverableId: string, input: TaskInput) {
  assertWritablePrincipal(principal);
  const deliverable = await getDeliverable(principal, deliverableId);
  if (input.assignedToUserId) {
    const [assignee] = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.id, input.assignedToUserId),
          eq(users.agencyId, requireAgency(principal)),
          isNull(users.deletedAt),
        ),
      )
      .limit(1);
    if (!assignee) throw new NotFoundError();
  }
  const [task] = await db
    .insert(tasks)
    .values({
      ...input,
      agencyId: requireAgency(principal),
      projectId: (deliverable as { projectId: string }).projectId,
      deliverableId,
      createdByUserId: principal.userId,
    })
    .returning();
  return task;
}

export async function listChecklistAndTasks(principal: Principal, deliverableId: string) {
  await getDeliverable(principal, deliverableId);
  const checklistRows = await db
    .select()
    .from(checklists)
    .where(eq(checklists.deliverableId, deliverableId))
    .orderBy(asc(checklists.position));
  const items = checklistRows.length
    ? await db
        .select()
        .from(checklistItems)
        .where(
          inArray(
            checklistItems.checklistId,
            checklistRows.map((row) => row.id),
          ),
        )
        .orderBy(asc(checklistItems.position))
    : [];
  const taskRows = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.deliverableId, deliverableId), isNull(tasks.deletedAt)))
    .orderBy(asc(tasks.position));
  return {
    checklists: checklistRows.map((checklist) => ({
      ...checklist,
      items: items.filter((item) => item.checklistId === checklist.id),
    })),
    tasks: taskRows,
  };
}
