export type StageDecision = "APPROVE" | "REQUEST_CHANGES" | "REJECT";
export type ReviewStageShape = {
  mode: "SEQUENTIAL" | "PARALLEL";
  requiredCount: number;
};

export function evaluateStage(
  stage: ReviewStageShape,
  decisions: readonly StageDecision[],
): "ACTIVE" | "PASSED" | "REJECTED" {
  if (decisions.includes("REJECT") || decisions.includes("REQUEST_CHANGES")) return "REJECTED";
  const approvals = decisions.filter((decision) => decision === "APPROVE").length;
  if (stage.mode === "SEQUENTIAL") return approvals >= 1 ? "PASSED" : "ACTIVE";
  return approvals >= stage.requiredCount ? "PASSED" : "ACTIVE";
}
