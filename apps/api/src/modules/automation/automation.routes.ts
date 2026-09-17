import {
  automationRuleSchema,
  intakeFormSchema,
  intakeSubmissionSchema,
  recurringScheduleSchema,
  templatePackSchema,
} from "@rexops/validators";
import { Elysia, t } from "elysia";
import { authGuard, requirePrincipal } from "../../plugins/auth-guard";
import {
  applyTemplatePack,
  createIntakeForm,
  createRecurringSchedule,
  createRule,
  createTemplatePack,
  executeButtonRule,
  getPublicIntakeForm,
  listIntakeSubmissions,
  listRules,
  submitIntake,
  updateRule,
} from "./automation.service";

const action = t.Object({
  type: t.Union([
    t.Literal("UPDATE_STATUS"),
    t.Literal("ASSIGN"),
    t.Literal("NOTIFY"),
    t.Literal("SET_FIELD"),
    t.Literal("CREATE_TASK"),
    t.Literal("HTTP_REQUEST"),
  ]),
  config: t.Optional(t.Record(t.String(), t.Unknown())),
});

export const automationRoutes = new Elysia({ prefix: "/api/automation" })
  .use(authGuard)
  .get("/rules", ({ principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return listRules(actor);
  })
  .post(
    "/rules",
    ({ body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return createRule(actor, automationRuleSchema.parse(body));
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 160 }),
        kind: t.Union([
          t.Literal("RULE"),
          t.Literal("CARD_BUTTON"),
          t.Literal("BOARD_BUTTON"),
          t.Literal("SCHEDULED"),
          t.Literal("DUE_DATE"),
        ]),
        enabled: t.Optional(t.Boolean()),
        scope: t.Union([t.Literal("PROJECT"), t.Literal("AGENCY")]),
        scopeId: t.Optional(t.String({ minLength: 1 })),
        trigger: t.Object({ event: t.String({ minLength: 1, maxLength: 120 }) }),
        conditions: t.Optional(t.Record(t.String(), t.Unknown())),
        actions: t.Array(action, { minItems: 1, maxItems: 20 }),
      }),
    },
  )
  .patch(
    "/rules/:id",
    ({ params, body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return updateRule(actor, params.id, {
        ...body,
        conditions: body.conditions as Record<string, unknown> | undefined,
        actions: body.actions?.map((item) => ({
          ...item,
          config: (item.config as Record<string, unknown> | undefined) ?? {},
        })),
      });
    },
    {
      body: t.Partial(
        t.Object({
          name: t.String({ minLength: 1, maxLength: 160 }),
          enabled: t.Boolean(),
          conditions: t.Record(t.String(), t.Unknown()),
          actions: t.Array(action, { minItems: 1, maxItems: 20 }),
        }),
      ),
    },
  )
  .post(
    "/rules/:id/execute",
    ({ params, body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return executeButtonRule(actor, params.id, body.context);
    },
    { body: t.Object({ context: t.Record(t.String(), t.Unknown()) }) },
  )
  .post(
    "/intake-forms",
    ({ body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return createIntakeForm(actor, intakeFormSchema.parse(body));
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 160 }),
        slug: t.String({ minLength: 1, maxLength: 100 }),
        targetConfig: t.Optional(t.Record(t.String(), t.Unknown())),
        fields: t.Array(
          t.Object({
            key: t.String({ minLength: 1, maxLength: 80 }),
            label: t.String({ minLength: 1, maxLength: 160 }),
            type: t.Union([
              t.Literal("TEXT"),
              t.Literal("NUMBER"),
              t.Literal("SINGLE_SELECT"),
              t.Literal("MULTI_SELECT"),
              t.Literal("DATE"),
              t.Literal("BOOLEAN"),
              t.Literal("RATING"),
            ]),
            required: t.Optional(t.Boolean()),
            branchingJson: t.Optional(t.Record(t.String(), t.Unknown())),
            mapToField: t.Optional(t.String({ maxLength: 100 })),
          }),
          { minItems: 1, maxItems: 100 },
        ),
      }),
    },
  )
  .get("/intake-submissions", ({ principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return listIntakeSubmissions(actor);
  })
  .post(
    "/template-packs",
    ({ body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return createTemplatePack(actor, templatePackSchema.parse(body));
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 160 }),
        description: t.Optional(t.String({ maxLength: 2000 })),
        payload: t.Object({
          project: t.Object({
            name: t.String({ minLength: 1 }),
            type: t.Optional(t.String()),
          }),
          deliverables: t.Optional(
            t.Array(
              t.Object({
                title: t.String({ minLength: 1 }),
                contentType: t.Optional(
                  t.Union([t.Literal("MOTION"), t.Literal("STATIC"), t.Literal("OTHER")]),
                ),
                priority: t.Optional(
                  t.Union([
                    t.Literal("LOW"),
                    t.Literal("MEDIUM"),
                    t.Literal("HIGH"),
                    t.Literal("URGENT"),
                  ]),
                ),
              }),
              { maxItems: 100 },
            ),
          ),
        }),
      }),
    },
  )
  .post(
    "/template-packs/:id/apply",
    ({ params, body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return applyTemplatePack(actor, params.id, body);
    },
    {
      body: t.Object({
        clientId: t.String({ minLength: 1 }),
        startDate: t.Optional(t.Date()),
      }),
    },
  )
  .post(
    "/recurring-schedules",
    ({ body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return createRecurringSchedule(actor, recurringScheduleSchema.parse(body));
    },
    {
      body: t.Object({
        scope: t.Union([t.Literal("PROJECT"), t.Literal("DELIVERABLE")]),
        templatePackId: t.String({ minLength: 1 }),
        sourceProjectId: t.Optional(t.String({ minLength: 1 })),
        cadence: t.Union([t.Literal("DAILY"), t.Literal("WEEKLY"), t.Literal("MONTHLY")]),
        mode: t.Optional(t.Union([t.Literal("TIME_DRIVEN"), t.Literal("COMPLETION_DRIVEN")])),
        nextRunAt: t.Optional(t.Date()),
        enabled: t.Optional(t.Boolean()),
      }),
    },
  );

export const publicIntakeRoutes = new Elysia({ prefix: "/api/public/intake" })
  .get("/:slug", ({ params }) => getPublicIntakeForm(params.slug))
  .post(
    "/:slug",
    ({ params, body }) => submitIntake(params.slug, intakeSubmissionSchema.parse(body).answers),
    { body: t.Object({ answers: t.Record(t.String(), t.Unknown()) }) },
  );
