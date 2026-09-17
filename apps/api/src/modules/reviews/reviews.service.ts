import type { Principal } from "@rexops/core";
import {
  assertWritablePrincipal,
  can,
  ForbiddenError,
  NotFoundError,
  visibleComments,
} from "@rexops/core";
import {
  approvals,
  attachments,
  commentReactions,
  comments,
  db,
  deliverables,
  fileVersions,
  outbox,
  pipelineStageApprovers,
  pipelineStages,
  pipelines,
  reviewRuns,
  reviewStageApprovers,
  reviewStages,
  tasks,
  users,
} from "@rexops/db";
import type { CreateCommentInput, ReviewDecisionInput } from "@rexops/validators";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDeliverable } from "../deliverables/deliverables.service";

type StageType = "INTERNAL" | "CLIENT";

async function accessibleDeliverable(principal: Principal, deliverableId: string) {
  await getDeliverable(principal, deliverableId);
  const [deliverable] = await db
    .select()
    .from(deliverables)
    .where(and(eq(deliverables.id, deliverableId), isNull(deliverables.deletedAt)))
    .limit(1);
  if (!deliverable) throw new NotFoundError();
  return deliverable;
}

async function versionForDeliverable(deliverableId: string, versionId: string) {
  const [version] = await db
    .select()
    .from(fileVersions)
    .where(
      and(
        eq(fileVersions.id, versionId),
        eq(fileVersions.deliverableId, deliverableId),
        isNull(fileVersions.deletedAt),
      ),
    )
    .limit(1);
  if (!version) throw new NotFoundError();
  return version;
}

async function latestVersion(deliverableId: string) {
  const [version] = await db
    .select()
    .from(fileVersions)
    .where(and(eq(fileVersions.deliverableId, deliverableId), isNull(fileVersions.deletedAt)))
    .orderBy(desc(fileVersions.versionNumber))
    .limit(1);
  if (!version) throw new NotFoundError("Upload a version before starting review.");
  return version;
}

async function ensureDefaultPipeline(agencyId: string) {
  const [existing] = await db
    .select()
    .from(pipelines)
    .where(
      and(
        eq(pipelines.agencyId, agencyId),
        eq(pipelines.isDefault, true),
        isNull(pipelines.deletedAt),
      ),
    )
    .limit(1);
  if (existing) return existing;
  return db.transaction(async (tx) => {
    const [pipeline] = await tx
      .insert(pipelines)
      .values({ agencyId, name: "Default internal → client", isDefault: true })
      .returning();
    if (!pipeline) throw new Error("Pipeline insert failed.");
    await tx.insert(pipelineStages).values([
      {
        agencyId,
        pipelineId: pipeline.id,
        name: "Internal review",
        type: "INTERNAL",
        sequence: 1,
        requiresInternalApproval: true,
      },
      {
        agencyId,
        pipelineId: pipeline.id,
        name: "Client review",
        type: "CLIENT",
        sequence: 2,
        requiresClientApproval: true,
      },
    ]);
    return pipeline;
  });
}

export async function listPipelines(principal: Principal) {
  if (!principal.agencyId || principal.role.startsWith("CLIENT_")) throw new NotFoundError();
  const rows = await db
    .select()
    .from(pipelines)
    .where(and(eq(pipelines.agencyId, principal.agencyId), isNull(pipelines.deletedAt)))
    .orderBy(asc(pipelines.name));
  const ids = rows.map((pipeline) => pipeline.id);
  const stages = ids.length
    ? await db
        .select()
        .from(pipelineStages)
        .where(inArray(pipelineStages.pipelineId, ids))
        .orderBy(asc(pipelineStages.sequence))
    : [];
  const stageIds = stages.map((stage) => stage.id);
  const approvers = stageIds.length
    ? await db
        .select()
        .from(pipelineStageApprovers)
        .where(inArray(pipelineStageApprovers.pipelineStageId, stageIds))
        .orderBy(asc(pipelineStageApprovers.approverOrder))
    : [];
  return rows.map((pipeline) => ({
    ...pipeline,
    stages: stages
      .filter((stage) => stage.pipelineId === pipeline.id)
      .map((stage) => ({
        ...stage,
        approvers: approvers.filter((approver) => approver.pipelineStageId === stage.id),
      })),
  }));
}

export async function listReviewUsers(principal: Principal) {
  if (!principal.agencyId || principal.role.startsWith("CLIENT_")) throw new NotFoundError();
  return db
    .select({
      id: users.id,
      name: users.name,
      image: users.image,
      role: users.role,
      specialty: users.specialty,
    })
    .from(users)
    .where(and(eq(users.agencyId, principal.agencyId), isNull(users.deletedAt)))
    .orderBy(asc(users.name));
}

