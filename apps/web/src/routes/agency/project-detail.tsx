import { Button, Callout, EmptyState, SaveState, Select, Skeleton, StatusChip } from "@rexops/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import {
  ArchiveRestore,
  ArrowUpRight,
  CalendarDays,
  Check,
  ExternalLink,
  Layers,
  Plus,
  Trash2,
  Undo2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { AdReports } from "../../components/ad-reports";
import { AgencyShell } from "../../components/app-shell";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { type DialogField, FormDialog } from "../../components/ui/form-dialog";
import { PageHeader } from "../../components/ui/page-header";
import { request } from "../../lib/request";
import { SERVICES, serviceOf, serviceStepIndex, stepLabel } from "../../lib/services";
import type { ClientRecord, DeliverableRecord, ProjectRecord } from "../../lib/types";
import { canManageWorkspace, useWorkspace } from "../../lib/workspace";

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

const FILE_KINDS = [
  { value: "MOTION", label: "Video", hint: "Reels, ads, anything that plays" },
  { value: "STATIC", label: "Image", hint: "Posts, carousels, banners, key visuals" },
  { value: "OTHER", label: "Other", hint: "Copy, PDFs, anything else" },
];

function formatDate(value: string | null, withTime = false) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

/** Status chip colour follows the real status; the words follow the service's steps. */
function chipStatus(item: DeliverableRecord) {
  return item.publishedAt ? "DELIVERED" : item.status;
}

