import { type Step, Steps } from "@rexops/ui";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, X } from "lucide-react";
import { request } from "../../lib/request";
import type { ClientRecord, DeliverableRecord, ProjectRecord, StorageUsage } from "../../lib/types";
import { canManageWorkspace, useUpdatePreferences, useWorkspace } from "../../lib/workspace";

/** Statuses that mean a deliverable has actually been put in front of a reviewer. */
const SUBMITTED = new Set([
  "READY_FOR_INTERNAL_REVIEW",
  "UNDER_INTERNAL_REVIEW",
  "INTERNAL_APPROVED",
  "UNDER_CLIENT_REVIEW",
  "REVISION_REQUESTED",
  "APPROVED",
  "DELIVERED",
  "ARCHIVED",
]);

/**
 * The first thing a new workspace sees.
 *
 * A brand-new account used to land on a dashboard of five dashes and three empty
 * panels, which reads as a broken product rather than an empty one. This states
 * the shape of the product in one sentence — work is a deliverable, a file is
 * uploaded to it, it goes through internal review then client review, then it is
 * approved — and turns that into five steps with a link on each.
 *
 * It is not a modal and not a tutorial. It sits above the dashboard, each step
 * ticks itself off from live data, and it disappears on its own once all five are
 * done. It can also be dismissed at any point.
 */
export function SetupGuide() {
  const workspace = useWorkspace();
  const updatePreferences = useUpdatePreferences();

  const clients = useQuery({
    queryKey: ["clients"],
    queryFn: () => request<ClientRecord[]>("/api/clients"),
  });
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => request<ProjectRecord[]>("/api/projects"),
  });
  const deliverables = useQuery({
    queryKey: ["deliverables"],
    queryFn: () => request<DeliverableRecord[]>("/api/deliverables"),
  });
  const storage = useQuery({
    queryKey: ["storage"],
    queryFn: () => request<StorageUsage>("/api/storage"),
    staleTime: 300_000,
    retry: false,
  });

  const team = useQuery({
    queryKey: ["team"],
    queryFn: () => request<Array<{ id: string }>>("/api/team"),
    retry: false,
  });

  const clientCount = clients.data?.length ?? 0;
  const teamCount = team.data?.length ?? 0;
  const projectCount = projects.data?.length ?? 0;
  const versionCount = storage.data?.versionCount ?? 0;
  const submitted = (deliverables.data ?? []).filter((item) => SUBMITTED.has(item.status));
  const approved = (deliverables.data ?? []).filter((item) =>
    ["APPROVED", "DELIVERED"].includes(item.status),
  );
  const firstProject = projects.data?.[0];

  const loading =
    clients.isPending || projects.isPending || deliverables.isPending || storage.isPending;
  const done = [
    clientCount > 0,
    teamCount > 1,
    projectCount > 0,
    versionCount > 0,
    submitted.length > 0,
  ];
  const complete = done.every(Boolean);
  const preferences = workspace.data?.agency?.preferences;

  // Nothing to show: still loading, switched off, or the workspace is past setup.
  if (loading || complete) return null;
  if (preferences && !preferences.showSetupGuide) return null;

  /** The first unfinished step is the current one; everything after it is todo. */
  const firstOpen = done.findIndex((value) => !value);
  const statusFor = (index: number): Step["status"] =>
    done[index] ? "done" : index === firstOpen ? "current" : "todo";

  const projectLink = firstProject ? (
    <Link
      className="rx-button rx-button--primary"
      to="/agency/projects/$projectId"
      params={{ projectId: firstProject.id }}
    >
      Open {firstProject.name} <ArrowUpRight size={14} />
    </Link>
  ) : (
    <Link className="rx-button rx-button--primary" to="/agency/projects">
      Open projects <ArrowUpRight size={14} />
    </Link>
  );

  const steps: Step[] = [
    {
      title: "Add a client and their logins",
      body: "The company you work for, plus the people there who review and approve. They get an email and password to sign in.",
      status: statusFor(0),
      detail: clientCount ? `${clientCount} added` : undefined,
      action: (
        <Link className="rx-button rx-button--primary" to="/agency/clients" search={{ new: "1" }}>
          Add a client <ArrowUpRight size={14} />
        </Link>
      ),
    },
    {
      title: "Add your team",
      body: "Designers, editors, account managers. Each gets their own login and role.",
      status: statusFor(1),
      detail: teamCount ? `${teamCount} on the team` : undefined,
      action: (
        <Link className="rx-button rx-button--primary" to="/agency/team">
          Add team members <ArrowUpRight size={14} />
        </Link>
      ),
    },
    {
      title: "Start a project and pick the service",
      body: "Social media, creatives delivery or ads. The service decides the steps work goes through, and whether it shows on the calendar.",
      status: statusFor(2),
      detail: projectCount ? `${projectCount} started` : undefined,
      action: (
        <Link className="rx-button rx-button--primary" to="/agency/projects" search={{ new: "1" }}>
          Create a project <ArrowUpRight size={14} />
        </Link>
      ),
    },
    {
      title: "Add a post or creative and upload the file",
      body: "Inside the project, add the piece of work, then drop the file on its page. Each upload is a new numbered version.",
      status: statusFor(3),
      detail: versionCount
        ? `${versionCount} file version${versionCount === 1 ? "" : "s"}`
        : undefined,
      action: projectLink,
    },
    {
      title: "Press “Send to client”",
      body: "The client gets a notification, opens it, and approves or asks for changes. Each round of feedback is kept.",
      status: statusFor(4),
      detail: approved.length
        ? `${approved.length} approved`
        : submitted.length
          ? `${submitted.length} in review`
          : undefined,
      action: projectLink,
    },
  ];

  const remaining = done.filter((value) => !value).length;

  return (
    <section className="setup-guide" aria-labelledby="setup-guide-title">
      <header>
        <div>
          <span className="rx-eyebrow">Getting started</span>
          <h2 id="setup-guide-title">Set up your first piece of work</h2>
          <p>
            Client and team first, then a project for each service you run for them. Add the work,
            upload the file, send it to the client, and they approve or ask for changes.
          </p>
        </div>
        {canManageWorkspace(workspace.data?.user.role) ? (
          <button
            type="button"
            className="setup-guide__dismiss"
            onClick={() => updatePreferences.mutate({ showSetupGuide: false })}
            disabled={updatePreferences.isPending}
          >
            <X size={14} aria-hidden="true" />
            Hide this guide
          </button>
        ) : null}
      </header>
      <p className="setup-guide__progress">
        <span className="rx-mono">{5 - remaining}/5</span> done · {remaining} step
        {remaining === 1 ? "" : "s"} left. You can leave and come back; it remembers where you are.
      </p>
      <Steps steps={steps} />
      <footer>
        You can hide this from Settings at any time. It disappears by itself once all five steps are
        done.
      </footer>
    </section>
  );
}
