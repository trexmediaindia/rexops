import { Button, Callout, EmptyState, SaveState, Select, Skeleton, StatusChip } from "@rexops/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { ArrowUpRight, CalendarDays, Layers, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { AgencyShell } from "../../components/app-shell";
import { FormDialog } from "../../components/ui/form-dialog";
import { PageHeader } from "../../components/ui/page-header";
import { titleCase } from "../../lib/format";
import { request } from "../../lib/request";
import type { ClientRecord, DeliverableRecord, ProjectRecord } from "../../lib/types";

/* The picker used to list the raw enum lowercased, so "waiting_for_client" and
   "archived" sat side by side with nothing saying what choosing one does. */
const PROJECT_STATUSES: Array<{ value: string; label: string; hint: string }> = [
  { value: "DRAFT", label: "Draft — not started yet", hint: "Being planned" },
  { value: "ACTIVE", label: "Active — work is under way", hint: "The normal state" },
  { value: "IN_PROGRESS", label: "In progress — mid-production", hint: "Same as active" },
  {
    value: "WAITING_FOR_CLIENT",
    label: "Waiting on the client",
    hint: "Parked until they come back",
  },
  { value: "COMPLETED", label: "Completed — everything is signed off", hint: "Closes the project" },
  { value: "ARCHIVED", label: "Archived — put away for good", hint: "Hidden from open lists" },
];

const CONTENT_TYPES = [
  { value: "MOTION", label: "Motion", hint: "Video, animation, anything with a timeline" },
  { value: "STATIC", label: "Static", hint: "Stills, key visuals, layouts" },
  { value: "OTHER", label: "Other", hint: "Copy decks, audio, anything else" },
];

const PRIORITIES = [
  { value: "LOW", label: "Low", hint: "Fit it in around everything else" },
  { value: "MEDIUM", label: "Medium", hint: "Normal turnaround" },
  { value: "HIGH", label: "High", hint: "Ahead of normal work" },
  { value: "URGENT", label: "Urgent", hint: "Drop other work for this" },
];

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value)
    .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    .toUpperCase();
}

