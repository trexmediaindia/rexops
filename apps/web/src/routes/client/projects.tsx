import {
  Button,
  Callout,
  EmptyState,
  HelpTip,
  SegmentedControl,
  Skeleton,
  StatusChip,
} from "@rexops/ui";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, CalendarClock, FolderKanban } from "lucide-react";
import { useState } from "react";
import { ClientShell } from "../../components/app-shell";
import {
  AWAITING_CLIENT,
  approvalProgress,
  daysUntil,
  formatDate,
  useClientWorkspace,
} from "../../lib/client-workspace";
import type { DeliverableRecord, ProjectRecord } from "../../lib/types";

const CLOSED = new Set(["COMPLETED", "ARCHIVED"]);

type Scope = "open" | "all";

export function ClientProjects() {
  const workspace = useClientWorkspace();
  /* This was a "Show them" / "Hide them" text button in the footnote, where the
     label named the click rather than the state, and it sat below the list it
     controlled. */
  const [scope, setScope] = useState<Scope>("open");

  // Sub-projects are shown under their parent rather than as peers, so the
  // client sees the same shape the agency organised the work in.
  const parents = workspace.projects.filter((project) => !project.parentProjectId);
  const children = new Map<string, ProjectRecord[]>();
  for (const project of workspace.projects) {
    if (!project.parentProjectId) continue;
    const bucket = children.get(project.parentProjectId);
    if (bucket) bucket.push(project);
    else children.set(project.parentProjectId, [project]);
  }

  const visible = parents.filter((project) =>
    scope === "all" ? true : !CLOSED.has(project.status),
  );
  const closedCount = parents.filter((project) => CLOSED.has(project.status)).length;

  return (
    <ClientShell>
      <div className="client-heading">
        <span className="rx-eyebrow">Your work</span>
        <h1>
          Projects
          <HelpTip label="Projects">
            <p>
              A project is one job your agency is doing for you — a campaign, a month of a retainer,
              a launch. Inside each one sit the individual pieces of work that come to you for
              approval.
            </p>
            <p>
              You cannot start or change a project here. This is the view of what your agency has in
              hand and how far through it is.
            </p>
          </HelpTip>
        </h1>
        <p>
          {visible.length
            ? `Everything your agency has in hand for you, and how much of each one you have already approved. ${visible.length} ${visible.length === 1 ? "project is" : "projects are"} open.`
            : "Everything your agency has in hand for you, and how much of each one you have already approved."}
        </p>
      </div>

      {closedCount ? (
        <div className="list-toolbar">
          <SegmentedControl<Scope>
            label="Show"
            value={scope}
            onChange={setScope}
            options={[
              { value: "open", label: "Open", hint: "Projects still being worked on" },
              {
                value: "all",
                label: `All (${closedCount} finished)`,
                hint: "Includes projects that are complete or archived",
              },
            ]}
          />
        </div>
      ) : null}

      {workspace.isLoading ? (
        <Skeleton lines={5} label="Loading your projects" />
      ) : workspace.error ? (
        <Callout tone="danger" title="Your projects did not load">
          {workspace.error.message}
          <div className="rx-callout__action">
            <Button variant="secondary" onClick={workspace.refetch}>
              Try loading them again
            </Button>
          </div>
        </Callout>
      ) : !visible.length ? (
        <EmptyState
          icon={<FolderKanban size={22} />}
          title={closedCount ? "Nothing is open right now" : "No projects yet"}
          body={
            closedCount
              ? `Every project on this account is finished. The ${closedCount} closed ${closedCount === 1 ? "one is" : "ones are"} still here to look back over.`
              : "Your agency has not started a project on this account yet. When they do, it appears here with its progress, and anything needing your approval turns up on the home page."
          }
          action={
            closedCount ? (
              <Button variant="secondary" onClick={() => setScope("all")}>
                Show finished projects
              </Button>
            ) : (
              <Link className="rx-button rx-button--secondary" to="/client/home">
                Go to what needs you
              </Link>
            )
          }
        />
      ) : (
        <div className="project-cards">
          {visible.map((project) => {
            const own = workspace.byProject.get(project.id) ?? [];
            const sub = children.get(project.id) ?? [];
            const all = [
              ...own,
              ...sub.flatMap((child) => workspace.byProject.get(child.id) ?? []),
            ];
            return (
              <ProjectCard
                key={project.id}
                project={project}
                subProjects={sub}
                deliverables={all}
              />
            );
          })}
        </div>
      )}

      {closedCount ? (
        <div className="list-footnote">
          <FolderKanban size={15} /> Showing {visible.length} of {parents.length} project
          {parents.length === 1 ? "" : "s"} · {closedCount} finished
        </div>
      ) : null}
    </ClientShell>
  );
}

function ProjectCard({
  project,
  subProjects,
  deliverables,
}: {
  project: ProjectRecord;
  subProjects: ProjectRecord[];
  deliverables: DeliverableRecord[];
}) {
  const progress = approvalProgress(deliverables);
  const waiting = deliverables.filter((item) => AWAITING_CLIENT.has(item.status));
  const remaining = daysUntil(project.dueDate);

  return (
    <article className="project-card">
      <header>
        <div>
          <h2>{project.name}</h2>
          {project.description ? <p>{project.description}</p> : null}
        </div>
        <StatusChip status={project.status} />
      </header>

      <div className="project-card__meter" aria-hidden="true">
        <i style={{ width: `${progress.percent}%` }} />
      </div>
      <p className="project-card__progress">
        <span className="rx-mono">
          {progress.approved}/{progress.total}
        </span>{" "}
        approved
        {subProjects.length
          ? ` · ${subProjects.length} workstream${subProjects.length === 1 ? "" : "s"}`
          : ""}
      </p>

      <dl className="project-card__facts">
        <div>
          <dt>Due</dt>
          <dd>
            {formatDate(project.dueDate)}
            {remaining !== null && remaining < 0 ? <em> · overdue</em> : null}
          </dd>
        </div>
        <div>
          <dt>Started</dt>
          <dd>{formatDate(project.startDate ?? project.createdAt)}</dd>
        </div>
      </dl>

      {waiting.length ? (
        <div className="project-card__waiting">
          <CalendarClock size={15} />
          <span>
            {waiting.length} {waiting.length === 1 ? "piece of work is" : "pieces of work are"}{" "}
            waiting on your decision
          </span>
          <Link className="rx-action rx-action--accent" to="/client/home">
            Review and decide <ArrowUpRight size={14} />
          </Link>
        </div>
      ) : null}
    </article>
  );
}
