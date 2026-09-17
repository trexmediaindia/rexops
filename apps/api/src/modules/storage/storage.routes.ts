import { Elysia, t } from "elysia";
import { authGuard, requirePrincipal } from "../../plugins/auth-guard";
import { getStorageUsage, setStorageQuota } from "./storage.service";

export const storageRoutes = new Elysia({ prefix: "/api/storage" })
  .use(authGuard)
  .get("/", ({ principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return getStorageUsage(actor);
  })
  .patch(
    "/",
    ({ body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return setStorageQuota(actor, body.quotaBytes);
    },
    { body: t.Object({ quotaBytes: t.Number({ minimum: 1 }) }) },
  );
