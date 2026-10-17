import type { Principal } from "@rexops/core";
import { assertWritablePrincipal, can, ForbiddenError, NotFoundError } from "@rexops/core";
import { adReports, attachments, db } from "@rexops/db";
import type { CreateAdReportInput } from "@rexops/validators";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getProject } from "../projects/projects.service";

type ReportRow = typeof adReports.$inferSelect;

/** numeric columns come back from Postgres as strings; the screen wants numbers. */
function present(row: ReportRow) {
  return {
    ...row,
    spend: row.spend == null ? null : Number(row.spend),
    revenue: row.revenue == null ? null : Number(row.revenue),
  };
}

export async function listAdReports(principal: Principal, projectId: string) {
  const project = await getProject(principal, projectId);
  const rows = await db
    .select()
    .from(adReports)
    .where(
      and(
        eq(adReports.projectId, project.id),
        eq(adReports.agencyId, project.agencyId),
        isNull(adReports.deletedAt),
      ),
    )
    .orderBy(desc(adReports.periodStart), desc(adReports.createdAt));
  return rows.map(present);
}

export async function createAdReport(
  principal: Principal,
  projectId: string,
  input: CreateAdReportInput,
) {
  if (principal.role.startsWith("CLIENT_") || !can(principal, "update", "project")) {
    throw new ForbiddenError();
  }
  assertWritablePrincipal(principal);
  const project = await getProject(principal, projectId);
  if (project.service !== "ADS") {
    throw new ForbiddenError("Reports can only be added to an ads management project.");
  }

  return db.transaction(async (tx) => {
    if (input.attachmentId) {
      const [attachment] = await tx
        .select()
        .from(attachments)
        .where(eq(attachments.id, input.attachmentId))
        .limit(1);
      if (
        !attachment ||
        attachment.agencyId !== project.agencyId ||
        attachment.ownerUserId !== principal.userId ||
        attachment.status !== "READY" ||
        attachment.expiresAt <= new Date()
      ) {
        throw new NotFoundError("That report file could not be found. Upload it again.");
      }
    }
    const [report] = await tx
      .insert(adReports)
      .values({
        agencyId: project.agencyId,
        clientId: project.clientId,
        projectId: project.id,
        platform: input.platform,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        currency: input.currency,
        spend: input.spend == null ? null : String(input.spend),
        impressions: input.impressions,
        reach: input.reach,
        clicks: input.clicks,
        leads: input.leads,
        conversions: input.conversions,
        revenue: input.revenue == null ? null : String(input.revenue),
        summary: input.summary,
        attachmentId: input.attachmentId,
        createdByUserId: principal.userId,
      })
      .returning();
    if (!report) throw new Error("Report insert failed.");
    if (input.attachmentId) {
      await tx
        .update(attachments)
        .set({
          status: "CLAIMED",
          parentType: "AD_REPORT",
          parentId: report.id,
          claimedAt: new Date(),
        })
        .where(eq(attachments.id, input.attachmentId));
    }
    return present(report);
  });
}

export async function deleteAdReport(principal: Principal, reportId: string) {
  if (principal.role.startsWith("CLIENT_") || !can(principal, "update", "project")) {
    throw new ForbiddenError();
  }
  assertWritablePrincipal(principal);
  const report = await reportForPrincipal(principal, reportId);
  await db
    .update(adReports)
    .set({ deletedAt: new Date() })
    .where(and(eq(adReports.id, report.id), eq(adReports.agencyId, report.agencyId)));
  return { ok: true };
}

/** A report the principal may see, or 404 — the project's own access rules decide. */
export async function reportForPrincipal(principal: Principal, reportId: string) {
  const [report] = await db
    .select()
    .from(adReports)
    .where(and(eq(adReports.id, reportId), isNull(adReports.deletedAt)))
    .limit(1);
  if (!report) throw new NotFoundError();
  await getProject(principal, report.projectId);
  return report;
}
