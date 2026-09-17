import { Button, Select } from "@rexops/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Check,
  CircleAlert,
  Copy,
  Plus,
  Save,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import { useState } from "react";
import { AgencyShell } from "../../components/app-shell";
import { PageHeader } from "../../components/ui/page-header";
import { request } from "../../lib/request";

type User = { id: string; name: string; role: string; specialty: string | null };
type Pipeline = {
  id: string;
  name: string;
  isDefault: boolean;
  stages: Array<{
    id: string;
    name: string;
    type: "INTERNAL" | "CLIENT";
    mode: "SEQUENTIAL" | "PARALLEL";
    requiredCount: number;
    slaHours: number | null;
    escalateToUserId: string | null;
    approvers: Array<{ userId: string; required: boolean }>;
  }>;
};
type DraftStage = {
  id: string;
  name: string;
  type: "INTERNAL" | "CLIENT";
  mode: "SEQUENTIAL" | "PARALLEL";
  requiredCount: number;
  slaHours: number;
  escalateToUserId: string;
  approverIds: string[];
};

const AUDIENCE = [
  { value: "INTERNAL", label: "Internal team", hint: "agency" },
  { value: "CLIENT", label: "Client", hint: "external" },
];

const MODE = [
  { value: "PARALLEL", label: "Everyone at once" },
  { value: "SEQUENTIAL", label: "One after another" },
];

const SLA = [
  { value: "8", label: "8 hours" },
  { value: "24", label: "1 working day" },
  { value: "48", label: "2 working days" },
  { value: "72", label: "3 working days" },
  { value: "168", label: "1 week" },
];

const blankStage = (index: number): DraftStage => ({
  id: crypto.randomUUID(),
  name: index === 0 ? "Internal review" : "Client approval",
  type: index === 0 ? "INTERNAL" : "CLIENT",
  mode: index === 0 ? "PARALLEL" : "SEQUENTIAL",
  requiredCount: 1,
  slaHours: index === 0 ? 24 : 48,
  escalateToUserId: "",
  approverIds: [],
});

function slaLabel(hours: number) {
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1 day" : days === 7 ? "1 week" : `${days} days`;
}

/**
 * One line of plain English describing what a stage will actually do. The grid of
 * dropdowns above it is precise but not readable; this is the sentence someone can
 * check against what they meant.
 */
function stageSummary(stage: DraftStage, names: Map<string, string>) {
  const audience = stage.type === "CLIENT" ? "the client" : "the internal team";
  const count = stage.approverIds.length;
  if (!count) return `Waits on ${audience}, but nobody is assigned to approve it yet.`;
  const quorum = Math.min(stage.requiredCount, count);
  const who =
    count === 1
      ? (names.get(stage.approverIds[0] ?? "") ?? "one approver")
      : quorum >= count
        ? `all ${count} approvers`
        : `any ${quorum} of ${count} approvers`;
  const order = stage.mode === "SEQUENTIAL" && count > 1 ? ", asked one after another" : "";
  return `Needs ${who} from ${audience}${order}. Escalates after ${slaLabel(stage.slaHours)}.`;
}