export function ProjectDetailPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);

  const project = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => request<ProjectRecord>(`/api/projects/${projectId}`),
  });
  const clients = useQuery({
    queryKey: ["clients"],
    queryFn: () => request<ClientRecord[]>("/api/clients"),
  });
  const deliverables = useQuery({
    queryKey: ["deliverables"],
    queryFn: () => request<DeliverableRecord[]>("/api/deliverables"),
  });

  const rows = useMemo(
    () => (deliverables.data ?? []).filter((item) => item.projectId === projectId),
    [deliverables.data, projectId],
  );
  const clientName = clients.data?.find((client) => client.id === project.data?.clientId)?.name;
  const done = rows.filter((item) => item.status === "APPROVED").length;

  const createDeliverable = useMutation({
    mutationFn: (values: Record<string, string>) =>
      request<DeliverableRecord>("/api/deliverables", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          title: values.title,
          description: values.description,
          contentType: values.contentType ?? "OTHER",
          priority: values.priority ?? "MEDIUM",
          dueDate: values.dueDate ? new Date(values.dueDate).toISOString() : undefined,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deliverables"] });
      setCreating(false);
    },
  });

  const setStatus = useMutation({
    mutationFn: (status: string) =>
      request<ProjectRecord>(`/api/projects/${projectId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  return (
    <AgencyShell>
      <PageHeader
        crumbs={[
          { label: "Projects", to: "/agency/projects" },
          { label: project.data?.name ?? "Project" },
        ]}
        eyebrow={project.data?.type ?? "Project"}
        title={project.data?.name ?? "Loading project…"}
        purpose={
          project.data
            ? `${clientName ? `${clientName}. ` : ""}Everything inside this project that goes through review. ${done} of ${rows.length} deliverable${rows.length === 1 ? "" : "s"} approved so far.`
            : "One job for one client, and the deliverables inside it."
        }
        help={
          <>
            <p>
              A deliverable is the single thing that gets reviewed and approved — one cut, one key
              visual, one edit. Versions, comments and approvals all hang off it.
            </p>
            <p>
              The project's own status is just a label for your team. Nothing is sent to the client
              until a deliverable inside it is sent for their review.
            </p>
          </>
        }
        primary={
          <Button onClick={() => setCreating(true)} disabled={!project.data}>
            <Plus size={16} /> Add a deliverable
          </Button>
        }
      />

      {project.isError ? (
        <Callout tone="danger" title="This project did not load">
          {(project.error as Error).message}
          <div className="rx-callout__action">
            <Button variant="secondary" onClick={() => project.refetch()}>
              Try loading it again
            </Button>
          </div>
        </Callout>
      ) : null}

      <div className="list-toolbar">
        <span className="project-detail__due">
          <CalendarDays size={15} /> Due {formatDate(project.data?.dueDate ?? null)}
        </span>
        <span className="project-detail__status">
          <span id="project-status-label">Where this project stands</span>
          <Select
            aria-label="Where this project stands"
            size="sm"
            value={project.data?.status ?? "ACTIVE"}
            disabled={!project.data || setStatus.isPending}
            options={PROJECT_STATUSES}
            onChange={(value) => setStatus.mutate(value)}
          />
          <SaveState
            state={
              setStatus.isPending
                ? "saving"
                : setStatus.isError
                  ? "error"
                  : setStatus.isSuccess
                    ? "saved"
                    : "idle"
            }
            error={setStatus.error ? (setStatus.error as Error).message : null}
            savedLabel="Status saved"
          />
        </span>
      </div>

      {!rows.length ? (
        deliverables.isLoading ? (
          <section className="panel">
            <Skeleton lines={4} label="Loading deliverables" />
          </section>
        ) : (
          <EmptyState
            icon={<Layers size={22} />}
            title="Nothing to review in this project yet"
            body="A deliverable is the single thing that gets reviewed and approved — one cut, one key visual, one edit. Add one, upload a version to it, and it can start moving through review."
            action={
              <Button onClick={() => setCreating(true)}>
                <Plus size={16} /> Add the first deliverable
              </Button>
            }
          />
        )
      ) : (
        <section className="panel">
          <table className="data-table">
            <thead>
              <tr className="data-table__head">
                <th scope="col">Deliverable</th>
                <th scope="col">Type</th>
                <th scope="col">Status</th>
                <th scope="col">Due</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr className="data-table__row" key={item.id}>
                  <th scope="row">{item.title}</th>
                  <td>{titleCase(item.contentType)}</td>
                  <td>
                    <StatusChip status={item.status} />
                  </td>
                  <td className="rx-mono">{formatDate(item.dueDate)}</td>
                  <td>
                    <Link
                      to="/agency/deliverables/$deliverableId"
                      params={{ deliverableId: item.id }}
                      aria-label={`Open ${item.title}`}
                    >
                      Open it <ArrowUpRight size={13} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {creating ? (
        <FormDialog
          title="Add a deliverable"
          description="A deliverable is one thing that gets reviewed and approved. You upload versions to it, and those versions are what the client sees."
          submitLabel="Add this deliverable"
          pendingLabel="Adding it…"
          footnote="Adding a deliverable notifies nobody. The client sees it only once you send a version for their review."
          pending={createDeliverable.isPending}
          error={createDeliverable.error ? (createDeliverable.error as Error).message : null}
          fields={[
            {
              name: "title",
              label: "What is being made",
              required: true,
              placeholder: "Beach Vibe Reel — 30s cut",
              hint: "The name your team and the client will both see in review.",
            },
            {
              name: "description",
              label: "Brief",
              type: "textarea",
              placeholder: "30 seconds, vertical, ends on the product shot with the new tagline.",
              hint: "What the finished thing should be. Reviewers read this next to the work.",
            },
            {
              name: "contentType",
              label: "Kind of file",
              type: "select",
              defaultValue: "OTHER",
              options: CONTENT_TYPES,
              hint: "Decides which review tools appear — a timeline for motion, a canvas for stills.",
            },
            {
              name: "priority",
              label: "Priority",
              type: "select",
              defaultValue: "MEDIUM",
              options: PRIORITIES,
              hint: "How this sorts against everything else on the slate. Medium is the normal choice.",
            },
            {
              name: "dueDate",
              label: "Due date",
              type: "date",
              hint: "When this piece is due, which can be earlier than the project's own date.",
            },
          ]}
          onSubmit={(values) => createDeliverable.mutate(values)}
          onClose={() => {
            createDeliverable.reset();
            setCreating(false);
          }}
        />
      ) : null}
    </AgencyShell>
  );
}
