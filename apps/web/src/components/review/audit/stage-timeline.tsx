import { AlertTriangle, Check, Clock3, PenLine, ShieldCheck, X } from "lucide-react";
import { titleCase } from "../../../lib/format";

type Approval = {
  id: string;
  reviewStageId: string | null;
  decision: "APPROVE" | "REQUEST_CHANGES" | "REJECT";
  feedback: string | null;
  eSignature: string | null;
  signatureConsentText: string | null;
  signatureConsentVersion: string | null;
  requestIp: string | null;
  requestUserAgent: string | null;
  decidedAt: string;
  decidedByUserId: string;
  decidedByName?: string;
};

type ReviewRun = {
  id: string;
  pipelineName: string;
  status: string;
  fileVersionId: string;
  stages: Array<{
    id: string;
    name: string;
    type: "INTERNAL" | "CLIENT";
    mode: "SEQUENTIAL" | "PARALLEL";
    requiredCount: number;
    status: string;
    dueAt: string | null;
    completedAt: string | null;
    approvers: Array<{
      userId: string;
      name: string;
      required: boolean;
      approverOrder: number;
    }>;
  }>;
};

export function StageTimeline({ runs, approvals }: { runs: ReviewRun[]; approvals: Approval[] }) {
  return (
    <div className="stage-timeline">
      {runs.map((run) => (
        <section key={run.id}>
          <header>
            <span className="rx-eyebrow">{run.pipelineName}</span>
            <b>{titleCase(run.status)}</b>
          </header>
          {run.stages.map((stage) => {
            const decisions = approvals.filter((approval) => approval.reviewStageId === stage.id);
            const overdue =
              stage.status === "ACTIVE" && stage.dueAt && new Date(stage.dueAt) < new Date();
            return (
              <article key={stage.id} data-status={stage.status.toLowerCase()}>
                <div className="stage-timeline__stage">
                  <span>
                    {stage.status === "PASSED" ? (
                      <Check size={13} />
                    ) : stage.status === "REJECTED" ? (
                      <X size={13} />
                    ) : (
                      <Clock3 size={13} />
                    )}
                  </span>
                  <div>
                    <strong>{stage.name}</strong>
                    <small>
                      {titleCase(stage.type)} · {titleCase(stage.mode)} · quorum{" "}
                      {stage.requiredCount}
                    </small>
                  </div>
                  {overdue ? (
                    <b className="stage-overdue">
                      <AlertTriangle size={12} /> Overdue
                    </b>
                  ) : stage.dueAt ? (
                    <time>Due {new Date(stage.dueAt).toLocaleString()}</time>
                  ) : null}
                </div>
                <div className="stage-timeline__approvers">
                  {stage.approvers.map((approver) => {
                    const decision = decisions.find(
                      (approval) => approval.decidedByUserId === approver.userId,
                    );
                    return (
                      <div key={approver.userId}>
                        <ShieldCheck size={12} />
                        <span>{approver.name}</span>
                        <small>{approver.required ? "required" : "optional"}</small>
                        <b>{decision?.decision.replaceAll("_", " ").toLowerCase() ?? "awaiting"}</b>
                      </div>
                    );
                  })}
                  {!stage.approvers.length && decisions.length
                    ? decisions.map((decision) => (
                        <div key={decision.id}>
                          <ShieldCheck size={12} />
                          <span>{decision.decidedByName ?? "Approver"}</span>
                          <b>{titleCase(decision.decision)}</b>
                        </div>
                      ))
                    : null}
                </div>
                {decisions.map((decision) =>
                  decision.eSignature ? (
                    <div className="signature-record" key={decision.id}>
                      <PenLine size={15} />
                      <div>
                        <strong>{decision.eSignature}</strong>
                        <span>{decision.signatureConsentText}</span>
                        <small>
                          Consent {decision.signatureConsentVersion} ·{" "}
                          {new Date(decision.decidedAt).toLocaleString()}
                        </small>
                        <small>
                          IP {decision.requestIp ?? "not recorded"} ·{" "}
                          {decision.requestUserAgent ?? "user agent not recorded"}
                        </small>
                      </div>
                    </div>
                  ) : null,
                )}
              </article>
            );
          })}
        </section>
      ))}
      {!runs.length ? <p>No review run has started for this deliverable.</p> : null}
    </div>
  );
}

export type { Approval, ReviewRun };