export function PipelineEditorPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("Motion — standard");
  const [isDefault, setIsDefault] = useState(false);
  const [stages, setStages] = useState<DraftStage[]>([blankStage(0), blankStage(1)]);
  const pipelines = useQuery({
    queryKey: ["review-pipelines"],
    queryFn: () => request<Pipeline[]>("/api/reviews/pipelines"),
  });
  const users = useQuery({
    queryKey: ["review-users"],
    queryFn: () => request<User[]>("/api/reviews/users"),
  });
  const save = useMutation({
    mutationFn: () =>
      request("/api/reviews/pipelines", {
        method: "POST",
        body: JSON.stringify({
          name,
          isDefault,
          stages: stages.map((stage) => ({
            name: stage.name,
            type: stage.type,
            mode: stage.mode,
            requiredCount: Math.max(
              1,
              Math.min(stage.requiredCount, stage.approverIds.length || 1),
            ),
            slaHours: stage.slaHours,
            escalateToUserId: stage.escalateToUserId || undefined,
            approvers: stage.approverIds.map((userId) => ({ userId, required: true })),
          })),
        }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["review-pipelines"] }),
  });

  const userName = new Map((users.data ?? []).map((user) => [user.id, user.name]));

  function patchStage(id: string, next: Partial<DraftStage>) {
    setStages((rows) => rows.map((row) => (row.id === id ? { ...row, ...next } : row)));
    save.reset();
  }

  function moveStage(index: number, direction: -1 | 1) {
    setStages((rows) => {
      const target = index + direction;
      if (target < 0 || target >= rows.length) return rows;
      const next = [...rows];
      const current = next[index];
      const swap = next[target];
      if (!current || !swap) return rows;
      next[index] = swap;
      next[target] = current;
      return next;
    });
    save.reset();
  }

  function loadFrom(pipeline: Pipeline) {
    setName(`${pipeline.name} copy`);
    setIsDefault(false);
    setStages(
      pipeline.stages.map((stage) => ({
        id: crypto.randomUUID(),
        name: stage.name,
        type: stage.type,
        mode: stage.mode,
        requiredCount: stage.requiredCount,
        slaHours: stage.slaHours ?? 24,
        escalateToUserId: stage.escalateToUserId ?? "",
        approverIds: stage.approvers.map((approver) => approver.userId),
      })),
    );
    save.reset();
  }

  const unassigned = stages.filter((stage) => !stage.approverIds.length).length;

  return (
    <AgencyShell>
      <PageHeader
        /* The sidebar calls this "Review stages" and the page called itself
           "Approval pipelines", so clicking the link landed you somewhere that
           looked like a different screen. The heading now matches the link, and
           the word "pipeline" is introduced rather than assumed. */
        crumbs={[{ label: "Settings", to: "/agency/settings" }, { label: "Review stages" }]}
        eyebrow="How work gets approved"
        title="Review stages"
        purpose="The ordered list of approvals a piece of work has to clear before it can go out. A saved set of stages is called a pipeline, and deliverables follow one from the moment they are sent for review."
        help={
          <>
            <p>
              Each stage names who has to approve and whether they go one after another or all at
              once. Internal stages are your own team; a client stage is the point where the work
              becomes visible to the client.
            </p>
            <p>
              Editing a pipeline only affects work submitted after you save. Reviews already running
              keep the stages they started with, so nothing in flight changes under anyone.
            </p>
          </>
        }
        primary={
          <Button disabled={save.isPending || !stages.length} onClick={() => save.mutate()}>
            <Save size={15} /> {save.isPending ? "Saving this pipeline…" : "Save this pipeline"}
          </Button>
        }
      />

      <div className="pipeline-layout">
        <aside className="panel pipeline-library">
          <div className="panel__heading">
            <div>
              <span className="rx-eyebrow">Saved pipelines</span>
              <h2>{pipelines.data?.length ?? 0} in the library</h2>
            </div>
          </div>
          <div className="pipeline-library__list">
            {pipelines.data?.length ? (
              pipelines.data.map((pipeline) => (
                <article key={pipeline.id}>
                  <div>
                    <strong>{pipeline.name}</strong>
                    <span>
                      {pipeline.stages.length} stage{pipeline.stages.length === 1 ? "" : "s"}
                      {pipeline.isDefault ? (
                        <b>
                          <Star size={10} /> default
                        </b>
                      ) : null}
                    </span>
                  </div>
                  <button type="button" onClick={() => loadFrom(pipeline)}>
                    <Copy size={13} /> Duplicate
                  </button>
                </article>
              ))
            ) : (
              <p className="pipeline-library__empty">
                Nothing saved yet. The draft on the right becomes your first pipeline.
              </p>
            )}
          </div>
          <button
            type="button"
            className="pipeline-library__new"
            onClick={() => {
              setName("New pipeline");
              setIsDefault(false);
              setStages([blankStage(0), blankStage(1)]);
              save.reset();
            }}
          >
            <Plus size={13} /> Start a blank pipeline
          </button>
        </aside>

        <section className="panel pipeline-editor">
          <div className="pipeline-editor__head">
            <div className="pipeline-field">
              <label htmlFor="pipeline-name">Pipeline name</label>
              <input
                id="pipeline-name"
                value={name}
                placeholder="Motion — standard"
                onChange={(event) => {
                  setName(event.target.value);
                  save.reset();
                }}
              />
              <em>What this route will be called when someone picks it for a deliverable.</em>
            </div>
            <label className="pipeline-default">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(event) => {
                  setIsDefault(event.target.checked);
                  save.reset();
                }}
              />
              <span>
                Use for new deliverables
                <em>Applied automatically unless another pipeline is chosen.</em>
              </span>
            </label>
          </div>

          <p className="pipeline-note">
            Editing here only affects deliverables submitted from now on. Reviews already running
            keep the stages they started with.
          </p>

          <ol className="stage-editor-list">
            {stages.map((stage, index) => (
              <li key={stage.id}>
                <article>
                  <header>
                    <span className="stage-index">Stage {index + 1}</span>
                    <input
                      aria-label={`Stage ${index + 1} name`}
                      className="stage-name"
                      value={stage.name}
                      onChange={(event) => patchStage(stage.id, { name: event.target.value })}
                    />
                    <div className="stage-order">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => moveStage(index, -1)}
                        aria-label={`Move ${stage.name} earlier`}
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        type="button"
                        disabled={index === stages.length - 1}
                        onClick={() => moveStage(index, 1)}
                        aria-label={`Move ${stage.name} later`}
                      >
                        <ArrowDown size={14} />
                      </button>
                      <button
                        type="button"
                        className="stage-remove"
                        disabled={stages.length === 1}
                        aria-label={`Remove ${stage.name}`}
                        onClick={() => {
                          setStages((rows) => rows.filter((row) => row.id !== stage.id));
                          save.reset();
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </header>

                  <p
                    className="stage-summary"
                    data-warn={stage.approverIds.length ? undefined : true}
                  >
                    {stage.approverIds.length ? null : <CircleAlert size={13} aria-hidden="true" />}
                    {stageSummary(stage, userName)}
                  </p>

                  <div className="stage-editor-grid">
                    <div className="pipeline-field">
                      <label htmlFor={`${stage.id}-audience`}>Who reviews it</label>
                      <Select
                        id={`${stage.id}-audience`}
                        value={stage.type}
                        options={AUDIENCE}
                        onChange={(value) =>
                          patchStage(stage.id, { type: value as DraftStage["type"] })
                        }
                      />
                    </div>
                    <div className="pipeline-field">
                      <label htmlFor={`${stage.id}-mode`}>How they are asked</label>
                      <Select
                        id={`${stage.id}-mode`}
                        value={stage.mode}
                        options={MODE}
                        onChange={(value) =>
                          patchStage(stage.id, { mode: value as DraftStage["mode"] })
                        }
                      />
                    </div>
                    <div className="pipeline-field">
                      <label htmlFor={`${stage.id}-quorum`}>Approvals needed</label>
                      <Select
                        id={`${stage.id}-quorum`}
                        value={String(Math.min(stage.requiredCount, stage.approverIds.length || 1))}
                        options={Array.from(
                          { length: Math.max(1, stage.approverIds.length) },
                          (_, count) => ({
                            value: String(count + 1),
                            label:
                              count + 1 === stage.approverIds.length && stage.approverIds.length > 1
                                ? `All ${count + 1}`
                                : `${count + 1}`,
                          }),
                        )}
                        onChange={(value) => patchStage(stage.id, { requiredCount: Number(value) })}
                      />
                    </div>
                    <div className="pipeline-field">
                      <label htmlFor={`${stage.id}-sla`}>Chase after</label>
                      <Select
                        id={`${stage.id}-sla`}
                        value={String(stage.slaHours)}
                        options={
                          SLA.some((option) => option.value === String(stage.slaHours))
                            ? SLA
                            : [
                                ...SLA,
                                { value: String(stage.slaHours), label: `${stage.slaHours} hours` },
                              ]
                        }
                        onChange={(value) => patchStage(stage.id, { slaHours: Number(value) })}
                      />
                    </div>
                    <div className="pipeline-field pipeline-field--wide">
                      <label htmlFor={`${stage.id}-escalate`}>If nobody responds, tell</label>
                      <Select
                        id={`${stage.id}-escalate`}
                        value={stage.escalateToUserId}
                        placeholder="Nobody — just keep waiting"
                        options={[
                          { value: "", label: "Nobody — just keep waiting" },
                          ...(users.data ?? []).map((user) => ({
                            value: user.id,
                            label: user.name,
                            hint: user.specialty ?? user.role,
                          })),
                        ]}
                        onChange={(value) => patchStage(stage.id, { escalateToUserId: value })}
                      />
                    </div>
                  </div>

                  <fieldset className="stage-approvers">
                    <legend>
                      <Users size={13} aria-hidden="true" /> Approvers
                      <em>
                        {stage.mode === "SEQUENTIAL"
                          ? "Asked in the order you pick them."
                          : "All asked at the same time."}
                      </em>
                    </legend>
                    <div>
                      {users.data?.map((user) => {
                        const position = stage.approverIds.indexOf(user.id);
                        return (
                          <label key={user.id} data-picked={position >= 0 || undefined}>
                            <input
                              type="checkbox"
                              checked={position >= 0}
                              onChange={(event) =>
                                patchStage(stage.id, {
                                  approverIds: event.target.checked
                                    ? [...stage.approverIds, user.id]
                                    : stage.approverIds.filter((id) => id !== user.id),
                                })
                              }
                            />
                            {position >= 0 && stage.mode === "SEQUENTIAL" ? (
                              <b className="rx-mono">{position + 1}</b>
                            ) : position >= 0 ? (
                              <Check size={12} aria-hidden="true" />
                            ) : null}
                            {user.name}
                            <small>{user.specialty ?? user.role}</small>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                </article>
              </li>
            ))}
          </ol>

          <button
            type="button"
            className="stage-add"
            onClick={() => {
              setStages((rows) => [...rows, blankStage(rows.length)]);
              save.reset();
            }}
          >
            <Plus size={15} aria-hidden="true" /> Add another stage
          </button>

          <footer className="pipeline-editor__foot">
            {save.isError ? (
              <p className="pipeline-status" data-tone="error">
                <CircleAlert size={14} aria-hidden="true" /> {save.error.message}
              </p>
            ) : save.isSuccess ? (
              <p className="pipeline-status" data-tone="ok">
                <Check size={14} aria-hidden="true" /> Saved. New submissions will use it.
              </p>
            ) : unassigned ? (
              <p className="pipeline-status" data-tone="warn">
                <CircleAlert size={14} aria-hidden="true" /> {unassigned} stage
                {unassigned === 1 ? "" : "s"} still have nobody assigned to approve.
              </p>
            ) : (
              <p className="pipeline-status">
                {stages.length} stage{stages.length === 1 ? "" : "s"} · ready to save.
              </p>
            )}
          </footer>
        </section>
      </div>
    </AgencyShell>
  );
}
