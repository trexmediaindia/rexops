import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import {
  approvals,
  comments,
  db,
  deliverables,
  fileVersions,
  pipelineStageApprovers,
  pipelineStages,
  pipelines,
  reviewRuns,
  reviewStageApprovers,
  reviewStages,
  tasks,
  users,
} from "@rexops/db";
import { and, eq, sql } from "drizzle-orm";
import { apiRequest, ensureTestFixtures, principals, responseJson } from "../../test/helpers";

const deliverableId = "deliverable_review_test";
const versionId = "version_review_test";
const adminId = "user_review_admin";
const adminPrincipal = {
  ...principals.owner,
  userId: adminId,
  role: "AGENCY_ADMIN" as const,
};
let createdPipelineId = "";

beforeAll(async () => {
  await ensureTestFixtures();
  await db
    .insert(users)
    .values({
      id: adminId,
      name: "Review Admin",
      email: "review-admin@trex.test",
      role: "AGENCY_ADMIN",
      agencyId: "agency_trex",
      permissions: { canApprove: true, canViewAllClients: true },
    })
    .onConflictDoNothing();
  await db
    .insert(deliverables)
    .values({
      id: deliverableId,
      agencyId: "agency_trex",
      clientId: "client_imperial",
      projectId: "project_reels",
      title: "Review Test Reel",
      contentType: "MOTION",
      status: "READY_FOR_INTERNAL_REVIEW",
      assignedToUserId: "user_riya",
      createdByUserId: "user_manas",
    })
    .onConflictDoNothing();
  await db
    .insert(fileVersions)
    .values({
      id: versionId,
      agencyId: "agency_trex",
      deliverableId,
      versionNumber: 1,
      fileName: "review.mov",
      fileType: "video/quicktime",
      externalLink: "https://video.example.com/review",
      uploadedByUserId: "user_riya",
    })
    .onConflictDoNothing();
});

