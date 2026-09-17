import { createCommentSchema, reviewDecisionSchema } from "@rexops/validators";
import { Elysia, t } from "elysia";
import { authGuard, requirePrincipal } from "../../plugins/auth-guard";
import {
  commentToTask,
  configureReviewStage,
  createComment,
  createPipeline,
  decideReview,
  listApprovals,
  listComments,
  listPipelines,
  listReviewStages,
  listReviewUsers,
  promoteToClient,
  reactToComment,
  resolveComment,
  submitForInternalReview,
} from "./reviews.service";

const anchorType = t.Union([
  t.Literal("NONE"),
  t.Literal("TIMECODE"),
  t.Literal("REGION"),
  t.Literal("WAVEFORM_RANGE"),
]);

export const reviewsRoutes = new Elysia({ prefix: "/api/reviews" })
  .use(authGuard)
  .get("/pipelines", ({ principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return listPipelines(actor);
  })
  .get("/users", ({ principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return listReviewUsers(actor);
  })
  .post(
    "/pipelines",
    ({ body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return createPipeline(actor, {
        ...body,
        isDefault: body.isDefault ?? false,
        stages: body.stages.map((stage) => ({
          ...stage,
          approvers: stage.approvers.map((approver) => ({
            ...approver,
            required: approver.required ?? true,
          })),
        })),
      });
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 120 }),
        isDefault: t.Optional(t.Boolean()),
        stages: t.Array(
          t.Object({
            name: t.String({ minLength: 1, maxLength: 120 }),
            type: t.Union([t.Literal("INTERNAL"), t.Literal("CLIENT")]),
            mode: t.Union([t.Literal("SEQUENTIAL"), t.Literal("PARALLEL")]),
            requiredCount: t.Integer({ minimum: 1, maximum: 25 }),
            slaHours: t.Optional(t.Integer({ minimum: 1, maximum: 8760 })),
            escalateToUserId: t.Optional(t.String({ minLength: 1 })),
            approvers: t.Array(
              t.Object({
                userId: t.String({ minLength: 1 }),
                required: t.Optional(t.Boolean()),
              }),
              { maxItems: 25 },
            ),
          }),
          { minItems: 1, maxItems: 25 },
        ),
      }),
    },
  )
  .get("/deliverables/:deliverableId/stages", ({ params, principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return listReviewStages(actor, params.deliverableId);
  })
  .put(
    "/deliverables/:deliverableId/stages/:stageId",
    ({ params, body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return configureReviewStage(actor, params.deliverableId, params.stageId, body);
    },
    {
      body: t.Object({
        mode: t.Union([t.Literal("SEQUENTIAL"), t.Literal("PARALLEL")]),
        requiredCount: t.Integer({ minimum: 1, maximum: 25 }),
        approverUserIds: t.Array(t.String({ minLength: 1 }), { maxItems: 25 }),
      }),
    },
  )
  .post(
    "/deliverables/:deliverableId/submit-internal",
    ({ params, body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return submitForInternalReview(actor, params.deliverableId, body?.pipelineId);
    },
    { body: t.Optional(t.Object({ pipelineId: t.Optional(t.String({ minLength: 1 })) })) },
  )
  .post("/deliverables/:deliverableId/promote", ({ params, principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return promoteToClient(actor, params.deliverableId);
  })
  .post(
    "/deliverables/:deliverableId/decisions",
    ({ params, body, principal, set, request }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return decideReview(actor, params.deliverableId, {
        ...reviewDecisionSchema.parse(body),
        requestIp: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
        requestUserAgent: request.headers.get("user-agent") ?? undefined,
      });
    },
    {
      body: t.Object({
        fileVersionId: t.String({ minLength: 1 }),
        decision: t.Union([
          t.Literal("APPROVE"),
          t.Literal("REQUEST_CHANGES"),
          t.Literal("REJECT"),
        ]),
        feedback: t.Optional(t.String({ maxLength: 5000 })),
        eSignature: t.Optional(t.String({ minLength: 2, maxLength: 160 })),
        signatureConsentText: t.Optional(t.String({ minLength: 10, maxLength: 1000 })),
        signatureConsentVersion: t.Optional(t.String({ minLength: 1, maxLength: 50 })),
      }),
    },
  )
  .get("/deliverables/:deliverableId/approvals", ({ params, principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return listApprovals(actor, params.deliverableId);
  })
  .get("/deliverables/:deliverableId/comments", ({ params, query, principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return listComments(actor, params.deliverableId, {
      threaded: query.view === "threaded",
      cursor: query.cursor,
      limit: query.limit ? Number(query.limit) : undefined,
    });
  })
  .post(
    "/deliverables/:deliverableId/comments",
    ({ params, body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return createComment(actor, params.deliverableId, createCommentSchema.parse(body));
    },
    {
      body: t.Object({
        fileVersionId: t.Optional(t.String({ minLength: 1 })),
        parentId: t.Optional(t.String({ minLength: 1 })),
        message: t.String({ minLength: 1, maxLength: 5000 }),
        visibility: t.Optional(t.Union([t.Literal("INTERNAL"), t.Literal("CLIENT_VISIBLE")])),
        anchorType: t.Optional(anchorType),
        anchor: t.Optional(t.Record(t.String(), t.Unknown())),
        refVersionIds: t.Optional(t.Array(t.String({ minLength: 1 }), { maxItems: 20 })),
        attachmentIds: t.Optional(t.Array(t.String({ minLength: 1 }), { maxItems: 20 })),
        mentionUserIds: t.Optional(t.Array(t.String({ minLength: 1 }), { maxItems: 50 })),
      }),
    },
  )
  .post("/deliverables/:deliverableId/comments/:commentId/reopen", ({ params, principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return resolveComment(actor, params.deliverableId, params.commentId, true);
  })
  .post(
    "/deliverables/:deliverableId/comments/:commentId/reactions",
    ({ params, body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return reactToComment(actor, params.deliverableId, params.commentId, body.emoji);
    },
    { body: t.Object({ emoji: t.String({ minLength: 1, maxLength: 16 }) }) },
  )
  .delete(
    "/deliverables/:deliverableId/comments/:commentId/reactions/:emoji",
    ({ params, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return reactToComment(actor, params.deliverableId, params.commentId, params.emoji, true);
    },
  )
  .post(
    "/deliverables/:deliverableId/comments/:commentId/resolve",
    ({ params, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return resolveComment(actor, params.deliverableId, params.commentId);
    },
  )
  .post("/deliverables/:deliverableId/comments/:commentId/task", ({ params, principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return commentToTask(actor, params.deliverableId, params.commentId);
  });
