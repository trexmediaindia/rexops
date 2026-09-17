import {
  Button,
  Callout,
  EmptyState,
  humanize,
  SaveState,
  Select,
  Skeleton,
  StatusChip,
} from "@rexops/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import {
  CalendarDays,
  Columns3,
  GanttChart,
  LayoutGrid,
  List,
  LockKeyhole,
  Plus,
  Save,
} from "lucide-react";
import { useState } from "react";
import { AgencyShell } from "../../components/app-shell";
import { FormDialog } from "../../components/ui/form-dialog";
import { PageHeader } from "../../components/ui/page-header";
import { request } from "../../lib/request";
import type { DeliverableRecord, ProjectRecord } from "../../lib/types";

type ViewType = "BOARD" | "LIST" | "CALENDAR" | "TIMELINE";
type WorkItem = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  blockedBy: string[];
  customFields: Record<string, unknown>;
};

/* Four ways of drawing the same deliverables. The hint says what each one is
   good for, because "Board / List / Calendar / Timeline" only tells you the
   shape, not when you would want it. */
const views = [
  {
    type: "BOARD" as const,
    label: "Board",
    icon: Columns3,
    hint: "Columns by stage — see what is stuck where",
  },
  { type: "LIST" as const, label: "List", icon: List, hint: "One row each, with all the detail" },
  {
    type: "CALENDAR" as const,
    label: "Calendar",
    icon: CalendarDays,
    hint: "The next two weeks by due date",
  },
  {
    type: "TIMELINE" as const,
    label: "Timeline",
    icon: GanttChart,
    hint: "Bars across the coming weeks",
  },
];

const boardStatuses = [
  "PENDING",
  "IN_PROGRESS",
  "UNDER_INTERNAL_REVIEW",
  "UNDER_CLIENT_REVIEW",
  "REVISION_REQUESTED",
  "APPROVED",
];
const timelineWeeks = ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8"];

/* Screaming SCREAMING_CASE column heads read as machine output; these are the
   words the team actually uses for the same lanes. */
const COLUMN_LABELS: Record<string, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In progress",
  UNDER_INTERNAL_REVIEW: "Internal review",
  UNDER_CLIENT_REVIEW: "With client",
  REVISION_REQUESTED: "Changes requested",
  APPROVED: "Approved",
};

const PRIORITIES = [
  { value: "LOW", label: "Low", hint: "Fit it in around everything else" },
  { value: "MEDIUM", label: "Medium", hint: "Normal turnaround" },
  { value: "HIGH", label: "High", hint: "Ahead of normal work" },
  { value: "URGENT", label: "Urgent", hint: "Drop other work for this" },
];

