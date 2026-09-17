import { describe, expect, test } from "bun:test";
import { canTransition, evaluateStage, transitionDeliverable } from "../index";

describe("deliverable state machine", () => {
  test("supports T1 and rejects invalid skips", () => {
    expect(transitionDeliverable("PENDING", "IN_PROGRESS")).toBe("IN_PROGRESS");
    expect(canTransition("PENDING", "APPROVED")).toBe(false);
    expect(() => transitionDeliverable("PENDING", "APPROVED")).toThrow(
      "Cannot transition deliverable",
    );
  });

  test("supports the revision loop", () => {
    expect(canTransition("UNDER_CLIENT_REVIEW", "REVISION_REQUESTED")).toBe(true);
    expect(canTransition("REVISION_REQUESTED", "READY_FOR_INTERNAL_REVIEW")).toBe(true);
  });

  test("evaluates sequential and parallel stages", () => {
    expect(evaluateStage({ mode: "SEQUENTIAL", requiredCount: 1 }, ["APPROVE"])).toBe("PASSED");
    expect(evaluateStage({ mode: "PARALLEL", requiredCount: 2 }, ["APPROVE"])).toBe("ACTIVE");
    expect(evaluateStage({ mode: "PARALLEL", requiredCount: 2 }, ["APPROVE", "APPROVE"])).toBe(
      "PASSED",
    );
    expect(evaluateStage({ mode: "PARALLEL", requiredCount: 2 }, ["REJECT"])).toBe("REJECTED");
  });
});