export async function createPipeline(
  principal: Principal,
  input: {
    name: string;
    isDefault: boolean;
    stages: Array<{
      name: string;
      type: StageType;
      mode: "SEQUENTIAL" | "PARALLEL";
      requiredCount: number;
      slaHours?: number;
      escalateToUserId?: string;
      approvers: Array<{ userId: string; required: boolean }>;
    }>;
  },
) {
  if (!principal.agencyId || !["AGENCY_OWNER", "AGENCY_ADMIN"].includes(principal.role)) {
    throw new ForbiddenError();
  }
  assertWritablePrincipal(principal);
  if (!input.stages.some((stage) => stage.type === "INTERNAL")) {
    throw new ForbiddenError("A pipeline requires an internal stage.");
  }
  const userIds = [
    ...new Set(
      input.stages.flatMap((stage) => [
        ...stage.approvers.map((approver) => approver.userId),
        ...(stage.escalateToUserId ? [stage.escalateToUserId] : []),
      ]),
    ),
  ];
  if (userIds.length) {
    const eligible = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.agencyId, principal.agencyId),
          inArray(users.id, userIds),
          isNull(users.deletedAt),
        ),
      );
    if (eligible.length !== userIds.length) throw new NotFoundError();
  }
  for (const stage of input.stages) {
    const requiredApprovers = stage.approvers.filter((approver) => approver.required).length;
    if (stage.requiredCount > stage.approvers.length || stage.requiredCount < requiredApprovers) {
      throw new ForbiddenError("Stage quorum conflicts with required approvers.");
    }
  }
  const pipelineId = await db.transaction(async (tx) => {
    if (input.isDefault) {
      await tx
        .update(pipelines)
        .set({ isDefault: false })
        .where(eq(pipelines.agencyId, principal.agencyId as string));
    }
    const [pipeline] = await tx
      .insert(pipelines)
      .values({
        agencyId: principal.agencyId as string,
        name: input.name,
        isDefault: input.isDefault,
      })
      .returning();
    if (!pipeline) throw new Error("Pipeline insert failed.");
    for (const [index, template] of input.stages.entries()) {
      const [stage] = await tx
        .insert(pipelineStages)
        .values({
          agencyId: pipeline.agencyId,
          pipelineId: pipeline.id,
          name: template.name,
          type: template.type,
          mode: template.mode,
          sequence: index + 1,
          requiredCount: template.requiredCount,
          slaHours: template.slaHours,
          escalateToUserId: template.escalateToUserId,
          requiresInternalApproval: template.type === "INTERNAL",
          requiresClientApproval: template.type === "CLIENT",
        })
        .returning();
      if (!stage) throw new Error("Pipeline stage insert failed.");
      if (template.approvers.length) {
        await tx.insert(pipelineStageApprovers).values(
          template.approvers.map((approver, approverIndex) => ({
            agencyId: pipeline.agencyId,
            pipelineStageId: stage.id,
            userId: approver.userId,
            approverOrder: approverIndex + 1,
            required: approver.required,
          })),
        );
      }
    }
    return pipeline.id;
  });
  return (await listPipelines(principal)).find((pipeline) => pipeline.id === pipelineId);
}

async function snapshotPipeline(
  principal: Principal,
  deliverable: typeof deliverables.$inferSelect,
  version: typeof fileVersions.$inferSelect,
  pipelineId?: string,
) {
  const defaultPipeline = pipelineId
    ? (
        await db
          .select()
          .from(pipelines)
          .where(
            and(
              eq(pipelines.id, pipelineId),
              eq(pipelines.agencyId, deliverable.agencyId),
              isNull(pipelines.deletedAt),
            ),
          )
          .limit(1)
      )[0]
    : await ensureDefaultPipeline(deliverable.agencyId);
  if (!defaultPipeline) throw new NotFoundError();
  const templates = await db
    .select()
    .from(pipelineStages)
    .where(eq(pipelineStages.pipelineId, defaultPipeline.id))
    .orderBy(asc(pipelineStages.sequence));
  if (!templates.some((stage) => stage.type === "INTERNAL")) {
    throw new ForbiddenError("The selected pipeline has no internal review stage.");
  }
  const templateIds = templates.map((stage) => stage.id);
  const configuredApprovers = templateIds.length
    ? await db
        .select()
        .from(pipelineStageApprovers)
        .where(inArray(pipelineStageApprovers.pipelineStageId, templateIds))
    : [];
  return db.transaction(async (tx) => {
    const [run] = await tx
      .insert(reviewRuns)
      .values({
        agencyId: deliverable.agencyId,
        deliverableId: deliverable.id,
        fileVersionId: version.id,
        pipelineId: defaultPipeline.id,
        pipelineName: defaultPipeline.name,
        createdByUserId: principal.userId,
      })
      .returning();
    if (!run) throw new Error("Review run insert failed.");
    const now = new Date();
    const firstInternal = templates.find((stage) => stage.type === "INTERNAL");
    const stages = await tx
      .insert(reviewStages)
      .values(
        templates.map((template) => {
          const active = template.id === firstInternal?.id;
          return {
            agencyId: deliverable.agencyId,
            deliverableId: deliverable.id,
            reviewRunId: run.id,
            pipelineStageId: template.id,
            name: template.name,
            type: template.type,
            mode: template.mode,
            order: template.sequence,
            requiredCount: template.requiredCount,
            slaHours: template.slaHours,
            escalateToUserId: template.escalateToUserId,
            status: active ? ("ACTIVE" as const) : ("PENDING" as const),
            activatedAt: active ? now : null,
            dueAt:
              active && template.slaHours
                ? new Date(now.getTime() + template.slaHours * 60 * 60 * 1000)
                : null,
          };
        }),
      )
      .returning();
    const stageByTemplate = new Map(stages.map((stage) => [stage.pipelineStageId, stage]));
    const approvers = configuredApprovers.flatMap((approver) => {
      const stage = stageByTemplate.get(approver.pipelineStageId);
      return stage
        ? [
            {
              agencyId: deliverable.agencyId,
              reviewStageId: stage.id,
              userId: approver.userId,
              approverOrder: approver.approverOrder,
              required: approver.required,
            },
          ]
        : [];
    });
    if (approvers.length) await tx.insert(reviewStageApprovers).values(approvers);
    return { run, stages };
  });
}

