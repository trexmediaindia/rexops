import { Elysia, t } from "elysia";
import { authGuard, requirePrincipal } from "../../plugins/auth-guard";
import { getWorkspace, updateWorkspacePreferences } from "./workspace.service";

export const workspaceRoutes = new Elysia({ prefix: "/api/workspace" })
  .use(authGuard)
  .get("/", ({ principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return getWorkspace(actor);
  })
  .patch(
    "/preferences",
    ({ body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return updateWorkspacePreferences(actor, body);
    },
    {
      body: t.Object({
        defaultLanding: t.Optional(
          t.Union([t.Literal("dashboard"), t.Literal("work"), t.Literal("review")]),
        ),
        autoSendToClientOnInternalApproval: t.Optional(t.Boolean()),
        confirmBeforeArchiving: t.Optional(t.Boolean()),
        dueSoonWindowDays: t.Optional(t.Integer({ minimum: 1, maximum: 60 })),
        showSetupGuide: t.Optional(t.Boolean()),
        shareLinkExpiryDays: t.Optional(t.Integer({ minimum: 1, maximum: 365 })),
      }),
    },
  );
