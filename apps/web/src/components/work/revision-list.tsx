import { Check, Circle, Clock3, ExternalLink, LoaderCircle, SquareCheckBig } from "lucide-react";

export type RevisionTask = {
  id: string;
  title: string;
  status: "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE";
  assignedToUserId: string | null;
  assigneeName: string | null;
  dueDate: string | null;
  sourceComment: {
    id: string;
    fileVersionId: string | null;
    anchorType: string;
    anchor: Record<string, unknown> | null;
  } | null;
};

export function RevisionList({
  tasks,
  pending,
  onToggle,
  onJump,
}: {
  tasks: RevisionTask[];
  pending?: boolean;
  onToggle(task: RevisionTask): void;
  onJump(task: RevisionTask): void;
}) {
  const open = tasks.filter((task) => task.status !== "DONE").length;
  return (
    <section className="revision-list panel">
      <div className="panel__heading">
        <div>
          <span className="rx-eyebrow">Revisions from feedback</span>
          <h2>{open} open</h2>
        </div>
        <SquareCheckBig size={17} />
      </div>
      {pending ? (
        <div className="revision-list__empty">
          <LoaderCircle className="spin" size={18} /> Loading revisions
        </div>
      ) : tasks.length ? (
        <div>
          {tasks.map((task) => (
            <article id={`task-${task.id}`} key={task.id} data-done={task.status === "DONE"}>
              <button
                type="button"
                className="revision-list__check"
                onClick={() => onToggle(task)}
                aria-label={task.status === "DONE" ? "Reopen revision" : "Complete revision"}
              >
                {task.status === "DONE" ? <Check size={14} /> : <Circle size={14} />}
              </button>
              <button type="button" className="revision-list__body" onClick={() => onJump(task)}>
                <strong>{task.title}</strong>
                <span>
                  {task.assigneeName ?? "Unassigned"}
                  {task.dueDate ? (
                    <>
                      {" "}
                      · <Clock3 size={11} /> {new Date(task.dueDate).toLocaleDateString()}
                    </>
                  ) : null}
                </span>
              </button>
              {task.sourceComment ? <ExternalLink size={13} /> : null}
            </article>
          ))}
        </div>
      ) : (
        <div className="revision-list__empty">
          <SquareCheckBig size={18} /> Convert a review comment to track it here.
        </div>
      )}
    </section>
  );
}
