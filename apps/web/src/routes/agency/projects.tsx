import { Button, Callout, EmptyState, SegmentedControl, Skeleton, StatusChip } from "@rexops/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { FolderKanban, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { AgencyShell } from "../../components/app-shell";
import { FormDialog } from "../../components/ui/form-dialog";
import { PageHeader } from "../../components/ui/page-header";
import { request } from "../../lib/request";
import type { ClientRecord, DeliverableRecord, ProjectRecord } from "../../lib/types";

const ACTIVE_STATUSES = new Set(["DRAFT", "ACTIVE", "IN_PROGRESS", "WAITING_FOR_CLIENT"]);

/** Whole days from today to the due date; negative once it has passed. */
function daysUntil(dueDate: string | null) {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return null;
  const midnight = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.round((midnight(due) - midnight(new Date())) / 86_400_000);
}

/*
 * The date block used to say "DUE" over every project, including the ones already
 * past it — a slate of overdue work looked exactly like a slate of healthy work.
 */
function dueHeading(dueDate: string | null) {
  const days = daysUntil(dueDate);
  if (days === null) return "NO DATE";
  if (days < 0) return "OVERDUE";
  if (days === 0) return "TODAY";
  return "DUE";
}

function dueTone(dueDate: string | null) {
  const days = daysUntil(dueDate);
  if (days === null) return "none";
  if (days < 0) return "late";
  if (days <= 2) return "soon";
  return "later";
}

type SortKey = "DUE" | "NAME";
type Scope = "active" | "all";

/** Priorities are stored as enums and were printed raw. Each one says what it
 * means for the people doing the work, not just how loud it is. */
const PRIORITY_OPTIONS = [
  { value: "LOW", label: "Low", hint: "Fit it in around everything else" },
  { value: "MEDIUM", label: "Medium", hint: "Normal turnaround" },
  { value: "HIGH", label: "High", hint: "Ahead of normal work" },
  { value: "URGENT", label: "Urgent", hint: "Drop other work for this" },
];

