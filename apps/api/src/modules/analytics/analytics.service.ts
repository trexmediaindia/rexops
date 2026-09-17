import type { Principal } from "@rexops/core";
import { assertWritablePrincipal, ForbiddenError, NotFoundError } from "@rexops/core";
import {
  agencies,
  approvals,
  auditLogs,
  clients,
  db,
  type deliverables,
  projects,
  users,
} from "@rexops/db";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { listDeliverables } from "../deliverables/deliverables.service";

function requireAgencyAnalytics(principal: Principal) {
  if (!principal.agencyId || principal.role.startsWith("CLIENT_")) throw new ForbiddenError();
  return principal.agencyId;
}

export async function analyticsOverview(principal: Principal) {
  const agencyId = requireAgencyAnalytics(principal);
  const visible = (await listDeliverables(principal)) as Array<typeof deliverables.$inferSelect>;
  const ids = visible.map((deliverable) => deliverable.id);
  const approvalRows = ids.length
    ? await db.select().from(approvals).where(inArray(approvals.deliverableId, ids))
    : [];
  const now = new Date();
  const completed = visible.filter((item) => item.approvedAt && item.submittedAt);
  const averageTurnaroundHours = completed.length
    ? completed.reduce(
        (total, item) =>
          total +
          ((item.approvedAt?.getTime() ?? 0) - (item.submittedAt?.getTime() ?? 0)) / 3_600_000,
        0,
      ) / completed.length
    : 0;
  const resolvedWithDue = visible.filter(
    (item) => item.dueDate && (item.approvedAt || item.status === "DELIVERED"),
  );
  const onTime = resolvedWithDue.filter(
    (item) => (item.approvedAt?.getTime() ?? now.getTime()) <= (item.dueDate?.getTime() ?? 0),
  ).length;
  const revisionRounds = approvalRows.filter(
    (approval) => approval.decision === "REQUEST_CHANGES" || approval.decision === "REJECT",
  ).length;

  const memberRows = await db
    .select({ id: users.id, name: users.name, specialty: users.specialty })
    .from(users)
    .where(and(eq(users.agencyId, agencyId), isNull(users.deletedAt)));
  const workload = memberRows
    .map((member) => ({
      ...member,
      active: visible.filter(
        (item) =>
          item.assignedToUserId === member.id &&
          !["APPROVED", "DELIVERED", "ARCHIVED"].includes(item.status),
      ).length,
      dueSoon: visible.filter(
        (item) =>
          item.assignedToUserId === member.id &&
          item.dueDate &&
          item.dueDate > now &&
          item.dueDate.getTime() - now.getTime() < 7 * 24 * 60 * 60 * 1000,
      ).length,
    }))
    .sort((left, right) => right.active - left.active);

  const clientRows = await db
    .select()
    .from(clients)
    .where(and(eq(clients.agencyId, agencyId), isNull(clients.deletedAt)));
  const portfolio = clientRows.map((client) => {
    const clientWork = visible.filter((item) => item.clientId === client.id);
    const overdue = clientWork.filter(
      (item) =>
        item.dueDate &&
        item.dueDate < now &&
        !["APPROVED", "DELIVERED", "ARCHIVED"].includes(item.status),
    ).length;
    return {
      clientId: client.id,
      name: client.name,
      active: clientWork.filter(
        (item) => !["APPROVED", "DELIVERED", "ARCHIVED"].includes(item.status),
      ).length,
      waitingOnClient: clientWork.filter((item) => item.status === "UNDER_CLIENT_REVIEW").length,
      overdue,
      health: overdue > 2 ? "AT_RISK" : overdue > 0 ? "WATCH" : "HEALTHY",
    };
  });

  const projectRows = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.agencyId, agencyId), isNull(projects.deletedAt)));
  const burndown = projectRows.map((project) => {
    const projectWork = visible.filter((item) => item.projectId === project.id);
    return {
      projectId: project.id,
      name: project.name,
      total: projectWork.length,
      remaining: projectWork.filter(
        (item) => !["APPROVED", "DELIVERED", "ARCHIVED"].includes(item.status),
      ).length,
    };
  });

  return {
    metrics: {
      active: visible.filter((item) => !["APPROVED", "DELIVERED", "ARCHIVED"].includes(item.status))
        .length,
      waitingOnClient: visible.filter((item) => item.status === "UNDER_CLIENT_REVIEW").length,
      revisionRounds,
      averageTurnaroundHours: Math.round(averageTurnaroundHours * 10) / 10,
      onTimePercent: resolvedWithDue.length
        ? Math.round((onTime / resolvedWithDue.length) * 100)
        : 100,
      overdue: visible.filter(
        (item) =>
          item.dueDate &&
          item.dueDate < now &&
          !["APPROVED", "DELIVERED", "ARCHIVED"].includes(item.status),
      ).length,
    },
    statusBreakdown: Object.entries(
      visible.reduce<Record<string, number>>((counts, item) => {
        counts[item.status] = (counts[item.status] ?? 0) + 1;
        return counts;
      }, {}),
    ).map(([status, count]) => ({ status, count })),
    workload,
    portfolio,
    burndown,
  };
}

export async function listAuditLog(principal: Principal) {
  const filters = [];
  if (principal.role !== "SUPER_ADMIN") {
    filters.push(eq(auditLogs.agencyId, requireAgencyAnalytics(principal)));
    if (!["AGENCY_OWNER", "AGENCY_ADMIN"].includes(principal.role)) throw new ForbiddenError();
  }
  return db
    .select({
      log: auditLogs,
      actorName: users.name,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(250);
}

export async function getAgencyAppearance(principal: Principal) {
  const agencyId = requireAgencyAnalytics(principal);
  const [agency] = await db
    .select({
      id: agencies.id,
      name: agencies.name,
      slug: agencies.slug,
      logoUrl: agencies.logoUrl,
      brandColor: agencies.brandColor,
      settings: agencies.settings,
    })
    .from(agencies)
    .where(eq(agencies.id, agencyId))
    .limit(1);
  if (!agency) throw new NotFoundError();
  return agency;
}

export async function updateAgencyAppearance(
  principal: Principal,
  input: {
    logoUrl?: string;
    brandColor?: string;
    dashboardCards?: string[];
  },
) {
  if (!["AGENCY_OWNER", "AGENCY_ADMIN"].includes(principal.role)) throw new ForbiddenError();
  assertWritablePrincipal(principal);
  const current = await getAgencyAppearance(principal);
  const [updated] = await db
    .update(agencies)
    .set({
      logoUrl: input.logoUrl,
      brandColor: input.brandColor,
      settings: {
        ...current.settings,
        ...(input.dashboardCards ? { dashboardCards: input.dashboardCards } : {}),
      },
    })
    .where(eq(agencies.id, current.id))
    .returning();
  return updated;
}