export function WorkPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { new?: string };
  const [view, setView] = useState<ViewType>("BOARD");
  const [savedViewId, setSavedViewId] = useState("");
  const [creating, setCreating] = useState<string | null>(search.new === "1" ? "PENDING" : null);
  const work = useQuery({
    queryKey: ["work"],
    queryFn: () => request<WorkItem[]>("/api/work"),
  });
  const savedViews = useQuery({
    queryKey: ["saved-views"],
    queryFn: () =>
      request<Array<{ id: string; name: string; viewType: ViewType }>>("/api/work/views"),
  });
  const saveView = useMutation({
    mutationFn: () =>
      request("/api/work/views", {
        method: "POST",
        body: JSON.stringify({
          scope: "GLOBAL",
          name: `${views.find((item) => item.type === view)?.label} · active work`,
          viewType: view,
          filterJson: { archived: false },
          sortJson: { dueDate: "asc" },
          groupBy: view === "BOARD" ? "status" : undefined,
          isShared: false,
        }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["saved-views"] }),
  });
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => request<ProjectRecord[]>("/api/projects"),
  });
  const createDeliverable = useMutation({
    mutationFn: (values: Record<string, string>) =>
      request<DeliverableRecord>("/api/deliverables", {
        method: "POST",
        body: JSON.stringify({
          projectId: values.projectId,
          title: values.title,
          contentType: values.contentType ?? "OTHER",
          priority: values.priority ?? "MEDIUM",
          dueDate: values.dueDate ? new Date(values.dueDate).toISOString() : undefined,
        }),
      }),
    onSuccess: async (created, values) => {
      // Deliverables are always created at PENDING. IN_PROGRESS is the one column
      // reachable in a single legal transition, so that is the only preset applied;
      // anything further has to move through the review pipeline properly.
      if (values.status === "IN_PROGRESS") {
        await request(`/api/deliverables/${created.id}/transition`, {
          method: "POST",
          body: JSON.stringify({ to: "IN_PROGRESS" }),
        });
      }
      queryClient.invalidateQueries({ queryKey: ["work"] });
      queryClient.invalidateQueries({ queryKey: ["deliverables"] });
      closeDialog();
    },
  });

  function closeDialog() {
    createDeliverable.reset();
    setCreating(null);
    if (search.new) navigate({ to: "/agency/work", search: {} });
  }

  return (
    <AgencyShell>
      <PageHeader
        eyebrow="Everything in flight"
        title="Work"
        purpose="Every deliverable in the workspace, drawn four different ways. Switching the view changes nothing about the work itself."
        help={
          <>
            <p>
              This is the same list of deliverables as the projects screen, without the project
              grouping. Use it when you want to see the whole slate at once.
            </p>
            <p>
              A saved view remembers which of the four layouts you were in, so you can come back to
              it. It does not restrict who can see what.
            </p>
          </>
        }
        primary={
          <Button onClick={() => setCreating("PENDING")}>
            <Plus size={16} /> Add a deliverable
          </Button>
        }
      />

      <div className="work-view-toolbar">
        {/* The switch was four unlabelled icon buttons. It now says what it is and
            each option says what it is for. */}
        {/* biome-ignore lint/a11y/useSemanticElements: a fieldset is for form controls; these are buttons. */}
        <div className="work-view-switch" role="group" aria-label="How work is shown">
          <span className="work-view-switch__label">Show as</span>
          {views.map((item) => {
            const Icon = item.icon;
            return (
              <button
                type="button"
                key={item.type}
                data-active={view === item.type}
                aria-pressed={view === item.type}
                title={item.hint}
                onClick={() => setView(item.type)}
              >
                <Icon size={15} /> {item.label}
              </button>
            );
          })}
        </div>

        <div className="work-view-saved">
          <label htmlFor="saved-view">Saved views</label>
          <Select
            id="saved-view"
            placeholder={savedViews.data?.length ? "Open a saved view" : "None saved yet"}
            value={savedViewId}
            size="sm"
            disabled={!savedViews.data?.length}
            options={(savedViews.data ?? []).map((saved) => ({
              value: saved.id,
              label: saved.name,
            }))}
            onChange={(next) => {
              setSavedViewId(next);
              const selected = savedViews.data?.find((item) => item.id === next);
              if (selected) setView(selected.viewType);
            }}
          />
          {/* Saving the layout used to be the screen's primary button, which put a
              bookmarking feature above the work itself. It sits here now, next to
              the list it adds to. */}
          <button
            type="button"
            className="work-view-save"
            disabled={saveView.isPending}
            onClick={() => saveView.mutate()}
          >
            <Save size={14} aria-hidden="true" /> Save this layout
          </button>
          <SaveState
            state={
              saveView.isPending
                ? "saving"
                : saveView.isError
                  ? "error"
                  : saveView.isSuccess
                    ? "saved"
                    : "idle"
            }
            error={saveView.error ? (saveView.error as Error).message : null}
            savedLabel="Saved to your views"
          />
        </div>
      </div>

      {work.isPending ? (
        <section className="panel">
          <Skeleton lines={6} label="Loading the slate" />
        </section>
      ) : work.isError ? (
        <Callout tone="danger" title="Work did not load">
          {(work.error as Error).message}
          <div className="rx-callout__action">
            <Button variant="secondary" onClick={() => work.refetch()}>
              Try loading work again
            </Button>
          </div>
        </Callout>
      ) : !work.data?.length ? (
        <EmptyState
          icon={<LayoutGrid size={22} />}
          title="No deliverables yet"
          body={
            projects.data?.length
              ? "A deliverable is the single thing that gets reviewed and approved: one cut, one key visual, one edit. Add one and it appears in all four views."
              : "Deliverables live inside projects, and there are no projects yet. Create a project first, then add the work that needs reviewing."
          }
          action={
            projects.data?.length ? (
              <Button onClick={() => setCreating("PENDING")}>
                <Plus size={16} /> Add your first deliverable
              </Button>
            ) : (
              <Link
                className="rx-button rx-button--primary"
                to="/agency/projects"
                search={{ new: "1" }}
              >
                Create a project first
              </Link>
            )
          }
        />
      ) : (
        <>
          {view === "BOARD" ? <Board items={work.data} onAdd={setCreating} /> : null}
          {view === "LIST" ? <WorkList items={work.data} /> : null}
          {view === "CALENDAR" ? <Calendar items={work.data} /> : null}
          {view === "TIMELINE" ? <Timeline items={work.data} /> : null}
        </>
      )}

      {creating ? (
        <FormDialog
          title="Add a deliverable"
          description="A deliverable is one thing that gets reviewed and approved: one cut, one key visual, one edit. Versions of it get uploaded against this record."
          submitLabel="Add deliverable"
          pendingLabel="Adding deliverable…"
          pending={createDeliverable.isPending}
          error={createDeliverable.error ? (createDeliverable.error as Error).message : null}
          footnote={
            creating === "IN_PROGRESS"
              ? "This one starts in progress, because you added it to that column. Nobody is notified until you upload a file and send it for review."
              : "It starts in Pending. Nobody is notified until you upload a file and send it for review."
          }
          fields={[
            {
              name: "title",
              label: "What is being made",
              required: true,
              placeholder: "Launch film — 30 second cut",
              hint: "Name it so a reviewer recognises it in a list of alerts.",
            },
            {
              name: "projectId",
              label: "Project it belongs to",
              type: "select",
              required: true,
              hint: "Decides which client sees it and where it appears in your slate.",
              options: (projects.data ?? []).map((project) => ({
                value: project.id,
                label: project.name,
              })),
            },
            {
              name: "contentType",
              label: "Kind of file people will review",
              type: "select",
              defaultValue: "OTHER",
              hint: "Decides which review tools open: video gets a timeline, stills get a canvas.",
              options: [
                { value: "MOTION", label: "Video", hint: "Comments attach to a timecode" },
                { value: "STATIC", label: "Image or PDF", hint: "Comments attach to a region" },
                { value: "OTHER", label: "Something else", hint: "Comments attach to the version" },
              ],
            },
            {
              name: "priority",
              label: "Priority",
              type: "select",
              defaultValue: "MEDIUM",
              hint: "How it sorts against the rest of the slate. Medium is the normal choice.",
              options: PRIORITIES,
            },
            {
              name: "dueDate",
              label: "Due date",
              type: "date",
              hint: "Drives the countdown on the card and the calendar view.",
            },
          ]}
          onSubmit={(values) => createDeliverable.mutate({ ...values, status: creating })}
          onClose={closeDialog}
        />
      ) : null}
    </AgencyShell>
  );
}