async function latestRun(deliverableId: string) {
  const [run] = await db
    .select()
    .from(reviewRuns)
    .where(eq(reviewRuns.deliverableId, deliverableId))
    .orderBy(desc(reviewRuns.createdAt))
    .limit(1);
  if (!run) throw new NotFoundError("No review run exists for this version.");
  return run;
}

export async function listReviewStages(principal: Principal, deliverableId: string) {
  await accessibleDeliverable(principal, deliverableId);
  const runs = await db
    .select()
    .from(reviewRuns)
    .where(eq(reviewRuns.deliverableId, deliverableId))
    .orderBy(desc(reviewRuns.createdAt));
  if (!runs.length) return [];
  const runIds = runs.map((run) => run.id);
  const allStages = await db
    .select()
    .from(reviewStages)
    .where(inArray(reviewStages.reviewRunId, runIds))
    .orderBy(asc(reviewStages.order));
  const visibleStages = principal.role.startsWith("CLIENT_")
    ? allStages.filter((stage) => stage.type === "CLIENT")
    : allStages;
  const stageIds = visibleStages.map((stage) => stage.id);
  const approvers = stageIds.length
    ? await db
        .select({
          reviewStageId: reviewStageApprovers.reviewStageId,
          userId: users.id,
          name: users.name,
          approverOrder: reviewStageApprovers.approverOrder,
          required: reviewStageApprovers.required,
        })
        .from(reviewStageApprovers)
        .innerJoin(users, eq(users.id, reviewStageApprovers.userId))
        .where(inArray(reviewStageApprovers.reviewStageId, stageIds))
    : [];
  return runs.map((run) => ({
    ...run,
    stages: visibleStages
      .filter((stage) => stage.reviewRunId === run.id)
      .map((stage) => ({
        ...stage,
        approvers: approvers
          .filter((approver) => approver.reviewStageId === stage.id)
          .sort((left, right) => left.approverOrder - right.approverOrder),
      })),
  }));
}

export async function configureReviewStage(
  principal: Principal,
  deliverableId: string,
  stageId: string,
  input: {
    mode: "SEQUENTIAL" | "PARALLEL";
    requiredCount: number;
    approverUserIds: string[];
  },
) {
  if (!["AGENCY_OWNER", "AGENCY_ADMIN"].includes(principal.role)) throw new ForbiddenError();
  assertWritablePrincipal(principal);
  const deliverable = await accessibleDeliverable(principal, deliverableId);
  const [stage] = await db
    .select()
    .from(reviewStages)
    .where(
      and(
        eq(reviewStages.id, stageId),
        eq(reviewStages.deliverableId, deliverable.id),
        eq(reviewStages.agencyId, deliverable.agencyId),
      ),
    )
    .limit(1);
  if (stage?.status !== "PENDING") {
    throw new ForbiddenError("Only pending stage snapshots can be configured.");
  }
  const eligible = input.approverUserIds.length
    ? await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.agencyId, deliverable.agencyId),
            inArray(users.id, input.approverUserIds),
            isNull(users.deletedAt),
          ),
        )
    : [];
  if (eligible.length !== new Set(input.approverUserIds).size) throw new NotFoundError();
  if (input.requiredCount > Math.max(1, input.approverUserIds.length)) {
    throw new ForbiddenError("Required approvals exceed configured approvers.");
  }
  await db.transaction(async (tx) => {
    await tx
      .update(reviewStages)
      .set({ mode: input.mode, requiredCount: input.requiredCount })
      .where(eq(reviewStages.id, stage.id));
    await tx.delete(reviewStageApprovers).where(eq(reviewStageApprovers.reviewStageId, stage.id));
    if (input.approverUserIds.length) {
      await tx.insert(reviewStageApprovers).values(
        input.approverUserIds.map((userId, index) => ({
          agencyId: deliverable.agencyId,
          reviewStageId: stage.id,
          userId,
          approverOrder: index + 1,
          required: true,
        })),
      );
    }
  });
  return listReviewStages(principal, deliverableId);
}

export async function submitForInternalReview(
  principal: Principal,
  deliverableId: string,
  pipelineId?: string,
) {
  if (!can(principal, "update", "deliverable")) throw new ForbiddenError();
  assertWritablePrincipal(principal);
  const deliverable = await accessibleDeliverable(principal, deliverableId);
  if (deliverable.status !== "READY_FOR_INTERNAL_REVIEW") {
    throw new ForbiddenError("This deliverable is not ready for internal review.");
  }
  const version = await latestVersion(deliverableId);
  if (version.isSource && (!version.previewUrl || version.previewStatus !== "READY")) {
    throw new ForbiddenError("Attach a ready companion preview before starting review.");
  }
  const [existing] = await db
    .select({ id: reviewRuns.id })
    .from(reviewRuns)
    .where(eq(reviewRuns.fileVersionId, version.id))
    .limit(1);
  if (existing) throw new ForbiddenError("This version already has a review run.");
  const snapshot = await snapshotPipeline(principal, deliverable, version, pipelineId);
  const active = snapshot.stages.find((stage) => stage.status === "ACTIVE");
  await db.transaction(async (tx) => {
    await tx
      .update(deliverables)
      .set({ status: "UNDER_INTERNAL_REVIEW" })
      .where(eq(deliverables.id, deliverable.id));
    await tx
      .update(fileVersions)
      .set({ status: "UNDER_INTERNAL_REVIEW" })
      .where(eq(fileVersions.id, version.id));
    await tx.insert(outbox).values({
      agencyId: deliverable.agencyId,
      eventType: "INTERNAL_REVIEW_REQUESTED",
      payload: {
        deliverableId,
        fileVersionId: version.id,
        reviewRunId: snapshot.run.id,
        reviewStageId: active?.id,
        actorUserId: principal.userId,
      },
    });
  });
  return {
    status: "UNDER_INTERNAL_REVIEW",
    fileVersionId: version.id,
    reviewRunId: snapshot.run.id,
  };
}

