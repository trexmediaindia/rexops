import { Elysia, t } from "elysia";
import { authGuard, requirePrincipal } from "../../plugins/auth-guard";
import { listRevisionTasks, updateRevisionTask } from "./reviews.service";

export const reviewTaskRoutes = new Elysia({ prefix: "/api/work" })
  .use(authGuard)
  .get("/deliverables/:deliverableId/tasks", ({ params, principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return listRevisionTasks(actor, params.deliverableId);
  })
  .patch(
    "/tasks/:taskId",
    ({ params, body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return updateRevisionTask(actor, params.taskId, body);
    },
    {
      body: t.Object({
        status: t.Optional(
          t.Union([
            t.Literal("TODO"),
            t.Literal("IN_PROGRESS"),
            t.Literal("BLOCKED"),
            t.Literal("DONE"),
          ]),
        ),
        assignedToUserId: t.Optional(t.Nullable(t.String({ minLength: 1 }))),
        dueDate: t.Optional(t.Nullable(t.Date())),
      }),
    },
  );
