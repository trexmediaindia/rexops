import { Button, Callout, EmptyState, HelpTip, Select, StatusChip, statusLabel } from "@rexops/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import {
  Activity,
  CloudUpload,
  Columns2,
  Download,
  ExternalLink,
  FileArchive,
  MessageSquareText,
  Pencil,
  RotateCcw,
  Send,
  SquareCheckBig,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityFeed, type ActivityRow } from "../../components/activity/activity-feed";
import { AgencyShell } from "../../components/app-shell";
import { type CompareMode, CompareStage } from "../../components/compare/compare-stage";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { FormDialog } from "../../components/ui/form-dialog";
import { PageHeader } from "../../components/ui/page-header";
import type { FileVersionView } from "../../components/versioning/types";
import { VersionRail } from "../../components/versioning/version-rail";
import { RevisionList, type RevisionTask } from "../../components/work/revision-list";
import { nextSteps, stageMeaning, type TransitionInfo } from "../../lib/deliverable-status";
import { titleCase } from "../../lib/format";
import { SERVICES, serviceOf, stepLabel } from "../../lib/services";
import { enqueueUploads, useUploadStore } from "../../lib/upload-store";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

const TAB_LABELS = {
  VERSIONS: "Versions",
  REVISIONS: "Revisions",
  ACTIVITY: "Activity",
} as const;

/* "side by side" / "split" / "onion" told you the shape of the comparison but not
   what it is for. */
const COMPARE_LABELS: Record<CompareMode, { label: string; hint: string }> = {
  SIDE_BY_SIDE: { label: "Side by side", hint: "Both cuts at once, in their own frames" },
  SPLIT: { label: "Split down the middle", hint: "One cut either side of a draggable divider" },
  ONION: { label: "Fade between", hint: "One cut over the other, to spot small movement" },
};

type Deliverable = {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: string;
  contentType: string;
  priority: string;
  dueDate: string | null;
  publishAt: string | null;
  platforms: string[] | null;
  caption: string | null;
  publishedAt: string | null;
  publishUrl: string | null;
};

/** Statuses from which "Send to client" can take the work all the way to the client. */
const SENDABLE = new Set([
  "PENDING",
  "IN_PROGRESS",
  "REVISION_REQUESTED",
  "READY_FOR_INTERNAL_REVIEW",
  "UNDER_INTERNAL_REVIEW",
  "INTERNAL_APPROVED",
]);

function toLocalInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

async function apiFetch<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