async function activateNextStage(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  runId: string,
  afterOrder: number,
  type: StageType,
) {
  const [next] = await tx
    .select()
    .from(reviewStages)
    .where(
      and(
        eq(reviewStages.reviewRunId, runId),
        eq(reviewStages.type, type),
        eq(reviewStages.status, "PENDING"),
      ),
    )
    .orderBy(asc(reviewStages.order))
    .limit(1);
  if (!next || next.order <= afterOrder) return null;
  const now = new Date();
  const [active] = await tx
    .update(reviewStages)
    .set({
      status: "ACTIVE",
      activatedAt: now,
      dueAt: next.slaHours ? new Date(now.getTime() + next.slaHours * 60 * 60 * 1000) : null,
    })
    .where(eq(reviewStages.id, next.id))
    .returning();
  return active ?? null;
}

export async function promoteToClient(principal: Principal, deliverableId: string) {
  if (!can(principal, "approve", "deliverable")) throw new ForbiddenError();
  assertWritablePrincipal(principal);
  const deliverable = await accessibleDeliverable(principal, deliverableId);
  if (deliverable.status !== "INTERNAL_APPROVED") {
    throw new ForbiddenError("Internal approval is required before client promotion.");
  }
  const run = await latestRun(deliverableId);
  const version = await versionForDeliverable(deliverableId, run.fileVersionId);
  const [firstClient] = await db
    .select()
    .from(reviewStages)
    .where(
      and(
        eq(reviewStages.reviewRunId, run.id),
        eq(reviewStages.type, "CLIENT"),
        eq(reviewStages.status, "PENDING"),
      ),
    )
    .orderBy(asc(reviewStages.order))
    .limit(1);
  if (!firstClient) throw new ForbiddenError("The review pipeline has no client stage.");
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(deliverables)
      .set({ status: "UNDER_CLIENT_REVIEW", submittedAt: now })
      .where(eq(deliverables.id, deliverable.id));
    await tx
      .update(fileVersions)
      .set({ status: "UNDER_CLIENT_REVIEW", visibility: "CLIENT" })
      .where(eq(fileVersions.id, version.id));
    await tx.update(reviewRuns).set({ status: "CLIENT_REVIEW" }).where(eq(reviewRuns.id, run.id));
    await tx
      .update(reviewStages)
      .set({
        status: "ACTIVE",
        activatedAt: now,
        dueAt: firstClient.slaHours
          ? new Date(now.getTime() + firstClient.slaHours * 60 * 60 * 1000)
          : null,
      })
      .where(eq(reviewStages.id, firstClient.id));
    await tx.insert(outbox).values({
      agencyId: deliverable.agencyId,
      eventType: "SUBMITTED_TO_CLIENT",
      payload: {
        deliverableId,
        fileVersionId: version.id,
        reviewRunId: run.id,
        reviewStageId: firstClient.id,
        actorUserId: principal.userId,
      },
    });
  });
  return { status: "UNDER_CLIENT_REVIEW", fileVersionId: version.id, reviewRunId: run.id };
}