export function ProjectsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const search = useSearch({ strict: false }) as { client?: string; new?: string };
  const [scope, setScope] = useState<Scope>("active");
  const [sort, setSort] = useState<SortKey>("DUE");
  const [creating, setCreating] = useState(search.new === "1");

  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => request<ProjectRecord[]>("/api/projects"),
  });
  const clients = useQuery({
    queryKey: ["clients"],
    queryFn: () => request<ClientRecord[]>("/api/clients"),
  });
  const deliverables = useQuery({
    queryKey: ["deliverables"],
    queryFn: () => request<DeliverableRecord[]>("/api/deliverables"),
  });

  const createProject = useMutation({
    mutationFn: (values: Record<string, string>) =>
      request<ProjectRecord>("/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name: values.name,
          clientId: values.clientId,
          type: values.type,
          priority: values.priority ?? "MEDIUM",
          dueDate: values.dueDate ? new Date(values.dueDate).toISOString() : undefined,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      closeDialog();
    },
  });

  function closeDialog() {
    createProject.reset();
    setCreating(false);
    if (search.new)
      navigate({ to: "/agency/projects", search: search.client ? { client: search.client } : {} });
  }

  const clientName = useMemo(() => {
    const map = new Map<string, string>();
    for (const client of clients.data ?? []) map.set(client.id, client.name);
    return map;
  }, [clients.data]);

  const rows = useMemo(() => {
    let list = projects.data ?? [];
    if (search.client) list = list.filter((project) => project.clientId === search.client);
    if (scope === "active") list = list.filter((project) => ACTIVE_STATUSES.has(project.status));
    return [...list].sort((a, b) => {
      if (sort === "NAME") return a.name.localeCompare(b.name);
      // Undated projects sort last so the dated slate stays on top.
      if (!a.dueDate && !b.dueDate) return a.name.localeCompare(b.name);
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });
  }, [projects.data, search.client, scope, sort]);

  const countsFor = (projectId: string) => {
    const own = (deliverables.data ?? []).filter((item) => item.projectId === projectId);
    const done = own.filter((item) => item.status === "APPROVED").length;
    return { total: own.length, done };
  };

  const filteredClientName = search.client ? clientName.get(search.client) : undefined;
  const noClients = !clients.isPending && !clients.data?.length;
  const closedCount = (projects.data ?? []).filter(
    (project) => !ACTIVE_STATUSES.has(project.status),
  ).length;

  return (
    <AgencyShell>
      <PageHeader
        crumbs={
          filteredClientName
            ? [
                { label: "Clients", to: "/agency/clients" },
                { label: filteredClientName },
                { label: "Projects" },
              ]
            : undefined
        }
        eyebrow="What you are working on"
        title={filteredClientName ? `Projects for ${filteredClientName}` : "Projects"}
        purpose="A project is one job for one client — a campaign, a retainer month, a launch. The deliverables that get reviewed live inside it."
        help={
          <>
            <p>
              Projects hold deliverables. A deliverable is the single thing that gets reviewed and
              approved: one cut, one key visual, one edit.
            </p>
            <p>
              Every project belongs to exactly one client, which is why a client has to exist before
              a project can.
            </p>
          </>
        }
        primary={
          /* This used to be a disabled "New project" button whenever the workspace
             had no clients, with nothing saying why it was dead. The button is now
             the thing you actually need to do first. */
          noClients ? (
            <Link
              className="rx-button rx-button--primary"
              to="/agency/clients"
              search={{ new: "1" }}
            >
              <Plus size={16} /> Add a client first
            </Link>
          ) : (
            <Button onClick={() => setCreating(true)}>
              <Plus size={16} /> Create a project
            </Button>
          )
        }
      />

      {noClients ? (
        <Callout tone="info" title="A project needs a client to belong to">
          Add the company you are doing this work for, then come back and create the project. It
          takes one field.
        </Callout>
      ) : null}

      <div className="list-toolbar">
        <SegmentedControl<Scope>
          label="Show"
          value={scope}
          onChange={setScope}
          options={[
            { value: "active", label: "Open", hint: "Projects still being worked on" },
            {
              value: "all",
              label: `All${closedCount ? ` (${closedCount} closed)` : ""}`,
              hint: "Includes completed and archived projects",
            },
          ]}
        />
        <SegmentedControl<SortKey>
          label="Sort by"
          value={sort}
          onChange={setSort}
          options={[
            { value: "DUE", label: "Soonest due", hint: "Undated projects go last" },
            { value: "NAME", label: "Name", hint: "A to Z" },
          ]}
        />
        {search.client ? (
          <button type="button" onClick={() => navigate({ to: "/agency/projects", search: {} })}>
            Show every client's projects
          </button>
        ) : null}
      </div>

      {projects.isPending ? (
        <section className="panel">
          <Skeleton lines={5} label="Loading projects" />
        </section>
      ) : projects.isError ? (
        <Callout tone="danger" title="Projects did not load">
          {(projects.error as Error).message}
          <div className="rx-callout__action">
            <Button variant="secondary" onClick={() => projects.refetch()}>
              Try loading projects again
            </Button>
          </div>
        </Callout>
      ) : !rows.length ? (
        <EmptyState
          icon={<FolderKanban size={22} />}
          title={
            noClients
              ? "No projects yet"
              : scope === "active" && closedCount
                ? "Nothing is open right now"
                : filteredClientName
                  ? `No projects for ${filteredClientName}`
                  : "No projects yet"
          }
          body={
            noClients
              ? "Projects belong to a client, and this workspace does not have one yet. Add a client, then create the project."
              : scope === "active" && closedCount
                ? `Every project here is completed or archived. Switch to "All" to look back over the ${closedCount} closed one${closedCount === 1 ? "" : "s"}.`
                : "A project is one job for one client. Create it, then add the deliverables that need reviewing."
          }
          action={
            noClients ? (
              <Link
                className="rx-button rx-button--primary"
                to="/agency/clients"
                search={{ new: "1" }}
              >
                Add your first client
              </Link>
            ) : scope === "active" && closedCount ? (
              <Button variant="secondary" onClick={() => setScope("all")}>
                Show closed projects
              </Button>
            ) : (
              <Button onClick={() => setCreating(true)}>
                <Plus size={16} /> Create a project
              </Button>
            )
          }
        />
      ) : null}

      <section className="project-list">
        {rows.map((project) => {
          const counts = countsFor(project.id);
          const progress = counts.total ? Math.round((counts.done / counts.total) * 100) : 0;
          return (
            <article className="project-row" key={project.id}>
              <div className="project-date" data-tone={dueTone(project.dueDate)}>
                <span>{dueHeading(project.dueDate)}</span>
                <strong className="rx-mono">
                  {project.dueDate
                    ? new Date(project.dueDate)
                        .toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
                        .toUpperCase()
                    : "—"}
                </strong>
              </div>
              <div className="project-copy">
                <StatusChip status={project.status} />
                <h2>{project.name}</h2>
                <p>{clientName.get(project.clientId) ?? "Unassigned client"}</p>
              </div>
              <div className="project-progress">
                <div>
                  <span>Deliverables</span>
                  <b className="rx-mono">
                    {counts.done} / {counts.total}
                  </b>
                </div>
                <i>
                  <b style={{ width: `${progress}%` }} />
                </i>
              </div>
              <button
                type="button"
                onClick={() =>
                  navigate({
                    to: "/agency/projects/$projectId",
                    params: { projectId: project.id },
                  })
                }
              >
                Open project
              </button>
            </article>
          );
        })}
      </section>

      {rows.length ? (
        <div className="list-footnote">
          <FolderKanban size={15} /> Showing {rows.length} of {projects.data?.length ?? 0} project
          {(projects.data?.length ?? 0) === 1 ? "" : "s"}
          {filteredClientName ? ` for ${filteredClientName}` : ""}
        </div>
      ) : null}

      {creating ? (
        <FormDialog
          title="Create a project"
          description="A project is one job for one client. It holds the deliverables that go to review."
          submitLabel="Create project"
          pendingLabel="Creating project…"
          pending={createProject.isPending}
          error={createProject.error ? (createProject.error as Error).message : null}
          footnote="Creating a project does not notify the client. They see work only once a deliverable is sent for their review."
          fields={[
            {
              name: "name",
              label: "Project name",
              required: true,
              placeholder: "July retainer",
              hint: "What your team will call it in lists and in the review room.",
            },
            {
              name: "clientId",
              label: "Client this is for",
              type: "select",
              required: true,
              defaultValue: search.client,
              hint: "A project belongs to exactly one client and cannot be moved later.",
              options: (clients.data ?? []).map((client) => ({
                value: client.id,
                label: client.name,
              })),
            },
            {
              name: "type",
              label: "Kind of work",
              placeholder: "Social media retainer",
              hint: "Free text, for your own reporting. Nothing in the app behaves differently.",
            },
            {
              name: "priority",
              label: "Priority",
              type: "select",
              defaultValue: "MEDIUM",
              hint: "How this project sorts against the rest of the slate. Medium is the normal choice.",
              options: PRIORITY_OPTIONS,
            },
            {
              name: "dueDate",
              label: "Due date",
              type: "date",
              hint: "When the whole project is due. Deliverables can have their own dates inside it.",
            },
          ]}
          onSubmit={(values) => createProject.mutate(values)}
          onClose={closeDialog}
        />
      ) : null}
    </AgencyShell>
  );
}
