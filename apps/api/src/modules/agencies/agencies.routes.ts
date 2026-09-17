import { createAgencySchema, updateAgencySchema } from "@rexops/validators";
import { Elysia, t } from "elysia";
import { authGuard, requirePrincipal } from "../../plugins/auth-guard";
import { createAgency, getAgency, listAgencies, updateAgency } from "./agencies.service";

export const agenciesRoutes = new Elysia({ prefix: "/api/agencies" })
  .use(authGuard)
  .get("/", ({ principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return listAgencies(actor);
  })
  .post(
    "/",
    async ({ body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return createAgency(actor, createAgencySchema.parse(body));
    },
    {
      body: t.Object({
        name: t.String({ minLength: 2 }),
        slug: t.String({ minLength: 2 }),
        owner: t.Object({
          name: t.String({ minLength: 2 }),
          email: t.String({ format: "email" }),
        }),
      }),
    },
  )
  .get("/:id", ({ params, principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return getAgency(actor, params.id);
  })
  .patch(
    "/:id",
    ({ params, body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return updateAgency(actor, params.id, updateAgencySchema.parse(body));
    },
    {
      body: t.Object({
        name: t.Optional(t.String({ minLength: 2 })),
        slug: t.Optional(t.String({ minLength: 2 })),
        logoUrl: t.Optional(t.Nullable(t.String())),
        brandColor: t.Optional(t.Nullable(t.String())),
      }),
    },
  );
