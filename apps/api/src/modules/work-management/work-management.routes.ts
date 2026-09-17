import {
  checklistItemSchema,
  checklistSchema,
  customFieldDefinitionSchema,
  dependencySchema,
  savedViewSchema,
  taskSchema,
} from "@rexops/validators";
import { Elysia, t } from "elysia";
import { authGuard, requirePrincipal } from "../../plugins/auth-guard";
import {
  addChecklistItem,
  addPlacement,
  createChecklist,
  createDependency,
  createFieldDefinition,
  createSavedView,
  createTask,
  deleteSavedView,
  listChecklistAndTasks,
  listFieldDefinitions,
  listSavedViews,
  listWork,
  rescheduleWithDependents,
  setFieldValue,
  toggleChecklistItem,
} from "./work-management.service";

export const workManagementRoutes = new Elysia({ prefix: "/api/work" })
  .use(authGuard)
  .get("/", ({ query, principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return listWork(actor, query.projectId);
  })
  .get("/views", ({ principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return listSavedViews(actor);
  })
  .post(
    "/views",
    ({ body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return createSavedView(actor, savedViewSchema.parse(body));
    },
    {
      body: t.Object({
        scope: t.Union([t.Literal("PROJECT"), t.Literal("GLOBAL"), t.Literal("MY_WORK")]),
        scopeId: t.Optional(t.String({ minLength: 1 })),
        name: t.String({ minLength: 1, maxLength: 120 }),
        viewType: t.Union([
          t.Literal("BOARD"),
          t.Literal("LIST"),
          t.Literal("CALENDAR"),
          t.Literal("TIMELINE"),
        ]),
        filterJson: t.Optional(t.Record(t.String(), t.Unknown())),
        sortJson: t.Optional(t.Record(t.String(), t.Unknown())),
        groupBy: t.Optional(t.String({ maxLength: 120 })),
        visibleFieldIds: t.Optional(t.Array(t.String(), { maxItems: 100 })),
        isShared: t.Optional(t.Boolean()),
      }),
    },
  )
  .delete("/views/:id", ({ params, principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return deleteSavedView(actor, params.id);
  })
  .get("/fields/:scope", ({ params, principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    const scope = params.scope === "PROJECT" ? "PROJECT" : "DELIVERABLE";
    return listFieldDefinitions(actor, scope);
  })
  .post(
    "/fields",
    ({ body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return createFieldDefinition(actor, customFieldDefinitionSchema.parse(body));
    },
    {
      body: t.Object({
        scope: t.Union([t.Literal("DELIVERABLE"), t.Literal("PROJECT")]),
        key: t.String({ minLength: 1, maxLength: 80 }),
        label: t.String({ minLength: 1, maxLength: 120 }),
        type: t.Union([
          t.Literal("TEXT"),
          t.Literal("NUMBER"),
          t.Literal("SINGLE_SELECT"),
          t.Literal("MULTI_SELECT"),
          t.Literal("DATE"),
          t.Literal("BOOLEAN"),
          t.Literal("RATING"),
        ]),
        options: t.Optional(t.Array(t.String({ minLength: 1, maxLength: 100 }), { maxItems: 100 })),
        groupable: t.Optional(t.Boolean()),
        filterable: t.Optional(t.Boolean()),
        sortable: t.Optional(t.Boolean()),
        visibility: t.Optional(t.Union([t.Literal("INTERNAL"), t.Literal("CLIENT")])),
      }),
    },
  )
  .put(
    "/fields/:fieldDefId/entities/:entityId",
    ({ params, body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return setFieldValue(actor, params.fieldDefId, params.entityId, body.value);
    },
    { body: t.Object({ value: t.Unknown() }) },
  )
  .post(
    "/dependencies",
    ({ body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return createDependency(actor, dependencySchema.parse(body));
    },
    {
      body: t.Object({
        fromDeliverableId: t.String({ minLength: 1 }),
        toDeliverableId: t.String({ minLength: 1 }),
        type: t.Optional(
          t.Union([t.Literal("FS"), t.Literal("SS"), t.Literal("FF"), t.Literal("SF")]),
        ),
      }),
    },
  )
  .post(
    "/deliverables/:deliverableId/reschedule",
    ({ params, body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return rescheduleWithDependents(actor, params.deliverableId, body.dueDate);
    },
    { body: t.Object({ dueDate: t.Date() }) },
  )
  .post(
    "/deliverables/:deliverableId/placements",
    ({ params, body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return addPlacement(actor, params.deliverableId, body.projectId);
    },
    { body: t.Object({ projectId: t.String({ minLength: 1 }) }) },
  )
  .get("/deliverables/:deliverableId/details", ({ params, principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return listChecklistAndTasks(actor, params.deliverableId);
  })
  .post(
    "/deliverables/:deliverableId/checklists",
    ({ params, body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return createChecklist(actor, params.deliverableId, checklistSchema.parse(body));
    },
    { body: t.Object({ title: t.String({ minLength: 1, maxLength: 200 }) }) },
  )
  .post(
    "/checklists/:checklistId/items",
    ({ params, body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return addChecklistItem(actor, params.checklistId, checklistItemSchema.parse(body));
    },
    {
      body: t.Object({
        text: t.String({ minLength: 1, maxLength: 500 }),
        assignedToUserId: t.Optional(t.String({ minLength: 1 })),
        dueDate: t.Optional(t.Date()),
      }),
    },
  )
  .patch(
    "/checklist-items/:itemId",
    ({ params, body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return toggleChecklistItem(actor, params.itemId, body.done);
    },
    { body: t.Object({ done: t.Boolean() }) },
  )
  .post(
    "/deliverables/:deliverableId/tasks",
    ({ params, body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return createTask(actor, params.deliverableId, taskSchema.parse(body));
    },
    {
      body: t.Object({
        title: t.String({ minLength: 1, maxLength: 240 }),
        assignedToUserId: t.Optional(t.String({ minLength: 1 })),
        dueDate: t.Optional(t.Date()),
        parentTaskId: t.Optional(t.String({ minLength: 1 })),
      }),
    },
  );