/** Days until due, negative when overdue. `null` when the item carries no date. */
function daysUntil(dueDate: string | null) {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return null;
  const startOfDay = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.round((startOfDay(due) - startOfDay(new Date())) / 86_400_000);
}

function dueLabel(dueDate: string | null) {
  const days = daysUntil(dueDate);
  if (days === null) return "No due date";
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days <= 6) return `Due in ${days}d`;
  return `Due ${new Date(dueDate as string).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  })}`;
}

/** `late` / `soon` / `later` — drives the colour of the due chip. */
function dueTone(dueDate: string | null) {
  const days = daysUntil(dueDate);
  if (days === null) return "none";
  if (days < 0) return "late";
  if (days <= 2) return "soon";
  return "later";
}

function WorkCard({ item }: { item: WorkItem }) {
  return (
    <Link
      className="work-card"
      data-priority={item.priority?.toLowerCase()}
      to="/agency/deliverables/$deliverableId"
      params={{ deliverableId: item.id }}
    >
      <h3>{item.title}</h3>
      <div className="work-card__meta">
        <span className="work-card__due" data-tone={dueTone(item.dueDate)}>
          <CalendarDays size={12} aria-hidden="true" />
          {dueLabel(item.dueDate)}
        </span>
        {item.priority && item.priority !== "MEDIUM" ? (
          <span className="work-card__priority">{humanize(item.priority)}</span>
        ) : null}
        {item.blockedBy.length ? (
          <span className="blocked-badge">
            <LockKeyhole size={11} aria-hidden="true" /> Blocked
          </span>
        ) : null}
      </div>
    </Link>
  );
}