export async function decideReview(
  principal: Principal,
  deliverableId: string,
  input: ReviewDecisionInput & { requestIp?: string; requestUserAgent?: string },
) {
  if (!can(principal, "approve", "deliverable")) throw new ForbiddenError();
  assertWritablePrincipal(principal);
  const deliverable = await accessibleDeliverable(principal, deliverableId);
  const expectedType: StageType | null =
    deliverable.status === "UNDER_INTERNAL_REVIEW"
      ? "INTERNAL"
      : deliverable.status === "UNDER_CLIENT_REVIEW"
        ? "CLIENT"
        : null;
  if (!expectedType) throw new ForbiddenError("This deliverable is not awaiting a decision.");
  if (expectedType === "INTERNAL" && principal.role.startsWith("CLIENT_"))
    throw new NotFoundError();
  if (expectedType === "CLIENT" && !principal.role.startsWith("CLIENT_")) {
    throw new ForbiddenError("A client approver must make this decision.");
  }
  if (input.decision !== "APPROVE" && !input.feedback) {
    throw new ForbiddenError("Feedback is required when work is not approved.");
  }
  const run = await latestRun(deliverableId);
  if (run.fileVersionId !== input.fileVersionId) {
    throw new ForbiddenError("Only the active review run can be decided.");
  }
  const version = await versionForDeliverable(deliverableId, input.fileVersionId);
  if (expectedType === "CLIENT" && version.visibility !== "CLIENT") throw new NotFoundError();
  const [stage] = await db
    .select()
    .from(reviewStages)
    .where(
      and(
        eq(reviewStages.reviewRunId, run.id),
        eq(reviewStages.type, expectedType),
        eq(reviewStages.status, "ACTIVE"),
      ),
    )
    .orderBy(asc(reviewStages.order))
    .limit(1);
  if (!stage) throw new NotFoundError();
  const configuredApprovers = await db
    .select()
    .from(reviewStageApprovers)
    .where(eq(reviewStageApprovers.reviewStageId, stage.id))
    .orderBy(asc(reviewStageApprovers.approverOrder));
  const approverIndex = configuredApprovers.findIndex(
    (approver) => approver.userId === principal.userId,
  );
  if (configuredApprovers.length && approverIndex < 0) {
    throw new ForbiddenError("You are not an approver for this stage.");
  }
  if (stage.mode === "SEQUENTIAL" && configuredApprovers.length) {
    const decisions = await db
      .select({ userId: approvals.decidedByUserId })
      .from(approvals)
      .where(eq(approvals.reviewStageId, stage.id));
    const decided = new Set(decisions.map((decision) => decision.userId));
    const next = configuredApprovers.find((approver) => !decided.has(approver.userId));
    if (next?.userId !== principal.userId) {
      throw new ForbiddenError("A previous sequential approver must decide first.");
    }
  }
  const [existing] = await db
    .select({ id: approvals.id })
    .from(approvals)
    .where(
      and(eq(approvals.reviewStageId, stage.id), eq(approvals.decidedByUserId, principal.userId)),
    )
    .limit(1);
  if (existing) throw new ForbiddenError("Your decision for this stage is immutable.");
  if (
    expectedType === "CLIENT" &&
    input.decision === "APPROVE" &&
    (!input.eSignature || !input.signatureConsentText || !input.signatureConsentVersion)
  ) {
    throw new ForbiddenError("Final approval requires a typed signature and consent record.");
  }

  return db.transaction(async (tx) => {
    const [approval] = await tx
      .insert(approvals)
      .values({
        agencyId: deliverable.agencyId,
        deliverableId,
        fileVersionId: version.id,
        reviewRunId: run.id,
        reviewStageId: stage.id,
        decidedByUserId: principal.userId,
        decision: input.decision,
        feedback: input.feedback,
        eSignature: input.eSignature,
        signatureConsentText: input.signatureConsentText,
        signatureConsentVersion: input.signatureConsentVersion,
        requestIp: input.requestIp,
        requestUserAgent: input.requestUserAgent,
      })
      .returning();
    if (!approval) throw new Error("Approval insert failed.");
    const decisions = await tx
      .select({ decision: approvals.decision, userId: approvals.decidedByUserId })
      .from(approvals)
      .where(eq(approvals.reviewStageId, stage.id));
    const rejected = decisions.some((decision) => decision.decision !== "APPROVE");
    const requiredApprovers = configuredApprovers.filter((approver) => approver.required);
    const requiredApproved = requiredApprovers.every((approver) =>
      decisions.some(
        (decision) => decision.userId === approver.userId && decision.decision === "APPROVE",
      ),
    );
    const approvalsCount = decisions.filter((decision) => decision.decision === "APPROVE").length;
    const passed =
      !rejected &&
      requiredApproved &&
      (configuredApprovers.length
        ? approvalsCount >= stage.requiredCount &&
          (stage.mode === "PARALLEL" || approvalsCount === configuredApprovers.length)
        : approvalsCount >= stage.requiredCount);
    const stageStatus = rejected ? "REJECTED" : passed ? "PASSED" : "ACTIVE";
    if (stageStatus !== "ACTIVE") {
      await tx
        .update(reviewStages)
        .set({ status: stageStatus, completedAt: new Date() })
        .where(eq(reviewStages.id, stage.id));
    }
    let nextStatus = deliverable.status;
    let activatedStage: typeof reviewStages.$inferSelect | null = null;
    if (stageStatus === "REJECTED") {
      nextStatus = expectedType === "INTERNAL" ? "IN_PROGRESS" : "REVISION_REQUESTED";
      await tx
        .update(fileVersions)
        .set({ status: "CHANGES_REQUESTED" })
        .where(eq(fileVersions.id, version.id));
      await tx
        .update(reviewRuns)
        .set({ status: "REJECTED", completedAt: new Date() })
        .where(eq(reviewRuns.id, run.id));
    } else if (stageStatus === "PASSED") {
      activatedStage = await activateNextStage(tx, run.id, stage.order, expectedType);
      if (!activatedStage) {
        nextStatus = expectedType === "INTERNAL" ? "INTERNAL_APPROVED" : "APPROVED";
        await tx
          .update(fileVersions)
          .set({ status: expectedType === "INTERNAL" ? "INTERNAL_APPROVED" : "APPROVED" })
          .where(eq(fileVersions.id, version.id));
        await tx
          .update(reviewRuns)
          .set({
            status: expectedType === "INTERNAL" ? "INTERNAL_APPROVED" : "APPROVED",
            completedAt: expectedType === "CLIENT" ? new Date() : null,
          })
          .where(eq(reviewRuns.id, run.id));
      }
    }
    if (nextStatus !== deliverable.status) {
      await tx
        .update(deliverables)
        .set({
          status: nextStatus,
          reviewedAt: expectedType === "CLIENT" ? new Date() : undefined,
          approvedAt: nextStatus === "APPROVED" ? new Date() : undefined,
        })
        .where(eq(deliverables.id, deliverable.id));
    }
    await tx.insert(outbox).values({
      agencyId: deliverable.agencyId,
      eventType:
        nextStatus === "APPROVED"
          ? "APPROVED"
          : stageStatus === "REJECTED"
            ? "REVISION_REQUESTED"
            : activatedStage
              ? "REVIEW_STAGE_ACTIVATED"
              : "REVIEW_DECISION_RECORDED",
      payload: {
        approvalId: approval.id,
        deliverableId,
        fileVersionId: version.id,
        reviewRunId: run.id,
        reviewStageId: stage.id,
        activatedStageId: activatedStage?.id,
        decision: input.decision,
        actorUserId: principal.userId,
      },
    });
    return { approval, stageStatus, deliverableStatus: nextStatus, activatedStage };
  });
}

