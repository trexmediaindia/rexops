import { featureRegistry } from "@rexops/core";
import { Elysia } from "elysia";
import { authGuard, requirePrincipal } from "../../plugins/auth-guard";

export const featuresRoutes = new Elysia({ prefix: "/api/features" })
  .use(authGuard)
  .get("/", ({ principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return featureRegistry();
  });
