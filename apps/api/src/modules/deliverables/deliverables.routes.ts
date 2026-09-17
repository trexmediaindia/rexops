import {
  createDeliverableSchema,
  transitionDeliverableSchema,
  updateDeliverableSchema,
} from "@rexops/validators";
import { Elysia, t } from "elysia";
import { authGuard, requirePrincipal } from "../../plugins/auth-guard";
import {
  createDeliverable,
  getDeliverable,
  listDeliverables,
  transitionDeliverable,
  updateDeliverable,
} from "./deliverables.service";

export const deliverablesRoutes = new Elysia({ prefix: "/api/deliverables" })
  .use(authGuard)
  .get("/", ({ principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return listDeliverables(actor);
  })
  .post(
    "/",
    ({ body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return createDeliverable(actor, createDeliverableSchema.parse(body));
    },
    {
      body: t.Object({
        projectId: t.String(),
        title: t.String({ minLength: 2 }),
        description: t.Optional(t.String()),
        contentType: t.Optional(
          t.Union([t.Literal("MOTION"), t.Literal("STATIC"), t.Literal("OTHER")]),
        ),
        priority: t.Optional(
          t.Union([t.Literal("LOW"), t.Literal("MEDIUM"), t.Literal("HIGH"), t.Literal("URGENT")]),
        ),
        assignedToUserId: t.Optional(t.String()),
        dueDate: t.Optional(t.Date()),
        agencyNote: t.Optional(t.String()),
        clientNote: t.Optional(t.String()),
      }),
    },
  )
  .get("/:id", ({ params, principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return getDeliverable(actor, params.id);
  })
  .patch(
    "/:id",
    ({ params, body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return updateDeliverable(actor, params.id, updateDeliverableSchema.parse(body));
    },
    {
      body: t.Object({
        title: t.Optional(t.String()),
        description: t.Optional(t.String()),
        contentType: t.Optional(
          t.Union([t.Literal("MOTION"), t.Literal("STATIC"), t.Literal("OTHER")]),
        ),
        priority: t.Optional(
          t.Union([t.Literal("LOW"), t.Literal("MEDIUM"), t.Literal("HIGH"), t.Literal("URGENT")]),
        ),
        assignedToUserId: t.Optional(t.String()),
        dueDate: t.Optional(t.Date()),
        agencyNote: t.Optional(t.String()),
        clientNote: t.Optional(t.String()),
      }),
    },
  )
  .post(
    "/:id/transition",
    ({ params, body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return transitionDeliverable(actor, params.id, transitionDeliverableSchema.parse(body));
    },
    {
      body: t.Object({
        to: t.Union([
          t.Literal("PENDING"),
          t.Literal("IN_PROGRESS"),
          t.Literal("READY_FOR_INTERNAL_REVIEW"),
          t.Literal("UNDER_INTERNAL_REVIEW"),
          t.Literal("INTERNAL_APPROVED"),
          t.Literal("UNDER_CLIENT_REVIEW"),
          t.Literal("REVISION_REQUESTED"),
          t.Literal("APPROVED"),
          t.Literal("DELIVERED"),
          t.Literal("ARCHIVED"),
        ]),
      }),
    },
  );
