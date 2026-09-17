import { Elysia, t } from "elysia";
import { authGuard, requirePrincipal } from "../../plugins/auth-guard";
import {
  analyticsOverview,
  getAgencyAppearance,
  listAuditLog,
  updateAgencyAppearance,
} from "./analytics.service";

export const analyticsRoutes = new Elysia({ prefix: "/api/analytics" })
  .use(authGuard)
  .get("/overview", ({ principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return analyticsOverview(actor);
  })
  .get("/audit-log", ({ principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return listAuditLog(actor);
  })
  .get("/appearance", ({ principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return getAgencyAppearance(actor);
  })
  .patch(
    "/appearance",
    ({ body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return updateAgencyAppearance(actor, body);
    },
    {
      body: t.Object({
        logoUrl: t.Optional(t.String({ format: "uri" })),
        brandColor: t.Optional(t.String({ pattern: "^#[0-9a-fA-F]{6}$" })),
        dashboardCards: t.Optional(t.Array(t.String({ minLength: 1 }), { maxItems: 20 })),
      }),
    },
  );