async function resetReviewFixture() {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('rexops.allow_approval_mutation', 'on', true)`);
    await tx.delete(approvals).where(eq(approvals.deliverableId, deliverableId));
  });
  await db.delete(comments).where(eq(comments.deliverableId, deliverableId));
  await db.delete(tasks).where(eq(tasks.deliverableId, deliverableId));
  const stages = await db
    .select({ id: reviewStages.id })
    .from(reviewStages)
    .where(eq(reviewStages.deliverableId, deliverableId));
  for (const stage of stages) {
    await db.delete(reviewStageApprovers).where(eq(reviewStageApprovers.reviewStageId, stage.id));
  }
  await db.delete(reviewStages).where(eq(reviewStages.deliverableId, deliverableId));
  await db.delete(reviewRuns).where(eq(reviewRuns.deliverableId, deliverableId));
  await db
    .update(fileVersions)
    .set({
      status: "UPLOADED",
      visibility: "INTERNAL",
      isSource: false,
      previewUrl: null,
      previewStatus: "PENDING",
    })
    .where(eq(fileVersions.id, versionId));
  await db
    .update(deliverables)
    .set({
      status: "READY_FOR_INTERNAL_REVIEW",
      submittedAt: null,
      reviewedAt: null,
      approvedAt: null,
    })
    .where(eq(deliverables.id, deliverableId));
}

beforeEach(resetReviewFixture);
afterEach(resetReviewFixture);

afterAll(async () => {
  await resetReviewFixture();
  if (createdPipelineId) {
    const stages = await db
      .select({ id: pipelineStages.id })
      .from(pipelineStages)
      .where(eq(pipelineStages.pipelineId, createdPipelineId));
    for (const stage of stages) {
      await db
        .delete(pipelineStageApprovers)
        .where(eq(pipelineStageApprovers.pipelineStageId, stage.id));
    }
    await db.delete(pipelineStages).where(eq(pipelineStages.pipelineId, createdPipelineId));
    await db.delete(pipelines).where(eq(pipelines.id, createdPipelineId));
  }
  await db.delete(pipelineStageApprovers).where(eq(pipelineStageApprovers.userId, adminId));
  await db.delete(fileVersions).where(eq(fileVersions.deliverableId, deliverableId));
  await db.delete(deliverables).where(eq(deliverables.id, deliverableId));
  await db.delete(users).where(eq(users.id, adminId));
});

describe("review workflow", () => {
  test("drives internal approval, client promotion, and signed client approval", async () => {
    const submitted = await apiRequest(
      `/api/reviews/deliverables/${deliverableId}/submit-internal`,
      { method: "POST", principal: principals.editor },
    );
    expect(submitted.status).toBe(200);

    const internal = await apiRequest(`/api/reviews/deliverables/${deliverableId}/decisions`, {
      method: "POST",
      principal: principals.owner,
      body: { fileVersionId: versionId, decision: "APPROVE" },
    });
    expect((await responseJson(internal)).deliverableStatus).toBe("INTERNAL_APPROVED");

    const hidden = await apiRequest(`/api/file-versions/deliverable/${deliverableId}`, {
      principal: principals.clientOwner,
    });
    expect(await hidden.json()).toEqual([]);

    const promoted = await apiRequest(`/api/reviews/deliverables/${deliverableId}/promote`, {
      method: "POST",
      principal: principals.owner,
    });
    expect(promoted.status).toBe(200);

    const clientDecision = await apiRequest(
      `/api/reviews/deliverables/${deliverableId}/decisions`,
      {
        method: "POST",
        principal: principals.clientOwner,
        body: {
          fileVersionId: versionId,
          decision: "APPROVE",
          eSignature: "Sara Imperial",
          signatureConsentText: "I am authorized to approve this version.",
          signatureConsentVersion: "2026-06-22",
        },
      },
    );
    expect((await responseJson(clientDecision)).deliverableStatus).toBe("APPROVED");

    const history = await apiRequest(`/api/reviews/deliverables/${deliverableId}/approvals`, {
      principal: principals.owner,
    });
    const rows = (await history.json()) as Array<{ decision: string; eSignature: string | null }>;
    expect(rows).toHaveLength(2);
    expect(rows[1]?.eSignature).toBe("Sara Imperial");
  });

  test("requires every configured parallel approver", async () => {
    const configured = await apiRequest("/api/reviews/pipelines", {
      method: "POST",
      principal: principals.owner,
      body: {
        name: "Two-person internal gate",
        stages: [
          {
            name: "Internal gate",
            type: "INTERNAL",
            mode: "PARALLEL",
            requiredCount: 2,
            approvers: [
              { userId: "user_manas", required: true },
              { userId: adminId, required: true },
            ],
          },
          {
            name: "Client gate",
            type: "CLIENT",
            mode: "SEQUENTIAL",
            requiredCount: 1,
            approvers: [{ userId: "user_sara", required: true }],
          },
        ],
      },
    });
    const pipeline = await responseJson(configured);
    createdPipelineId = String(pipeline.id);
    await apiRequest(`/api/reviews/deliverables/${deliverableId}/submit-internal`, {
      method: "POST",
      principal: principals.editor,
      body: { pipelineId: pipeline.id },
    });

    const first = await apiRequest(`/api/reviews/deliverables/${deliverableId}/decisions`, {
      method: "POST",
      principal: principals.owner,
      body: { fileVersionId: versionId, decision: "APPROVE" },
    });
    expect((await responseJson(first)).stageStatus).toBe("ACTIVE");

    const [stillReviewing] = await db
      .select({ status: deliverables.status })
      .from(deliverables)
      .where(eq(deliverables.id, deliverableId));
    expect(stillReviewing?.status).toBe("UNDER_INTERNAL_REVIEW");

    const second = await apiRequest(`/api/reviews/deliverables/${deliverableId}/decisions`, {
      method: "POST",
      principal: adminPrincipal,
      body: { fileVersionId: versionId, decision: "APPROVE" },
    });
    expect((await responseJson(second)).stageStatus).toBe("PASSED");
  });

  test("only exposes client review stages to client users", async () => {
    await apiRequest(`/api/reviews/deliverables/${deliverableId}/submit-internal`, {
      method: "POST",
      principal: principals.editor,
    });
    const response = await apiRequest(`/api/reviews/deliverables/${deliverableId}/stages`, {
      principal: principals.clientOwner,
    });
    expect(response.status).toBe(200);
    const runs = (await response.json()) as Array<{ stages: Array<{ type: string }> }>;
    expect(runs).toHaveLength(1);
    expect(runs[0]?.stages).toHaveLength(1);
    expect(runs[0]?.stages[0]?.type).toBe("CLIENT");
  });

  test("keeps internal comments hidden and turns feedback into a tracked task", async () => {
    const internal = await apiRequest(`/api/reviews/deliverables/${deliverableId}/comments`, {
      method: "POST",
      principal: principals.owner,
      body: {
        fileVersionId: versionId,
        message: "Agency-only framing note",
        visibility: "INTERNAL",
        anchorType: "TIMECODE",
        anchor: { milliseconds: 12040 },
      },
    });
    expect(internal.status).toBe(200);

    const visible = await apiRequest(`/api/reviews/deliverables/${deliverableId}/comments`, {
      method: "POST",
      principal: principals.owner,
      body: {
        fileVersionId: versionId,
        message: "Please confirm the logo lockup",
        visibility: "CLIENT_VISIBLE",
      },
    });
    const visibleComment = await responseJson(visible);

    const clientList = await apiRequest(`/api/reviews/deliverables/${deliverableId}/comments`, {
      principal: principals.clientOwner,
    });
    const clientRows = (await clientList.json()) as unknown[];
    expect(clientRows).toHaveLength(1);

    const task = await apiRequest(
      `/api/reviews/deliverables/${deliverableId}/comments/${visibleComment.id}/task`,
      { method: "POST", principal: principals.owner },
    );
    expect(task.status).toBe(200);
    const [stored] = await db
      .select()
      .from(comments)
      .where(
        and(eq(comments.id, String(visibleComment.id)), eq(comments.deliverableId, deliverableId)),
      );
    expect(stored?.spawnedTaskId).toBeTruthy();
  });

  test("requires feedback on changes and hides cross-tenant ids", async () => {
    await apiRequest(`/api/reviews/deliverables/${deliverableId}/submit-internal`, {
      method: "POST",
      principal: principals.editor,
    });
    const missingFeedback = await apiRequest(
      `/api/reviews/deliverables/${deliverableId}/decisions`,
      {
        method: "POST",
        principal: principals.owner,
        body: { fileVersionId: versionId, decision: "REQUEST_CHANGES" },
      },
    );
    expect(missingFeedback.status).toBe(403);

    const guessed = await apiRequest(`/api/reviews/deliverables/${deliverableId}/comments`, {
      principal: principals.outsider,
    });
    expect(guessed.status).toBe(404);
  });

  test("blocks source review until a companion preview is ready", async () => {
    await db
      .update(fileVersions)
      .set({ isSource: true, previewUrl: null, previewStatus: "PENDING" })
      .where(eq(fileVersions.id, versionId));
    const blocked = await apiRequest(`/api/reviews/deliverables/${deliverableId}/submit-internal`, {
      method: "POST",
      principal: principals.editor,
    });
    expect(blocked.status).toBe(403);

    await db
      .update(fileVersions)
      .set({
        previewUrl: "https://video.example.com/review-proxy.mp4",
        previewStatus: "READY",
      })
      .where(eq(fileVersions.id, versionId));
    const submitted = await apiRequest(
      `/api/reviews/deliverables/${deliverableId}/submit-internal`,
      { method: "POST", principal: principals.editor },
    );
    expect(submitted.status).toBe(200);
  });
});