function Board({ items, onAdd }: { items: WorkItem[]; onAdd: (status: string) => void }) {
  return (
    <section className="work-board">
      {boardStatuses.map((status) => {
        const cards = items.filter((item) => item.status === status);
        return (
          <section className="work-column" key={status} data-status={status.toLowerCase()}>
            <header>
              <span>
                <i aria-hidden="true" />
                {COLUMN_LABELS[status] ?? status.replaceAll("_", " ")}
              </span>
              <b className="rx-mono">{cards.length}</b>
            </header>
            <div className="work-column__cards">
              {cards.map((item) => (
                <WorkCard item={item} key={item.id} />
              ))}
              {cards.length ? null : (
                <p className="work-column__empty">
                  Nothing is {(COLUMN_LABELS[status] ?? status).toLowerCase()} right now.
                </p>
              )}
            </div>
            <button type="button" className="work-column__add" onClick={() => onAdd(status)}>
              <Plus size={14} aria-hidden="true" /> Add deliverable
            </button>
          </section>
        );
      })}
    </section>
  );
}

function WorkList({ items }: { items: WorkItem[] }) {
  return (
    <section className="panel">
      <table className="data-table">
        <thead>
          <tr className="data-table__head">
            <th>Deliverable</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Due</th>
            <th>Waiting on</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr className="data-table__row" key={item.id}>
              <th>
                <Link to="/agency/deliverables/$deliverableId" params={{ deliverableId: item.id }}>
                  {item.title}
                </Link>
              </th>
              <td>
                <StatusChip status={item.status} />
              </td>
              <td>{humanize(item.priority)}</td>
              <td className="rx-mono">
                {item.dueDate ? new Date(item.dueDate).toLocaleDateString() : "—"}
              </td>
              <td>
                {item.blockedBy.length
                  ? `${item.blockedBy.length} other deliverable${item.blockedBy.length === 1 ? "" : "s"}`
                  : "Nothing"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Calendar({ items }: { items: WorkItem[] }) {
  const days = Array.from({ length: 14 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    return date;
  });
  return (
    <section className="work-calendar">
      {days.map((day) => (
        <div key={day.toISOString()}>
          <header>
            <span>{day.toLocaleDateString([], { weekday: "short" })}</span>
            <b className="rx-mono">{day.getDate()}</b>
          </header>
          {items
            .filter(
              (item) =>
                item.dueDate && new Date(item.dueDate).toDateString() === day.toDateString(),
            )
            .map((item) => (
              <WorkCard item={item} key={item.id} />
            ))}
        </div>
      ))}
    </section>
  );
}

function Timeline({ items }: { items: WorkItem[] }) {
  return (
    <section className="panel work-timeline">
      <header>
        {timelineWeeks.map((week) => (
          <span key={week}>{week}</span>
        ))}
      </header>
      {items.map((item, index) => (
        <article key={item.id}>
          <strong>
            <Link to="/agency/deliverables/$deliverableId" params={{ deliverableId: item.id }}>
              {item.title}
            </Link>
          </strong>
          <div>
            <i style={{ marginLeft: `${(index % 4) * 10}%`, width: `${25 + (index % 3) * 8}%` }}>
              {item.blockedBy.length ? <LockKeyhole size={11} /> : null}
            </i>
          </div>
        </article>
      ))}
    </section>
  );
}
