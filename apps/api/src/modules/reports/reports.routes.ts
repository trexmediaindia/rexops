import { createAdReportSchema } from "@rexops/validators";
import { Elysia, t } from "elysia";
import { authGuard, requirePrincipal } from "../../plugins/auth-guard";
import { createAdReport, deleteAdReport, listAdReports } from "./reports.service";

const count = t.Optional(t.Union([t.Number(), t.String()]));

export const reportsRoutes = new Elysia({ prefix: "/api" })
  .use(authGuard)
  .get("/projects/:id/reports", ({ params, principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return listAdReports(actor, params.id);
  })
  .post(
    "/projects/:id/reports",
    ({ params, body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return createAdReport(actor, params.id, createAdReportSchema.parse(body));
    },
    {
      body: t.Object({
        platform: t.Optional(t.Union([t.Literal("META"), t.Literal("GOOGLE"), t.Literal("OTHER")])),
        periodStart: t.String(),
        periodEnd: t.String(),
        currency: t.Optional(t.String()),
        spend: count,
        impressions: count,
        reach: count,
        clicks: count,
        leads: count,
        conversions: count,
        revenue: count,
        summary: t.Optional(t.String()),
        attachmentId: t.Optional(t.String()),
      }),
    },
  )
  .delete("/reports/:reportId", ({ params, principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return deleteAdReport(actor, params.reportId);
  });