export async function listApprovals(principal: Principal, deliverableId: string) {
  await accessibleDeliverable(principal, deliverableId);
  const rows = await db
    .select({ approval: approvals, decidedByName: users.name })
    .from(approvals)
    .innerJoin(users, eq(users.id, approvals.decidedByUserId))
    .leftJoin(reviewStages, eq(reviewStages.id, approvals.reviewStageId))
    .where(
      and(
        eq(approvals.deliverableId, deliverableId),
        principal.role.startsWith("CLIENT_") ? eq(reviewStages.type, "CLIENT") : undefined,
      ),
    )
    .orderBy(asc(approvals.decidedAt));
  return rows.map((row) => ({ ...row.approval, decidedByName: row.decidedByName }));
}

export function normalizedAnchor(
  version: typeof fileVersions.$inferSelect | null,
  anchorType: CreateCommentInput["anchorType"],
  raw: Record<string, unknown> | undefined,
) {
  if (anchorType === "NONE") return null;
  if (!version) throw new ForbiddenError("Anchored comments require a file version.");
  const anchor = raw ?? {};
  if (anchorType === "TIMECODE") {
    if (!version.fileType?.startsWith("video/"))
      throw new ForbiddenError("Timecode anchors require video.");
    const timecodeMs = Number(anchor.timecodeMs ?? anchor.milliseconds);
    if (!Number.isFinite(timecodeMs) || timecodeMs < 0)
      throw new ForbiddenError("Invalid timecode anchor.");
    return { timecodeMs: Math.round(timecodeMs) };
  }
  if (anchorType === "WAVEFORM_RANGE") {
    if (!version.fileType?.startsWith("audio/"))
      throw new ForbiddenError("Audio ranges require audio.");
    const startMs = Number(anchor.startMs);
    const endMs = Number(anchor.endMs);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs < 0 || endMs <= startMs) {
      throw new ForbiddenError("Invalid waveform range.");
    }
    return { startMs: Math.round(startMs), endMs: Math.round(endMs) };
  }
  const page = anchor.page === undefined ? undefined : Number(anchor.page);
  if (version.fileType === "application/pdf" && (!Number.isInteger(page) || Number(page) < 1)) {
    throw new ForbiddenError("PDF regions require a page number.");
  }
  const timecodeMs =
    version.fileType?.startsWith("video/") && anchor.timecodeMs !== undefined
      ? Number(anchor.timecodeMs)
      : undefined;
  if (timecodeMs !== undefined && (!Number.isFinite(timecodeMs) || timecodeMs < 0)) {
    throw new ForbiddenError("Invalid video-region timecode.");
  }
  const geometry = normalizeGeometry(
    anchor.geometry && typeof anchor.geometry === "object"
      ? (anchor.geometry as Record<string, unknown>)
      : { kind: "POINT", x: anchor.x, y: anchor.y },
  );
  return {
    ...(page ? { page } : {}),
    ...(timecodeMs === undefined ? {} : { timecodeMs: Math.round(timecodeMs) }),
    geometry,
  };
}

// Validate a region geometry against the typed Anchor model. Every coordinate must be a
// finite normalized 0..1 value. Returns a clean geometry object; throws on anything else.
function normalizeGeometry(raw: Record<string, unknown>) {
  const unit = (value: unknown) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > 1)
      throw new ForbiddenError("Region geometry must use normalized coordinates.");
    return n;
  };
  const points = (value: unknown) => {
    if (!Array.isArray(value) || value.length === 0)
      throw new ForbiddenError("Region geometry requires at least one point.");
    return value.map((p) => {
      const pt = (p ?? {}) as Record<string, unknown>;
      return { x: unit(pt.x), y: unit(pt.y) };
    });
  };
  switch (raw.kind) {
    case "POINT":
      return { kind: "POINT", x: unit(raw.x), y: unit(raw.y) };
    case "RECTANGLE":
      return {
        kind: "RECTANGLE",
        x: unit(raw.x),
        y: unit(raw.y),
        width: unit(raw.width),
        height: unit(raw.height),
      };
    case "ARROW":
      return {
        kind: "ARROW",
        x1: unit(raw.x1),
        y1: unit(raw.y1),
        x2: unit(raw.x2),
        y2: unit(raw.y2),
      };
    case "POLYGON":
    case "PATH":
      return { kind: raw.kind, points: points(raw.points) };
    default:
      throw new ForbiddenError("Unsupported region geometry.");
  }
}

