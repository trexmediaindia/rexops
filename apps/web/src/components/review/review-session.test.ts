import { describe, expect, test } from "bun:test";
import type { Approval, ReviewRun } from "./audit/stage-timeline";
import { resolveCapabilities, sideFromRole } from "./review-session";

function stage(overrides: Partial<ReviewRun["stages"][number]> = {}): ReviewRun["stages"][number] {
  return {
    id: "stage_internal",
    name: "Internal review",
    type: "INTERNAL",
    mode: "SEQUENTIAL",
    requiredCount: 1,
    status: "ACTIVE",
    dueAt: null,
    completedAt: null,
    approvers: [],
    ...overrides,
  };
}

function run(stages: ReviewRun["stages"]): ReviewRun {
  return { id: "run1", pipelineName: "Default", status: "ACTIVE", fileVersionId: "v1", stages };
}

describe("sideFromRole", () => {
  test("client roles map to CLIENT", () => {
    expect(sideFromRole("CLIENT_OWNER")).toBe("CLIENT");
    expect(sideFromRole("CLIENT_MEMBER")).toBe("CLIENT");
  });
  test("agency roles map to AGENCY", () => {
    expect(sideFromRole("AGENCY_MEMBER")).toBe("AGENCY");
    expect(sideFromRole("AGENCY_OWNER")).toBe("AGENCY");
    expect(sideFromRole("SUPER_ADMIN")).toBe("AGENCY");
  });
  test("share is GUEST regardless of role", () => {
    expect(sideFromRole("AGENCY_OWNER", true)).toBe("GUEST");
  });
});

describe("resolveCapabilities — the approve leak fix", () => {
  test("a random agency viewer who is NOT an approver does not get Approve during internal review", () => {
    const internal = stage({
      approvers: [{ userId: "lead", name: "Lead", required: true, approverOrder: 0 }],
    });
    const cap = resolveCapabilities({
      role: "AGENCY_MEMBER",
      userId: "someone-else",
      runs: [run([internal])],
      approvals: [],
    });
    expect(cap.decision.canApprove).toBe(false);
  });

  test("an assigned internal approver DOES get Approve during internal review", () => {
    const internal = stage({
      approvers: [{ userId: "lead", name: "Lead", required: true, approverOrder: 0 }],
    });
    const cap = resolveCapabilities({
      role: "AGENCY_MEMBER",
      userId: "lead",
      runs: [run([internal])],
      approvals: [],
    });
    expect(cap.decision.canApprove).toBe(true);
    expect(cap.decision.requiresESignature).toBe(false);
  });

  test("agency never gets Approve while the active stage is the CLIENT stage", () => {
    const clientStage = stage({
      id: "stage_client",
      type: "CLIENT",
      approvers: [{ userId: "client1", name: "Client", required: true, approverOrder: 0 }],
    });
    const cap = resolveCapabilities({
      role: "AGENCY_MEMBER",
      userId: "lead",
      runs: [run([clientStage])],
      approvals: [],
    });
    expect(cap.decision.canApprove).toBe(false);
  });

  test("the client approver gets Approve with e-signature during client review", () => {
    const clientStage = stage({
      id: "stage_client",
      type: "CLIENT",
      approvers: [{ userId: "client1", name: "Client", required: true, approverOrder: 0 }],
    });
    const cap = resolveCapabilities({
      role: "CLIENT_OWNER",
      userId: "client1",
      runs: [run([clientStage])],
      approvals: [],
    });
    expect(cap.decision.canApprove).toBe(true);
    expect(cap.decision.requiresESignature).toBe(true);
  });

  test("SEQUENTIAL: a later approver cannot decide before the earlier one", () => {
    const internal = stage({
      mode: "SEQUENTIAL",
      requiredCount: 2,
      approvers: [
        { userId: "lead", name: "Lead", required: true, approverOrder: 0 },
        { userId: "senior", name: "Senior", required: true, approverOrder: 1 },
      ],
    });
    const second = resolveCapabilities({
      role: "AGENCY_MEMBER",
      userId: "senior",
      runs: [run([internal])],
      approvals: [],
    });
    expect(second.decision.canApprove).toBe(false); // not their turn yet
    const first = resolveCapabilities({
      role: "AGENCY_MEMBER",
      userId: "lead",
      runs: [run([internal])],
      approvals: [],
    });
    expect(first.decision.canApprove).toBe(true);
  });

  test("PARALLEL: any listed approver who hasn't decided can decide", () => {
    const internal = stage({
      mode: "PARALLEL",
      requiredCount: 2,
      approvers: [
        { userId: "lead", name: "Lead", required: true, approverOrder: 0 },
        { userId: "senior", name: "Senior", required: true, approverOrder: 1 },
      ],
    });
    const cap = resolveCapabilities({
      role: "AGENCY_MEMBER",
      userId: "senior",
      runs: [run([internal])],
      approvals: [],
    });
    expect(cap.decision.canApprove).toBe(true);
  });

  test("an approver who already decided does not get a second Approve", () => {
    const internal = stage({
      mode: "PARALLEL",
      requiredCount: 2,
      approvers: [
        { userId: "lead", name: "Lead", required: true, approverOrder: 0 },
        { userId: "senior", name: "Senior", required: true, approverOrder: 1 },
      ],
    });
    const approvals: Approval[] = [
      {
        id: "a1",
        reviewStageId: "stage_internal",
        decision: "APPROVE",
        feedback: null,
        eSignature: null,
        signatureConsentText: null,
        signatureConsentVersion: null,
        requestIp: null,
        requestUserAgent: null,
        decidedAt: new Date().toISOString(),
        decidedByUserId: "lead",
      },
    ];
    const cap = resolveCapabilities({
      role: "AGENCY_MEMBER",
      userId: "lead",
      runs: [run([internal])],
      approvals,
    });
    expect(cap.decision.canApprove).toBe(false);
  });

  test("degenerate default chain (no named approvers): side-match + permission gates Approve", () => {
    const internal = stage({ approvers: [] });
    const agency = resolveCapabilities({
      role: "AGENCY_MEMBER",
      userId: "anyone",
      runs: [run([internal])],
      approvals: [],
      canApprovePermission: true,
    });
    expect(agency.decision.canApprove).toBe(true);
    const noPerm = resolveCapabilities({
      role: "AGENCY_MEMBER",
      userId: "anyone",
      runs: [run([internal])],
      approvals: [],
      canApprovePermission: false,
    });
    expect(noPerm.decision.canApprove).toBe(false);
  });

  test("no active stage → no decision available", () => {
    const cap = resolveCapabilities({
      role: "AGENCY_MEMBER",
      userId: "lead",
      runs: [run([stage({ status: "PASSED" })])],
      approvals: [],
    });
    expect(cap.decision.canApprove).toBe(false);
    expect(cap.activeStage).toBeNull();
  });

  test("guests never get decision actions", () => {
    const clientStage = stage({ type: "CLIENT", approvers: [] });
    const cap = resolveCapabilities({
      role: "CLIENT_OWNER",
      userId: "guest-local",
      isShare: true,
      runs: [run([clientStage])],
      approvals: [],
    });
    expect(cap.side).toBe("GUEST");
    expect(cap.decision.canApprove).toBe(false);
  });
});
