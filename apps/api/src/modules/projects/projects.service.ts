import type { Principal } from "@rexops/core";
import {
  assertClientRecordAccess,
  assertWritablePrincipal,
  can,
  ForbiddenError,
  NotFoundError,
} from "@rexops/core";
import { clients, db, outbox, projectMembers, projects } from "@rexops/db";
import type { CreateProjectInput, UpdateProjectInput } from "@rexops/validators";
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

export async function listProjects(principal: Principal) {
  if (principal.role === "SUPER_ADMIN")
    return db.select().from(projects).where(isNull(projects.deletedAt));
  if (!principal.agencyId) return [];

  const base = [eq(projects.agencyId, principal.agencyId), isNull(projects.deletedAt)];
  if (principal.role.startsWith("CLIENT_")) {
    if (!principal.clientId) return [];
    return db
      .select()
      .from(projects)
      .where(and(...base, eq(projects.clientId, principal.clientId)));
  }

  const ids = await visibleProjectIds(principal);
  if (ids && ids.length === 0) return [];
  return db
    .select()
    .from(projects)
    .where(and(...base, ...(ids ? [inArray(projects.id, ids)] : [])));
}

export async function getProject(principal: Principal, id: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
    .limit(1);
  if (!project) throw new NotFoundError();
  assertClientRecordAccess(principal, project);

  const ids = await visibleProjectIds(principal);
  if (ids && !ids.includes(project.id)) throw new NotFoundError();
  return project;
}

export async function createProject(principal: Principal, input: CreateProjectInput) {
  if (!can(principal, "create", "project") || !principal.agencyId) throw new ForbiddenError();
  assertWritablePrincipal(principal);

  const [client] = await db
    .select()
    .from(clients)
    .where(
      and(
        eq(clients.id, input.clientId),
        eq(clients.agencyId, principal.agencyId),
        isNull(clients.deletedAt),
      ),
    )
    .limit(1);
  if (!client) throw new NotFoundError();

  if (input.parentProjectId) {
    const parent = await getProject(principal, input.parentProjectId);
    if (parent.parentProjectId || parent.clientId !== input.clientId) {
      throw new ForbiddenError("Sub-projects may only nest one level under the same client.");
    }
  }

  return db.transaction(async (tx) => {
    const [project] = await tx
      .insert(projects)
      .values({
        agencyId: principal.agencyId ?? "",
        clientId: input.clientId,
        parentProjectId: input.parentProjectId,
        name: input.name,
        description: input.description,
        brief: input.brief,
        type: input.type,
        priority: input.priority,
        startDate: input.startDate,
        dueDate: input.dueDate,
        createdByUserId: principal.userId,
      })
      .returning();
    if (!project) throw new Error("Project insert failed.");

    const memberIds = new Set([principal.userId, ...input.memberIds]);
    await tx.insert(projectMembers).values(
      [...memberIds].map((userId) => ({
        agencyId: project.agencyId,
        projectId: project.id,
        userId,
      })),
    );
    await tx.insert(outbox).values({
      agencyId: project.agencyId,
      eventType: "PROJECT_CREATED",
      payload: { projectId: project.id, clientId: project.clientId },
    });
    return project;
  });
}

export async function updateProject(principal: Principal, id: string, input: UpdateProjectInput) {
  if (!can(principal, "update", "project")) throw new ForbiddenError();
  assertWritablePrincipal(principal);
  const existing = await getProject(principal, id);
  const [project] = await db
    .update(projects)
    .set(input)
    .where(and(eq(projects.id, id), eq(projects.agencyId, existing.agencyId)))
    .returning();
  if (!project) throw new NotFoundError();
  return project;
}