function hashtags(message: string) {
  return [
    ...new Set(message.match(/#[\p{L}\p{N}_-]+/gu)?.map((tag) => tag.slice(1).toLowerCase()) ?? []),
  ];
}

async function validateMentions(
  principal: Principal,
  deliverable: typeof deliverables.$inferSelect,
  mentionUserIds: string[],
) {
  if (!mentionUserIds.length) return;
  const mentioned = await db
    .select()
    .from(users)
    .where(and(inArray(users.id, mentionUserIds), isNull(users.deletedAt)));
  if (
    mentioned.length !== new Set(mentionUserIds).size ||
    mentioned.some(
      (user) =>
        user.agencyId !== deliverable.agencyId ||
        (principal.role.startsWith("CLIENT_") && user.clientId !== principal.clientId),
    )
  ) {
    throw new NotFoundError();
  }
}

async function claimAttachments(
  principal: Principal,
  agencyId: string,
  attachmentIds: string[],
  parentType: "COMMENT" | "MESSAGE",
  parentId: string,
) {
  if (!attachmentIds.length) return;
  const rows = await db.select().from(attachments).where(inArray(attachments.id, attachmentIds));
  if (
    rows.length !== new Set(attachmentIds).size ||
    rows.some(
      (attachment) =>
        attachment.agencyId !== agencyId ||
        attachment.ownerUserId !== principal.userId ||
        attachment.status !== "READY" ||
        attachment.expiresAt <= new Date(),
    )
  ) {
    throw new NotFoundError();
  }
  await db
    .update(attachments)
    .set({ status: "CLAIMED", parentType, parentId, claimedAt: new Date() })
    .where(inArray(attachments.id, attachmentIds));
}

export async function listComments(
  principal: Principal,
  deliverableId: string,
  input: { threaded?: boolean; cursor?: string; limit?: number } = {},
) {
  await accessibleDeliverable(principal, deliverableId);
  const rows = await db
    .select({ comment: comments, authorName: users.name })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.userId))
    .where(and(eq(comments.deliverableId, deliverableId), isNull(comments.deletedAt)))
    .orderBy(asc(comments.createdAt));
  const visibleIds = new Set(
    visibleComments(
      principal,
      rows.map((row) => row.comment),
    ).map((row) => row.id),
  );
  const visible = rows.filter((row) => visibleIds.has(row.comment.id));
  const ids = visible.map((row) => row.comment.id);
  const reactions = ids.length
    ? await db.select().from(commentReactions).where(inArray(commentReactions.commentId, ids))
    : [];
  const attached = ids.length
    ? await db
        .select()
        .from(attachments)
        .where(and(eq(attachments.parentType, "COMMENT"), inArray(attachments.parentId, ids)))
    : [];
  const serialized = visible.map((row) => ({
    ...row.comment,
    authorName: row.authorName,
    reactionRows: reactions.filter((reaction) => reaction.commentId === row.comment.id),
    attachmentRows: attached
      .filter((attachment) => attachment.parentId === row.comment.id)
      .map(({ objectKey: _objectKey, uploadId: _uploadId, ...attachment }) => attachment),
  }));
  if (!input.threaded) return serialized;
  const limit = Math.min(Math.max(input.limit ?? 30, 1), 100);
  const roots = serialized
    .filter((comment) => !comment.parentId)
    .filter((comment) => !input.cursor || comment.createdAt < new Date(input.cursor))
    .slice(0, limit + 1);
  const selectedRoots = roots.slice(0, limit);
  const rootIds = new Set(selectedRoots.map((comment) => comment.id));
  return {
    roots: selectedRoots,
    repliesByParent: Object.fromEntries(
      selectedRoots.map((root) => [
        root.id,
        serialized.filter(
          (comment) => comment.parentId === root.id || rootIds.has(comment.parentId ?? ""),
        ),
      ]),
    ),
    nextCursor:
      roots.length > limit
        ? (selectedRoots[selectedRoots.length - 1]?.createdAt.toISOString() ?? null)
        : null,
  };
}

export async function createComment(
  principal: Principal,
  deliverableId: string,
  input: CreateCommentInput,
) {
  if (!can(principal, "create", "comment")) throw new ForbiddenError();
  assertWritablePrincipal(principal);
  const deliverable = await accessibleDeliverable(principal, deliverableId);
  const version = input.fileVersionId
    ? await versionForDeliverable(deliverableId, input.fileVersionId)
    : null;
  if (version && principal.role.startsWith("CLIENT_") && version.visibility !== "CLIENT") {
    throw new NotFoundError();
  }
  if (input.parentId) {
    const [parent] = await db
      .select()
      .from(comments)
      .where(and(eq(comments.id, input.parentId), eq(comments.deliverableId, deliverableId)))
      .limit(1);
    if (!parent || (principal.role.startsWith("CLIENT_") && parent.visibility === "INTERNAL")) {
      throw new NotFoundError();
    }
  }
  await validateMentions(principal, deliverable, input.mentionUserIds);
  const visibility = principal.role.startsWith("CLIENT_") ? "CLIENT_VISIBLE" : input.visibility;
  const anchor = normalizedAnchor(version, input.anchorType, input.anchor);
  const [comment] = await db
    .insert(comments)
    .values({
      agencyId: deliverable.agencyId,
      deliverableId,
      fileVersionId: input.fileVersionId,
      parentId: input.parentId,
      userId: principal.userId,
      message: input.message,
      visibility,
      anchorType: input.anchorType,
      anchor,
      refVersionIds: input.refVersionIds,
      mentionUserIds: input.mentionUserIds,
      hashtags: hashtags(input.message),
    })
    .returning();
  if (!comment) throw new Error("Comment insert failed.");
  await claimAttachments(
    principal,
    deliverable.agencyId,
    input.attachmentIds,
    "COMMENT",
    comment.id,
  );
  await db.insert(outbox).values([
    {
      agencyId: deliverable.agencyId,
      eventType: "COMMENT_ADDED",
      payload: {
        commentId: comment.id,
        deliverableId,
        fileVersionId: comment.fileVersionId,
        visibility,
        actorUserId: principal.userId,
      },
    },
    ...input.mentionUserIds.map((mentionedUserId) => ({
      agencyId: deliverable.agencyId,
      eventType: "MENTION",
      payload: {
        commentId: comment.id,
        deliverableId,
        fileVersionId: comment.fileVersionId,
        mentionedUserId,
        visibility,
        actorUserId: principal.userId,
      },
    })),
  ]);
  return comment;
}

