import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Principal } from "@rexops/core";
import { agencies, auditLogs, clients, db, deliverables, projects, users } from "@rexops/db";
import { eq } from "drizzle-orm";
import { apiRequest, ensureTestFixtures, principals, responseJson } from "../../test/helpers";

const agencyId = "agency_analytics_test";
const userId = "user_analytics_test";
const clientId = "client_analytics_test";
const projectId = "project_analytics_test";
const deliverableId = "deliverable_analytics_test";
const auditId = "audit_analytics_test";
const analyticsPrincipal = {
  ...principals.owner,
  userId,
  agencyId,
} satisfies Principal;

beforeAll(async () => {
  await ensureTestFixtures();
  await db
    .insert(agencies)
    .values({ id: agencyId, name: "Analytics Agency", slug: "analytics-agency-test" })
    .onConflictDoNothing();
  await db
    .insert(users)
    .values({
      id: userId,
      name: "Analytics Owner",
      email: "analytics-owner@rexops.test",
      role: "AGENCY_OWNER",
      agencyId,
      permissions: analyticsPrincipal.permissions,
    })
    .onConflictDoNothing();
  await db
    .insert(clients)
    .values({
      id: clientId,
      agencyId,
      name: "Analytics Client",
      createdByUserId: userId,
    })
    .onConflictDoNothing();
  await db
    .insert(projects)
    .values({
      id: projectId,
      agencyId,
      clientId,
      name: "Analytics Project",
      createdByUserId: userId,
    })
    .onConflictDoNothing();
  await db
    .insert(deliverables)
    .values({
      id: deliverableId,
      agencyId,
      clientId,
      projectId,
      title: "Analytics Test",
      status: "APPROVED",
      assignedToUserId: userId,
      submittedAt: new Date("2026-06-20T00:00:00.000Z"),
      approvedAt: new Date("2026-06-20T12:00:00.000Z"),
      dueDate: new Date("2026-06-21T00:00:00.000Z"),
      createdByUserId: userId,
    })
    .onConflictDoNothing();
  await db
    .insert(auditLogs)
    .values({
      id: auditId,
      agencyId,
      actorUserId: userId,
      action: "ANALYTICS_TEST",
      targetType: "DELIVERABLE",
      targetId: deliverableId,
    })
    .onConflictDoNothing();
});

afterAll(async () => {
  await db.delete(auditLogs).where(eq(auditLogs.id, auditId));
  await db.delete(deliverables).where(eq(deliverables.id, deliverableId));
  await db.delete(projects).where(eq(projects.id, projectId));
  await db.delete(clients).where(eq(clients.id, clientId));
  await db.delete(users).where(eq(users.id, userId));
  await db.delete(agencies).where(eq(agencies.id, agencyId));
});

describe("analytics and platform polish", () => {
  test("calculates turnaround, on-time delivery, workload, and portfolio health", async () => {
    const response = await apiRequest("/api/analytics/overview", {
      principal: analyticsPrincipal,
    });
    expect(response.status).toBe(200);
    const overview = await responseJson(response);
    const metrics = overview.metrics as {
      averageTurnaroundHours: number;
      onTimePercent: number;
    };
    expect(metrics.averageTurnaroundHours).toBeGreaterThanOrEqual(12);
    expect(metrics.onTimePercent).toBeGreaterThan(0);
    expect(overview.workload as unknown[]).not.toHaveLength(0);
    expect(overview.portfolio as unknown[]).not.toHaveLength(0);
  });

  test("keeps analytics agency-only and audit records tenant scoped", async () => {
    const denied = await apiRequest("/api/analytics/overview", {
      principal: principals.clientOwner,
    });
    expect(denied.status).toBe(403);

    const audit = await apiRequest("/api/analytics/audit-log", {
      principal: analyticsPrincipal,
    });
    expect(
      ((await audit.json()) as Array<{ log: { id: string } }>).some(
        (row) => row.log.id === auditId,
      ),
    ).toBe(true);
  });

  test("persists white-label groundwork and editable dashboard cards", async () => {
    const updated = await apiRequest("/api/analytics/appearance", {
      method: "PATCH",
      principal: analyticsPrincipal,
      body: {
        logoUrl: "https://assets.example.com/trex.svg",
        brandColor: "#F2A341",
        dashboardCards: ["active", "turnaround", "portfolio"],
      },
    });
    expect(updated.status).toBe(200);
    const appearance = await apiRequest("/api/analytics/appearance", {
      principal: analyticsPrincipal,
    });
    const body = await responseJson(appearance);
    expect(body.brandColor).toBe("#F2A341");
    expect((body.settings as { dashboardCards: string[] }).dashboardCards).toContain("turnaround");
  });
});
