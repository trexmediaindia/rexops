import { createProjectSchema, updateProjectSchema } from "@rexops/validators";
import { Elysia, t } from "elysia";
import { authGuard, requirePrincipal } from "../../plugins/auth-guard";
import { createProject, getProject, listProjects, updateProject } from "./projects.service";

const projectBody = t.Object({
  clientId: t.String({ minLength: 1 }),
  parentProjectId: t.Optional(t.String()),
  name: t.String({ minLength: 2 }),
  description: t.Optional(t.String()),
  brief: t.Optional(t.String()),
  type: t.Optional(t.String()),
  priority: t.Optional(
    t.Union([t.Literal("LOW"), t.Literal("MEDIUM"), t.Literal("HIGH"), t.Literal("URGENT")]),
  ),
  startDate: t.Optional(t.Date()),
  dueDate: t.Optional(t.Date()),
  memberIds: t.Optional(t.Array(t.String())),
});

export const projectsRoutes = new Elysia({ prefix: "/api/projects" })
  .use(authGuard)
  .get("/", ({ principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return listProjects(actor);
  })
  .post(
    "/",
    ({ body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return createProject(actor, createProjectSchema.parse(body));
    },
    { body: projectBody },
  )
  .post(
    "/:id/sub-projects",
    ({ params, body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return createProject(
        actor,
        createProjectSchema.parse({ ...body, parentProjectId: params.id }),
      );
    },
    { body: projectBody },
  )
  .get("/:id", ({ params, principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return getProject(actor, params.id);
  })
  .patch(
    "/:id",
    ({ params, body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return updateProject(actor, params.id, updateProjectSchema.parse(body));
    },
    {
      body: t.Object({
        name: t.Optional(t.String()),
        description: t.Optional(t.String()),
        brief: t.Optional(t.String()),
        type: t.Optional(t.String()),
        priority: t.Optional(
          t.Union([t.Literal("LOW"), t.Literal("MEDIUM"), t.Literal("HIGH"), t.Literal("URGENT")]),
        ),
        status: t.Optional(
          t.Union([
            t.Literal("DRAFT"),
            t.Literal("ACTIVE"),
            t.Literal("IN_PROGRESS"),
            t.Literal("WAITING_FOR_CLIENT"),
            t.Literal("COMPLETED"),
            t.Literal("ARCHIVED"),
          ]),
        ),
      }),
    },
  );