export async function reactToComment(
  principal: Principal,
  deliverableId: string,
  commentId: string,
  emoji: string,
  remove = false,
) {
  assertWritablePrincipal(principal);
  await accessibleDeliverable(principal, deliverableId);
  const [comment] = await db
    .select()
    .from(comments)
    .where(and(eq(comments.id, commentId), eq(comments.deliverableId, deliverableId)))
    .limit(1);
  if (!comment || (principal.role.startsWith("CLIENT_") && comment.visibility === "INTERNAL")) {
    throw new NotFoundError();
  }
  if (!/^\p{Extended_Pictographic}$/u.test(emoji)) throw new ForbiddenError("Use one emoji.");
  if (remove) {
    await db
      .delete(commentReactions)
      .where(
        and(
          eq(commentReactions.commentId, comment.id),
          eq(commentReactions.userId, principal.userId),
          eq(commentReactions.emoji, emoji),
        ),
      );
  } else {
    await db
      .insert(commentReactions)
      .values({
        agencyId: comment.agencyId,
        commentId: comment.id,
        userId: principal.userId,
        emoji,
      })
      .onConflictDoNothing();
  }
  return { reacted: !remove };
}

export async function resolveComment(
  principal: Principal,
  deliverableId: string,
  commentId: string,
  reopen = false,
) {
  if (!can(principal, "update", "comment")) throw new ForbiddenError();
  assertWritablePrincipal(principal);
  await accessibleDeliverable(principal, deliverableId);
  const [comment] = await db
    .update(comments)
    .set({
      resolvedAt: reopen ? null : new Date(),
      resolvedByUserId: reopen ? null : principal.userId,
    })
    .where(and(eq(comments.id, commentId), eq(comments.deliverableId, deliverableId)))
    .returning();
  if (!comment || (principal.role.startsWith("CLIENT_") && comment.visibility === "INTERNAL")) {
    throw new NotFoundError();
  }
  return comment;
}

export async function commentToTask(
  principal: Principal,
  deliverableId: string,
  commentId: string,
) {
  if (principal.role.startsWith("CLIENT_")) throw new ForbiddenError();
  assertWritablePrincipal(principal);
  const deliverable = await accessibleDeliverable(principal, deliverableId);
  const [comment] = await db
    .select()
    .from(comments)
    .where(and(eq(comments.id, commentId), eq(comments.deliverableId, deliverableId)))
    .limit(1);
  if (!comment) throw new NotFoundError();
  if (comment.spawnedTaskId) {
    const [existing] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, comment.spawnedTaskId))
      .limit(1);
    return existing;
  }
  return db.transaction(async (tx) => {
    const [task] = await tx
      .insert(tasks)
      .values({
        agencyId: deliverable.agencyId,
        projectId: deliverable.projectId,
        deliverableId,
        title: comment.message.slice(0, 240),
        assignedToUserId: deliverable.assignedToUserId,
        taskType: "COMMENT_FEEDBACK",
        createdByUserId: principal.userId,
      })
      .returning();
    if (!task) throw new Error("Task insert failed.");
    await tx.update(comments).set({ spawnedTaskId: task.id }).where(eq(comments.id, comment.id));
    return task;
  });
}

export async function listRevisionTasks(principal: Principal, deliverableId: string) {
  await accessibleDeliverable(principal, deliverableId);
  if (principal.role.startsWith("CLIENT_")) throw new NotFoundError();
  const rows = await db
    .select({
      task: tasks,
      assigneeName: users.name,
    })
    .from(tasks)
    .leftJoin(users, eq(users.id, tasks.assignedToUserId))
    .where(
      and(
        eq(tasks.deliverableId, deliverableId),
        eq(tasks.taskType, "COMMENT_FEEDBACK"),
        isNull(tasks.deletedAt),
      ),
    )
    .orderBy(asc(tasks.position), asc(tasks.createdAt));
  const taskIds = rows.map((row) => row.task.id);
  const sourceComments = taskIds.length
    ? await db.select().from(comments).where(inArray(comments.spawnedTaskId, taskIds))
    : [];
  return rows.map((row) => ({
    ...row.task,
    assigneeName: row.assigneeName,
    sourceComment: sourceComments.find((comment) => comment.spawnedTaskId === row.task.id) ?? null,
  }));
}

export async function updateRevisionTask(
  principal: Principal,
  taskId: string,
  input: {
    status?: "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE";
    assignedToUserId?: string | null;
    dueDate?: Date | null;
  },
) {
  if (principal.role.startsWith("CLIENT_")) throw new NotFoundError();
  assertWritablePrincipal(principal);
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task?.deliverableId || task.taskType !== "COMMENT_FEEDBACK") throw new NotFoundError();
  const deliverable = await accessibleDeliverable(principal, task.deliverableId);
  if (task.agencyId !== deliverable.agencyId) throw new NotFoundError();
  if (input.assignedToUserId) {
    const [assignee] = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.id, input.assignedToUserId),
          eq(users.agencyId, deliverable.agencyId),
          isNull(users.deletedAt),
        ),
      )
      .limit(1);
    if (!assignee) throw new NotFoundError();
  }
  const [updated] = await db.update(tasks).set(input).where(eq(tasks.id, task.id)).returning();
  return updated;
}