function formatBytes(value: string | null | undefined) {
  if (!value) return "External";
  const bytes = Number(value);
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.ceil(bytes / 1024)} KB`;
}

export function DeliverableDetailPage() {
  const { deliverableId } = useParams({ strict: false }) as { deliverableId: string };
  const queryClient = useQueryClient();
  const { items: uploads } = useUploadStore();
  const majorInput = useRef<HTMLInputElement>(null);
  const companionInput = useRef<HTMLInputElement>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [companionTargetId, setCompanionTargetId] = useState<string | null>(null);
  const [tab, setTab] = useState<"VERSIONS" | "REVISIONS" | "ACTIVITY">("VERSIONS");
  const [compareId, setCompareId] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState<CompareMode>("SIDE_BY_SIDE");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [zoom, setZoom] = useState({ scale: 1, x: 0, y: 0 });
  const [confirming, setConfirming] = useState<TransitionInfo | null>(null);
  const [editingPost, setEditingPost] = useState(false);
  const deliverable = useQuery({
    queryKey: ["deliverable", deliverableId],
    queryFn: () => apiFetch<Deliverable>(`/api/deliverables/${deliverableId}`),
  });
  const versions = useQuery({
    queryKey: ["versions", deliverableId],
    queryFn: () => apiFetch<FileVersionView[]>(`/api/file-versions/deliverable/${deliverableId}`),
    refetchInterval: (query) =>
      (query.state.data as FileVersionView[] | undefined)?.some((version) =>
        ["PENDING", "PROCESSING"].includes(version.previewStatus),
      )
        ? 2500
        : false,
  });
  const revisions = useQuery({
    queryKey: ["revision-tasks", deliverableId],
    queryFn: () => apiFetch<RevisionTask[]>(`/api/work/deliverables/${deliverableId}/tasks`),
  });
  const activity = useQuery({
    queryKey: ["deliverable-activity", deliverableId],
    queryFn: () =>
      apiFetch<{ items: ActivityRow[]; nextCursor: string | null }>(
        `/api/collaboration/activity/deliverable/${deliverableId}`,
      ),
    retry: false,
  });
  const selected = useMemo(
    () =>
      versions.data?.find((version) => version.id === selectedVersionId) ??
      versions.data?.[0] ??
      null,
    [selectedVersionId, versions.data],
  );
  const compare = versions.data?.find((version) => version.id === compareId) ?? null;
  const pendingUploads = uploads.filter(
    (upload) =>
      upload.deliverableId === deliverableId &&
      upload.purpose === "VERSION" &&
      !["done", "canceled"].includes(upload.status),
  );
  // Moving a deliverable along the pipeline. The status chip used to be the only
  // thing on screen that knew about status, with no way to change it.
  const advance = useMutation({
    mutationFn: (to: string) =>
      apiFetch(`/api/deliverables/${deliverableId}/transition`, {
        method: "POST",
        body: JSON.stringify({ to }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deliverable", deliverableId] });
      queryClient.invalidateQueries({ queryKey: ["deliverables"] });
      queryClient.invalidateQueries({ queryKey: ["work"] });
    },
  });
  const toggleTask = useMutation({
    mutationFn: (task: RevisionTask) =>
      apiFetch(`/api/work/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: task.status === "DONE" ? "TODO" : "DONE" }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["revision-tasks", deliverableId] }),
  });

  useEffect(() => {
    const complete = (event: Event) => {
      const detail = (event as CustomEvent<{ deliverableId: string }>).detail;
      if (detail.deliverableId === deliverableId) {
        void versions.refetch();
      }
    };
    window.addEventListener("rexops:upload-complete", complete);
    return () => window.removeEventListener("rexops:upload-complete", complete);
  }, [deliverableId, versions]);

  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => apiFetch<Array<{ id: string; name: string; service?: string }>>("/api/projects"),
    retry: false,
  });
  const project = projects.data?.find((row) => row.id === deliverable.data?.projectId);
  const projectName = project?.name;
  const service = serviceOf(project?.service);
  const definition = SERVICES[service];

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["deliverable", deliverableId] });
    queryClient.invalidateQueries({ queryKey: ["deliverables"] });
    queryClient.invalidateQueries({ queryKey: ["review-room", deliverableId] });
    queryClient.invalidateQueries({ queryKey: ["work"] });
  };
  // One button that takes finished work through team review and on to the client.
  const sendToClient = useMutation({
    mutationFn: () =>
      apiFetch(`/api/reviews/deliverables/${deliverableId}/send-to-client`, { method: "POST" }),
    // Even a refusal can move the work on (e.g. into team review), so always refresh.
    onSettled: refresh,
  });
  const savePost = useMutation({
    mutationFn: (values: Record<string, string>) =>
      apiFetch(`/api/deliverables/${deliverableId}`, {
        method: "PATCH",
        body: JSON.stringify({
          publishAt: values.publishAt ? new Date(values.publishAt).toISOString() : null,
          platforms: values.platforms ? values.platforms.split(",") : [],
          ...(service === "SOCIAL_MEDIA" ? { caption: values.caption ?? "" } : {}),
        }),
      }),
    onSuccess: () => {
      refresh();
      setEditingPost(false);
    },
  });
  // Also offered for work marked "waiting on client" that was never actually shared.
  const notShared =
    deliverable.data?.status === "UNDER_CLIENT_REVIEW" &&
    !versions.data?.some((version) => version.visibility === "CLIENT");
  const canSend =
    !!deliverable.data &&
    (SENDABLE.has(deliverable.data.status) || notShared) &&
    !!versions.data?.length;

  const steps = nextSteps(deliverable.data?.status);
  const primaryStep = steps.find((step) => step.weight === "primary") ?? null;
  const otherSteps = steps.filter((step) => step !== primaryStep);
  const contentWord =
    deliverable.data?.contentType === "MOTION"
      ? "Video"
      : deliverable.data?.contentType === "STATIC"
        ? "Image"
        : "Creative";

  async function openAsset(kind: "download" | "preview") {
    if (!selected) return;
    const asset = await apiFetch<{ url: string }>(`/api/file-versions/${selected.id}/${kind}`);
    window.open(asset.url, "_blank", "noopener,noreferrer");
  }

  return (
    <AgencyShell>
      <PageHeader
        crumbs={[
          { label: "Projects", to: "/agency/projects" },
          ...(projectName ? [{ label: projectName }] : []),
          { label: deliverable.data?.title ?? "Deliverable" },
        ]}
        eyebrow={project ? `${definition.itemLabel} · ${contentWord}` : contentWord}
        title={deliverable.data?.title ?? "Loading deliverable…"}
        purpose={
          deliverable.data?.description ??
          "Every version of this deliverable, the changes asked for, and the record of who approved what."
        }
        help={
          <>
            <p>
              Uploading a new version does not tell anyone. Moving the deliverable to the next stage
              is what notifies people.
            </p>
            <p>
              Comments and approvals are attached to the version they were made on, so an older cut
              keeps its own history.
            </p>
          </>
        }
        status={
          deliverable.data ? (
            <span className="deliverable-stage">
              <StatusChip
                status={deliverable.data.status}
                label={project ? stepLabel(service, deliverable.data) : undefined}
              />
              <HelpTip label={`What ${statusLabel(deliverable.data.status)} means`}>
                <p>{stageMeaning(deliverable.data.status)}</p>
              </HelpTip>
            </span>
          ) : null
        }
        primary={
          canSend ? (
            <Button
              disabled={sendToClient.isPending}
              title="Approves it for your team and sends it to the client for review"
              onClick={() => sendToClient.mutate()}
            >
              <Send size={16} /> {sendToClient.isPending ? "Sending…" : "Send to client"}
            </Button>
          ) : primaryStep ? (
            <Button
              disabled={advance.isPending}
              title={primaryStep.result}
              onClick={() => advance.mutate(primaryStep.to)}
            >
              {advance.isPending ? "Saving…" : primaryStep.label}
            </Button>
          ) : (
            <Button onClick={() => majorInput.current?.click()}>
              <CloudUpload size={16} /> Upload a new version
            </Button>
          )
        }
        secondary={
          <>
            <Link
              className="rx-button rx-button--secondary"
              to="/agency/review/$deliverableId"
              params={{ deliverableId }}
            >
              <MessageSquareText size={16} /> Open review room
            </Link>
            {primaryStep || canSend ? (
              <Button variant="secondary" onClick={() => majorInput.current?.click()}>
                <CloudUpload size={16} /> Upload a new version
              </Button>
            ) : null}
          </>
        }
      />

      {/* The pipeline used to be a row of identical "Move to X" buttons. What the
          deliverable is waiting on, and what each move does to it, is the whole
          point of this screen. */}
      {deliverable.data ? (
        <section className="stage-panel">
          <div className="stage-panel__now">
            <span className="rx-eyebrow">Where this is</span>
            <p>{stageMeaning(deliverable.data.status)}</p>
          </div>
          {otherSteps.length ? (
            <div className="stage-panel__moves">
              <span className="rx-eyebrow">Other moves from here</span>
              <ul>
                {otherSteps.map((step) => (
                  <li key={step.to} data-weight={step.weight}>
                    <button
                      type="button"
                      disabled={advance.isPending}
                      onClick={() =>
                        step.weight === "danger" ? setConfirming(step) : advance.mutate(step.to)
                      }
                    >
                      {step.label}
                    </button>
                    <span>{step.result}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      <input
        ref={majorInput}
        type="file"
        hidden
        multiple
        onChange={(event) =>
          void enqueueUploads([...(event.target.files ?? [])], {
            deliverableId,
            purpose: "VERSION",
            versionBump: "MAJOR",
          })
        }
      />

      {deliverable.isError || versions.isError ? (
        <Callout tone="danger" title="This deliverable did not load">
          {((deliverable.error ?? versions.error) as Error | null)?.message ??
            "The request did not come back."}{" "}
          Your sign-in may have expired.
          <div className="rx-callout__action">
            <Button
              variant="secondary"
              onClick={() => {
                void deliverable.refetch();
                void versions.refetch();
              }}
            >
              Try loading it again
            </Button>
          </div>
        </Callout>
      ) : null}
      {sendToClient.isError ? (
        <Callout tone="warning" title="Not with the client yet">
          {(sendToClient.error as Error).message}
        </Callout>
      ) : null}
      {sendToClient.isSuccess ? (
        <Callout tone="success" title="Sent to the client">
          They'll see it on their home screen with a notification. You'll be notified when they
          approve or ask for changes.
        </Callout>
      ) : null}
      {deliverable.data && definition.publishes ? (
        <section className="post-details panel">
          <dl>
            <div>
              <dt>{definition.publishVerb}</dt>
              <dd>
                {deliverable.data.publishAt
                  ? new Date(deliverable.data.publishAt).toLocaleString("en-GB", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "Not set"}
              </dd>
            </div>
            <div>
              <dt>Where</dt>
              <dd>
                {deliverable.data.platforms?.length
                  ? deliverable.data.platforms.join(", ")
                  : "Not set"}
              </dd>
            </div>
            {service === "SOCIAL_MEDIA" ? (
              <div className="post-details__caption">
                <dt>Caption</dt>
                <dd>{deliverable.data.caption || "No caption yet"}</dd>
              </div>
            ) : null}
            {deliverable.data.publishedAt ? (
              <div>
                <dt>{definition.publishedLabel}</dt>
                <dd>
                  {new Date(deliverable.data.publishedAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                  })}
                  {deliverable.data.publishUrl ? (
                    <>
                      {" · "}
                      <a href={deliverable.data.publishUrl} target="_blank" rel="noreferrer">
                        View <ExternalLink size={12} />
                      </a>
                    </>
                  ) : null}
                </dd>
              </div>
            ) : null}
          </dl>
          <Button variant="secondary" onClick={() => setEditingPost(true)}>
            <Pencil size={14} /> Edit
          </Button>
        </section>
      ) : null}
      {advance.isError ? (
        <Callout tone="danger" title="The deliverable did not move">
          {(advance.error as Error).message} It is still at{" "}
          {statusLabel(deliverable.data?.status ?? "")}.
        </Callout>
      ) : null}
      <div className="deliverable-tabs">
        {(["VERSIONS", "REVISIONS", "ACTIVITY"] as const).map((item) => (
          <button type="button" data-active={tab === item} key={item} onClick={() => setTab(item)}>
            {item === "VERSIONS" ? (
              <Columns2 size={14} />
            ) : item === "REVISIONS" ? (
              <SquareCheckBig size={14} />
            ) : (
              <Activity size={14} />
            )}
            {TAB_LABELS[item]}
            {item === "REVISIONS" ? (
              <span>{revisions.data?.filter((task) => task.status !== "DONE").length ?? 0}</span>
            ) : null}
          </button>
        ))}
      </div>
      {tab === "VERSIONS" ? (
        <div className="deliverable-workspace deliverable-workspace--enhanced">
          <section
            className="version-stage panel"
            aria-label="Version preview and drop target"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              if (!event.dataTransfer.files.length) return;
              event.preventDefault();
              void enqueueUploads([...event.dataTransfer.files], {
                deliverableId,
                purpose: "VERSION",
                versionBump: "MINOR",
              });
            }}
          >
            {selected ? (
              <>
                <div className="version-stage__topline">
                  <div>
                    <span className="rx-mono">{selected.displayVersion}</span>
                    <strong>{selected.label || selected.fileName}</strong>
                  </div>
                  <StatusChip status={selected.status} />
                </div>
                {compare ? (
                  <div className="compare-toolbar compare-toolbar--cockpit">
                    <div className="segmented">
                      {(["SIDE_BY_SIDE", "SPLIT", "ONION"] as CompareMode[]).map((mode) => (
                        <button
                          type="button"
                          key={mode}
                          data-active={compareMode === mode}
                          onClick={() => setCompareMode(mode)}
                          title={COMPARE_LABELS[mode].hint}
                        >
                          {COMPARE_LABELS[mode].label}
                        </button>
                      ))}
                    </div>
                    <button type="button" onClick={() => setCompareId(null)}>
                      Exit compare
                    </button>
                  </div>
                ) : null}
                <div className="version-preview version-preview--viewer">
                  <CompareStage
                    base={selected}
                    against={compare}
                    mode={compareMode}
                    currentTime={currentTime}
                    onTime={setCurrentTime}
                    onDuration={setDuration}
                    zoom={zoom}
                    onZoom={setZoom}
                    tool="select"
                    activeAnnotationId={null}
                    annotationsA={[]}
                    annotationsB={[]}
                    onCreateA={() => undefined}
                    onCreateB={() => undefined}
                  />
                </div>
                <div className="version-facts">
                  <span>
                    <FileArchive size={14} /> {formatBytes(selected.fileSizeBytes)}
                  </span>
                  <span>{titleCase(selected.versionBump)} revision</span>
                  <span>{titleCase(selected.visibility)} visibility</span>
                  <span className="rx-mono">
                    {duration
                      ? `${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, "0")}`
                      : "—"}
                  </span>
                </div>
                <div className="version-stage__actions">
                  {selected.previewStatus === "READY" ? (
                    <Button variant="secondary" onClick={() => openAsset("preview")}>
                      <ExternalLink size={15} /> Open preview
                    </Button>
                  ) : null}
                  <Button variant="secondary" onClick={() => openAsset("download")}>
                    <Download size={15} /> {selected.externalLink ? "Open source" : "Download"}
                  </Button>
                  {selected.isSource && !selected.previewUrl ? (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setCompanionTargetId(selected.id);
                        companionInput.current?.click();
                      }}
                    >
                      Add companion preview
                    </Button>
                  ) : null}
                </div>
              </>
            ) : (
              <EmptyState
                tone="inset"
                icon={<CloudUpload size={22} />}
                title="No file has been uploaded yet"
                body="Reviewers need something to look at. Drag the first cut onto this panel, or use the button — it becomes version 1, and every comment and approval afterwards is tied to it."
                action={
                  <Button onClick={() => majorInput.current?.click()}>
                    <CloudUpload size={16} /> Upload the first version
                  </Button>
                }
              />
            )}
          </section>
          <aside className="version-rail panel">
            <div className="panel__heading">
              <div>
                <span className="rx-eyebrow">Version stack</span>
                <h2>{versions.data?.length ?? 0} cuts</h2>
              </div>
              <RotateCcw size={15} />
            </div>
            <VersionRail
              versions={versions.data ?? []}
              selectedId={selected?.id ?? ""}
              onSelect={setSelectedVersionId}
              pending={pendingUploads}
              draggable
              onFiles={(files) =>
                void enqueueUploads(files, {
                  deliverableId,
                  purpose: "VERSION",
                  versionBump: "MINOR",
                })
              }
            />
            {selected && (versions.data?.length ?? 0) > 1 ? (
              <div className="compare-picker-enhanced">
                <span>
                  <Columns2 size={14} aria-hidden="true" /> Compare against
                </span>
                <Select
                  aria-label="Compare against"
                  placeholder="Choose a cut"
                  size="sm"
                  value={compareId ?? ""}
                  options={(versions.data ?? [])
                    .filter((version) => version.id !== selected.id)
                    .map((version) => ({
                      value: version.id,
                      label: version.label || version.fileName || version.displayVersion,
                      hint: version.displayVersion,
                    }))}
                  onChange={(value) => setCompareId(value || null)}
                />
              </div>
            ) : null}
          </aside>
        </div>
      ) : tab === "REVISIONS" ? (
        <RevisionList
          tasks={revisions.data ?? []}
          pending={revisions.isLoading}
          onToggle={(task) => toggleTask.mutate(task)}
          onJump={(task) => {
            const versionId = task.sourceComment?.fileVersionId;
            window.location.href = `/agency/review/${deliverableId}${versionId ? `?version=${versionId}&comment=${task.sourceComment?.id}` : ""}`;
          }}
        />
      ) : (
        <section className="panel deliverable-activity-panel">
          <div className="panel__heading">
            <div>
              <span className="rx-eyebrow">Chatter</span>
              <h2>Deliverable activity</h2>
            </div>
            <Activity size={16} />
          </div>
          <ActivityFeed rows={activity.data?.items ?? []} />
        </section>
      )}
      {editingPost && deliverable.data ? (
        <FormDialog
          title={`${definition.itemLabel} details`}
          submitLabel="Save"
          pendingLabel="Saving…"
          pending={savePost.isPending}
          error={savePost.error ? (savePost.error as Error).message : null}
          fields={[
            {
              name: "publishAt",
              label: definition.publishVerb,
              type: "datetime-local",
              defaultValue: toLocalInput(deliverable.data.publishAt),
            },
            {
              name: "platforms",
              label: "Where it goes",
              type: "checkboxes",
              defaultValue: (deliverable.data.platforms ?? []).join(","),
              options: definition.platforms.map((value) => ({ value, label: value })),
            },
            ...(service === "SOCIAL_MEDIA"
              ? [
                  {
                    name: "caption",
                    label: "Caption",
                    type: "textarea" as const,
                    defaultValue: deliverable.data.caption ?? "",
                    hint: "The client approves the caption along with the creative.",
                  },
                ]
              : []),
          ]}
          onSubmit={(values) => savePost.mutate(values)}
          onClose={() => {
            savePost.reset();
            setEditingPost(false);
          }}
        />
      ) : null}
      {confirming ? (
        <ConfirmDialog
          title={`${confirming.label}?`}
          body={<strong>{deliverable.data?.title}</strong>}
          consequence={confirming.result}
          confirmLabel={confirming.label}
          pendingLabel="Saving…"
          pending={advance.isPending}
          error={advance.error ? (advance.error as Error).message : null}
          onConfirm={() => advance.mutate(confirming.to, { onSuccess: () => setConfirming(null) })}
          onClose={() => setConfirming(null)}
        />
      ) : null}

      <input
        ref={companionInput}
        type="file"
        hidden
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          if (!companionTargetId || !files.length) return;
          void enqueueUploads(files, {
            deliverableId,
            purpose: "COMPANION_PREVIEW",
            targetVersionId: companionTargetId,
            versionBump: "MINOR",
          });
        }}
      />
    </AgencyShell>
  );
}
