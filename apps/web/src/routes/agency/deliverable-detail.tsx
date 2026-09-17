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
  RotateCcw,
  SquareCheckBig,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityFeed, type ActivityRow } from "../../components/activity/activity-feed";
import { AgencyShell } from "../../components/app-shell";
import { type CompareMode, CompareStage } from "../../components/compare/compare-stage";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { PageHeader } from "../../components/ui/page-header";
import type { FileVersionView } from "../../components/versioning/types";
import { VersionRail } from "../../components/versioning/version-rail";
import { RevisionList, type RevisionTask } from "../../components/work/revision-list";
import { nextSteps, stageMeaning, type TransitionInfo } from "../../lib/deliverable-status";
import { titleCase } from "../../lib/format";
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
};

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
    queryFn: () => apiFetch<Array<{ id: string; name: string }>>("/api/projects"),
    retry: false,
  });
  const projectName = projects.data?.find(
    (project) => project.id === deliverable.data?.projectId,
  )?.name;

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
        eyebrow={`${contentWord} deliverable`}
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
              <StatusChip status={deliverable.data.status} />
              <HelpTip label={`What ${statusLabel(deliverable.data.status)} means`}>
                <p>{stageMeaning(deliverable.data.status)}</p>
              </HelpTip>
            </span>
          ) : null
        }
        primary={
          primaryStep ? (
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
            {primaryStep ? (
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