export function ProjectDetailPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [stepFilter, setStepFilter] = useState<number | null>(null);
  const [posting, setPosting] = useState<DeliverableRecord | null>(null);

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

  const service = serviceOf(project.data?.service);
  const definition = SERVICES[service];
  const item = definition.itemLabel.toLowerCase();
  const aItem = `${/^[aeiou]/.test(item) ? "an" : "a"} ${item}`;

  const rows = useMemo(
    () =>
      (deliverables.data ?? [])
        .filter((row) => row.projectId === projectId)
        .sort((a, b) => {
          const aDate = a.publishAt ?? a.dueDate ?? a.createdAt;
          const bDate = b.publishAt ?? b.dueDate ?? b.createdAt;
          return String(aDate ?? "").localeCompare(String(bDate ?? ""));
        }),
    [deliverables.data, projectId],
  );
  const stepCounts = definition.steps.map(
    (_, index) => rows.filter((row) => serviceStepIndex(service, row) === index).length,
  );
  const visible =
    stepFilter == null ? rows : rows.filter((row) => serviceStepIndex(service, row) === stepFilter);
  const clientName = clients.data?.find((client) => client.id === project.data?.clientId)?.name;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["deliverables"] });
    queryClient.invalidateQueries({ queryKey: ["calendar"] });
  };

  const createDeliverable = useMutation({
    mutationFn: (values: Record<string, string>) =>
      request<DeliverableRecord>("/api/deliverables", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          title: values.title,
          description: values.description,
          contentType: values.contentType ?? "OTHER",
          caption: values.caption,
          platforms: values.platforms ? values.platforms.split(",") : undefined,
          publishAt: values.publishAt ? new Date(values.publishAt).toISOString() : undefined,
          dueDate: values.dueDate ? new Date(values.dueDate).toISOString() : undefined,
        }),
      }),
    onSuccess: () => {
      invalidate();
      setCreating(false);
    },
  });

  const markPublished = useMutation({
    mutationFn: ({ id, publishUrl }: { id: string; publishUrl?: string }) =>
      request(`/api/deliverables/${id}/published`, {
        method: "POST",
        body: JSON.stringify({ publishUrl }),
      }),
    onSuccess: () => {
      invalidate();
      setPosting(null);
    },
  });
  const undoPublished = useMutation({
    mutationFn: (id: string) => request(`/api/deliverables/${id}/published`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  const navigate = useNavigate();
  const workspace = useWorkspace();
  const isAdmin = canManageWorkspace(workspace.data?.user?.role);
  const [deleting, setDeleting] = useState(false);
  const deleteProject = useMutation({
    mutationFn: (name: string) =>
      request(`/api/projects/${projectId}`, {
        method: "DELETE",
        body: JSON.stringify({ confirm: name }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      invalidate();
      navigate({ to: "/agency/projects" });
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

  const fields: DialogField[] = [
    {
      name: "title",
      label: `${definition.itemLabel} name`,
      required: true,
      placeholder:
        service === "SOCIAL_MEDIA"
          ? "Diwali offer — carousel"
          : service === "ADS"
            ? "Lead ad — free consultation, 15s"
            : "Brand film — 30s cut",
      hint: "The name your team and the client both see.",
    },
    {
      name: "contentType",
      label: "What kind of file",
      type: "select",
      defaultValue: "STATIC",
      options: FILE_KINDS,
      hint: "Videos get a timeline for comments; images get a canvas to mark up.",
    },
    ...(definition.publishes
      ? ([
          {
            name: "publishAt",
            label: definition.publishVerb,
            type: "datetime-local",
            hint:
              service === "ADS"
                ? "When the ad should start running. Shows on the calendar."
                : "When this should go out. Shows on the calendar for you and the client.",
          },
          {
            name: "platforms",
            label: "Where it goes",
            type: "checkboxes",
            options: definition.platforms.map((value) => ({ value, label: value })),
          },
        ] as DialogField[])
      : ([
          {
            name: "dueDate",
            label: "Due date",
            type: "date",
            hint: "When the client should have it.",
          },
        ] as DialogField[])),
    ...(service === "SOCIAL_MEDIA"
      ? ([
          {
            name: "caption",
            label: "Caption",
            type: "textarea",
            placeholder: "Lights, sweets and 20% off everything this weekend ✨ #Diwali",
            hint: "The client approves the caption together with the creative.",
          },
        ] as DialogField[])
      : []),
    {
      name: "description",
      label: "Brief for the team",
      type: "textarea",
      placeholder:
        service === "ADS"
          ? "Audience: women 25–40 in Mumbai. Offer: free consultation. CTA: Book now."
          : "What it should be and anything the designer needs to know.",
    },
  ];

  return (
    <AgencyShell>
      <PageHeader
        crumbs={[
          { label: "Projects", to: "/agency/projects" },
          { label: project.data?.name ?? "Project" },
        ]}
        eyebrow={project.data ? definition.label : "Project"}
        title={project.data?.name ?? "Loading project…"}
        purpose={
          project.data
            ? `${clientName ? `${clientName} · ` : ""}${definition.description}`
            : "One job for one client, and the work inside it."
        }
        help={
          <>
            <p>
              Each {item} moves through the steps along the top. Upload a version, send it to the
              client, and they approve it or ask for changes. Every round of feedback is kept.
            </p>
            {definition.publishes ? (
              <p>
                Once approved, give it a {definition.publishVerb.toLowerCase()}. After it goes out,
                press “Mark as {definition.publishedLabel.toLowerCase()}” so everyone knows.
              </p>
            ) : null}
          </>
        }
        primary={
          <Button onClick={() => setCreating(true)} disabled={!project.data}>
            <Plus size={16} /> Add {aItem}
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

      {project.data ? (
        <nav className="service-steps" aria-label={`${definition.label} steps`}>
          <button
            type="button"
            aria-pressed={stepFilter == null}
            onClick={() => setStepFilter(null)}
          >
            <span>All</span>
            <strong>{rows.length}</strong>
          </button>
          {definition.steps.map((step, index) => (
            <button
              type="button"
              key={step}
              aria-pressed={stepFilter === index}
              data-empty={stepCounts[index] === 0 || undefined}
              onClick={() => setStepFilter(stepFilter === index ? null : index)}
            >
              <span>{step}</span>
              <strong>{stepCounts[index]}</strong>
            </button>
          ))}
        </nav>
      ) : null}

      {!rows.length ? (
        deliverables.isLoading || project.isLoading ? (
          <section className="panel">
            <Skeleton lines={4} label="Loading" />
          </section>
        ) : (
          <EmptyState
            icon={<Layers size={22} />}
            title={`No ${item}s yet`}
            body={`Add ${aItem}, upload the file to it, and send it to the client when your team is happy.`}
            action={
              <Button onClick={() => setCreating(true)}>
                <Plus size={16} /> Add the first {item}
              </Button>
            }
          />
        )
      ) : (
        <section className="panel">
          <table className="data-table">
            <thead>
              <tr className="data-table__head">
                <th scope="col">{definition.itemLabel}</th>
                <th scope="col">Step</th>
                <th scope="col">{definition.publishes ? definition.publishVerb : "Due"}</th>
                {definition.publishes ? <th scope="col">Where</th> : null}
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const canPublish =
                  definition.publishes && row.status === "APPROVED" && !row.publishedAt;
                return (
                  <tr className="data-table__row" key={row.id}>
                    <th scope="row">
                      <Link
                        to="/agency/deliverables/$deliverableId"
                        params={{ deliverableId: row.id }}
                      >
                        {row.title}
                      </Link>
                    </th>
                    <td>
                      <StatusChip status={chipStatus(row)} label={stepLabel(service, row)} />
                    </td>
                    <td className="rx-mono">
                      {definition.publishes
                        ? formatDate(row.publishAt ?? row.publishedAt, true)
                        : formatDate(row.dueDate)}
                    </td>
                    {definition.publishes ? (
                      <td className="project-detail__platforms">
                        {row.platforms?.length ? row.platforms.join(", ") : "—"}
                      </td>
                    ) : null}
                    <td className="project-detail__actions">
                      {canPublish ? (
                        <Button variant="secondary" onClick={() => setPosting(row)}>
                          <Check size={14} /> Mark as {definition.publishedLabel.toLowerCase()}
                        </Button>
                      ) : null}
                      {row.publishedAt && row.publishUrl ? (
                        <a href={row.publishUrl} target="_blank" rel="noreferrer">
                          View <ExternalLink size={13} />
                        </a>
                      ) : null}
                      {row.publishedAt ? (
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`Undo “${definition.publishedLabel.toLowerCase()}” for ${row.title}`}
                          title="Undo"
                          disabled={undoPublished.isPending}
                          onClick={() => undoPublished.mutate(row.id)}
                        >
                          <Undo2 size={14} />
                        </button>
                      ) : null}
                      <Link
                        to="/agency/deliverables/$deliverableId"
                        params={{ deliverableId: row.id }}
                        aria-label={`Open ${row.title}`}
                      >
                        Open <ArrowUpRight size={13} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!visible.length ? (
            <p className="project-detail__none">
              Nothing at “{definition.steps[stepFilter ?? 0]}” right now.
            </p>
          ) : null}
        </section>
      )}

      {definition.hasReports && project.data ? <AdReports projectId={projectId} canEdit /> : null}

      <div className="list-toolbar project-detail__footer">
        <span className="project-detail__due">
          {project.data?.dueDate ? (
            <>
              <CalendarDays size={15} /> Project due {formatDate(project.data.dueDate)}
            </>
          ) : null}
        </span>
        <span className="project-detail__status">
          <span id="project-status-label">Project status</span>
          <Select
            aria-label="Project status"
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
          {project.data?.status === "ARCHIVED" ? (
            <Button
              variant="secondary"
              disabled={setStatus.isPending}
              onClick={() => setStatus.mutate("ACTIVE")}
            >
              <ArchiveRestore size={14} /> Restore
            </Button>
          ) : null}
          {isAdmin && project.data ? (
            <button
              type="button"
              className="row-action--danger project-detail__delete"
              onClick={() => {
                deleteProject.reset();
                setDeleting(true);
              }}
            >
              <Trash2 size={14} /> Delete project
            </button>
          ) : null}
        </span>
      </div>

      {deleting && project.data ? (
        <ConfirmDialog
          tone="danger"
          title="Delete this project for good?"
          body={
            <>
              <strong>{project.data.name}</strong> and its {rows.length} piece
              {rows.length === 1 ? "" : "s"} of work, with every file, comment and approval in them,
              will be erased.
            </>
          }
          consequence="This cannot be undone. To put it away but keep everything, set the status to Archived instead."
          typeToConfirm={project.data.name}
          confirmLabel="Delete permanently"
          pendingLabel="Deleting…"
          pending={deleteProject.isPending}
          error={deleteProject.error ? (deleteProject.error as Error).message : null}
          onConfirm={() => project.data && deleteProject.mutate(project.data.name)}
          onClose={() => setDeleting(false)}
        />
      ) : null}

      {creating ? (
        <FormDialog
          title={`Add ${aItem}`}
          description={
            definition.publishes
              ? `Plan the ${item} now. You'll upload the file and send it for approval from its page.`
              : `You'll upload the file and send it to the client from its page.`
          }
          submitLabel={`Add ${item}`}
          pendingLabel="Adding…"
          footnote="Nothing is sent to the client until you press “Send to client”."
          pending={createDeliverable.isPending}
          error={createDeliverable.error ? (createDeliverable.error as Error).message : null}
          fields={fields}
          onSubmit={(values) => createDeliverable.mutate(values)}
          onClose={() => {
            createDeliverable.reset();
            setCreating(false);
          }}
        />
      ) : null}

      {posting ? (
        <FormDialog
          title={`Mark “${posting.title}” as ${definition.publishedLabel.toLowerCase()}`}
          description={
            service === "ADS"
              ? "Confirms the ad is running. The client will see it as live."
              : "Confirms it's been posted. The client will see it as posted on their calendar."
          }
          submitLabel={`Mark as ${definition.publishedLabel.toLowerCase()}`}
          pendingLabel="Saving…"
          pending={markPublished.isPending}
          error={markPublished.error ? (markPublished.error as Error).message : null}
          fields={[
            {
              name: "publishUrl",
              label: service === "ADS" ? "Link to the ad" : "Link to the post",
              type: "url",
              placeholder: "https://www.instagram.com/p/…",
              hint: "Optional. Lets the client open it in one tap.",
            },
          ]}
          onSubmit={(values) =>
            markPublished.mutate({ id: posting.id, publishUrl: values.publishUrl })
          }
          onClose={() => {
            markPublished.reset();
            setPosting(null);
          }}
        />
      ) : null}
    </AgencyShell>
  );
}
