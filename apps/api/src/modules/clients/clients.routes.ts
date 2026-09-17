import { createClientSchema, updateClientSchema } from "@rexops/validators";
import { Elysia, t } from "elysia";
import { authGuard, requirePrincipal } from "../../plugins/auth-guard";
import {
  archiveClient,
  createClient,
  getClient,
  listClients,
  updateClient,
} from "./clients.service";

export const clientsRoutes = new Elysia({ prefix: "/api/clients" })
  .use(authGuard)
  .get("/", ({ principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return listClients(actor);
  })
  .post(
    "/",
    ({ body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return createClient(actor, createClientSchema.parse(body));
    },
    {
      body: t.Object({
        name: t.String({ minLength: 2 }),
        companyName: t.Optional(t.String()),
        email: t.Optional(t.String({ format: "email" })),
        phone: t.Optional(t.String()),
        website: t.Optional(t.String()),
        notes: t.Optional(t.String()),
        portalSlug: t.Optional(t.String()),
      }),
    },
  )
  .get("/:id", ({ params, principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return getClient(actor, params.id);
  })
  .patch(
    "/:id",
    ({ params, body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return updateClient(actor, params.id, updateClientSchema.parse(body));
    },
    {
      body: t.Object({
        name: t.Optional(t.String({ minLength: 2 })),
        companyName: t.Optional(t.String()),
        email: t.Optional(t.String({ format: "email" })),
        phone: t.Optional(t.String()),
        website: t.Optional(t.String()),
        notes: t.Optional(t.String()),
        portalSlug: t.Optional(t.String()),
        status: t.Optional(
          t.Union([t.Literal("ACTIVE"), t.Literal("INACTIVE"), t.Literal("ARCHIVED")]),
        ),
      }),
    },
  )
  .post("/:id/archive", ({ params, principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return archiveClient(actor, params.id);
  });
