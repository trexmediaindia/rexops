import { Avatar, Button, HelpTip } from "@rexops/ui";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Boxes,
  Building2,
  CheckCircle2,
  ChevronDown,
  CircleUserRound,
  Command,
  FolderKanban,
  Gauge,
  Inbox,
  LifeBuoy,
  ListChecks,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  ScrollText,
  Search,
  Settings,
  Sparkles,
  Users,
  Workflow,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { authClient } from "../lib/auth-client";
import { type FeatureKey, useFeatures } from "../lib/features";
import { formatBytes } from "../lib/format";
import { request } from "../lib/request";
import type { DeliverableRecord, StorageUsage } from "../lib/types";
import {
  canManageWorkspace,
  initialsFor,
  roleBlurb,
  roleLabel,
  useWorkspace,
} from "../lib/workspace";
import { LiveBell } from "./notifications/live-bell";
import { UploadManager } from "./upload/upload-manager";

/**
 * The agency sidebar.
 *
 * Every entry carries a `hint`: one line saying what the destination is for. The
 * nav used to be six nouns under the heading "Operate", which told a new user
 * nothing about which one to open first or what the difference between "Work" and
 * "Projects" was.
 */
const agencyNav = [
  {
    label: "Dashboard",
    to: "/agency/dashboard",
    icon: Gauge,
    hint: "What needs attention today, and how the workspace is set up.",
  },
  {
    label: "Clients",
    to: "/agency/clients",
    icon: CircleUserRound,
    hint: "The companies you work for. Every project belongs to one.",
  },
  {
    label: "Projects",
    to: "/agency/projects",
    icon: FolderKanban,
    hint: "Pieces of work for a client. Deliverables live inside them.",
  },
  {
    label: "Work",
    to: "/agency/work",
    icon: Boxes,
    feature: "work.views",
    hint: "Every deliverable on a board, list, calendar or timeline.",
  },
  {
    label: "Review queue",
    to: "/agency/review",
    icon: CheckCircle2,
    badge: "review" as const,
    feature: "review.wedge",
    hint: "Deliverables waiting on a decision from you or from a client.",
  },
  {
    label: "Inbox",
    to: "/agency/inbox",
    icon: Inbox,
    badge: "inbox" as const,
    feature: "collaboration.live",
    hint: "Comments, mentions and activity across the workspace.",
  },
] as const;

const manageNav = [
  {
    label: "Team",
    to: "/agency/team",
    icon: Users,
    hint: "Invite colleagues and choose what each of them can do.",
  },
  {
    label: "Review stages",
    to: "/agency/settings/pipelines",
    icon: ListChecks,
    feature: "review.wedge",
    hint: "Who has to sign off, in what order, and how long they get.",
  },
  {
    label: "Automation",
    to: "/agency/automation",
    icon: Workflow,
    feature: "automation",
    hint: "Rules that act on a deliverable when its status changes.",
  },
  {
    label: "Settings",
    to: "/agency/settings",
    icon: Settings,
    hint: "Workspace name, branding, defaults and storage.",
  },
] as const;

/** Deliverables sitting in somebody's review queue. */
const REVIEW_STATUSES = new Set([
  "READY_FOR_INTERNAL_REVIEW",
  "UNDER_INTERNAL_REVIEW",
  "UNDER_CLIENT_REVIEW",
  "REVISION_REQUESTED",
]);

/** Live counts for the sidebar badges. These used to be the literals 6 and 3. */
function useNavBadges() {
  const deliverables = useQuery({
    queryKey: ["deliverables"],
    queryFn: () => request<DeliverableRecord[]>("/api/deliverables"),
    staleTime: 30_000,
  });
  const notifications = useQuery({
    queryKey: ["notifications", "bell"],
    queryFn: async () => {
      const body = await request<{ items: Array<{ isRead: boolean }> }>("/api/notifications");
      return body.items;
    },
    staleTime: 30_000,
    retry: false,
  });
  return {
    review: (deliverables.data ?? []).filter((item) => REVIEW_STATUSES.has(item.status)).length,
    inbox: (notifications.data ?? []).filter((item) => !item.isRead).length,
  };
}

/**
 * Real capacity for the sidebar footer, summed over the tenant's file versions
 * and claimed attachments. This used to be the literal "18.4 / 100 GB"; the
 * quota now lives on the agency row, so an agency that has never set one reads
 * the 100 GB default rather than a number invented in the markup.
 */
function useStorageUsage() {
  return useQuery({
    queryKey: ["storage"],
    queryFn: () => request<StorageUsage>("/api/storage"),
    staleTime: 300_000,
    retry: false,
  });
}

/** Targets for the topbar "Create new" menu. Each page opens its own create
 * dialog when it sees `?new=1`, so the menu stays a plain set of links. The
 * order is the order the records have to be created in. */
const createTargets = [
  {
    label: "Client",
    to: "/agency/clients",
    icon: CircleUserRound,
    hint: "A company you work for",
  },
  {
    label: "Project",
    to: "/agency/projects",
    icon: FolderKanban,
    hint: "A piece of work for one client",
  },
  {
    label: "Deliverable",
    to: "/agency/work",
    icon: Boxes,
    hint: "One asset that gets reviewed and approved",
  },
] as const;

const COLLAPSE_KEY = "rexops:sidebar-collapsed";

/** Sidebar collapse state, remembered across navigations and reloads. */
function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(
    () => globalThis.localStorage?.getItem(COLLAPSE_KEY) === "1",
  );
  const set = (next: boolean) => {
    setCollapsed(next);
    globalThis.localStorage?.setItem(COLLAPSE_KEY, next ? "1" : "0");
  };
  return [collapsed, set] as const;
}

export function AgencyShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const [createOpen, setCreateOpen] = useState(false);
  const commandInput = useRef<HTMLInputElement>(null);
  const features = useFeatures();
  const badges = useNavBadges();
  const storage = useStorageUsage();
  const workspace = useWorkspace();
  /* `label` is in the signature only to satisfy TypeScript's weak-type check —
   * every nav entry has one, and a predicate typed on the optional field alone
   * has no property in common with the `as const` entries that omit it. */
  const enabled = (item: { label: string; feature?: string }) =>
    !item.feature || features.data?.[item.feature as FeatureKey] === true;
  const visibleNav = agencyNav.filter(enabled);
  const visibleManage = manageNav.filter(enabled);

  /** Both nav groups feed the palette, so ⌘K reaches settings and the team roster
   * rather than only the six operating screens. */
  const destinations = useMemo(
    () => [...visibleNav, ...visibleManage],
    [visibleNav, visibleManage],
  );
  const matches = destinations.filter((item) => {
    const query = commandQuery.trim().toLowerCase();
    if (!query) return true;
    return item.label.toLowerCase().includes(query) || item.hint.toLowerCase().includes(query);
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((value) => !value);
      }
      if (event.key === "Escape") {
        setCommandOpen(false);
        setCreateOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (commandOpen) commandInput.current?.focus();
  }, [commandOpen]);

  const agencyName = workspace.data?.agency?.name;

  return (
    <div className="app-frame" data-collapsed={collapsed}>
      <aside className="sidebar">
        <div className="wordmark">
          <span className="wordmark__mark">R</span>
          <span>RexOps</span>
          <button
            className="icon-button sidebar__collapse"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            type="button"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>
        {/* The real tenant, not a literal. There is no workspace switcher, so
            there is no chevron implying one. */}
        <div className="workspace-switcher" data-static="true">
          <Avatar
            initials={initialsFor(agencyName)}
            label={agencyName ?? "Loading your workspace"}
          />
          <div>
            <strong>{agencyName ?? "Your workspace"}</strong>
            <span>{roleLabel(workspace.data?.user.role)}</span>
          </div>
        </div>
        <nav className="sidebar__nav" aria-label="Agency navigation">
          <span className="nav-label">Your work</span>
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.to);
            return (
              <Link
                key={item.label}
                to={item.to}
                className="nav-item"
                data-active={active}
                aria-current={active ? "page" : undefined}
                title={`${item.label} — ${item.hint}`}
              >
                <Icon size={17} strokeWidth={1.7} />
                <span>{item.label}</span>
                {"badge" in item && badges[item.badge] ? (
                  <em title={`${badges[item.badge]} waiting`}>{badges[item.badge]}</em>
                ) : null}
              </Link>
            );
          })}
          <span className="nav-label nav-label--spaced">Set up the workspace</span>
          {visibleManage.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.to;
            return (
              <Link
                key={item.label}
                to={item.to}
                className="nav-item"
                data-active={active}
                aria-current={active ? "page" : undefined}
                title={`${item.label} — ${item.hint}`}
              >
                <Icon size={17} strokeWidth={1.7} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebar__footer">
          <CapacityMeter usage={storage.data} />
          <UserRow settingsTo="/agency/settings" />
        </div>
      </aside>
      <main className="main-panel">
        <header className="topbar">
          <button className="command-trigger" type="button" onClick={() => setCommandOpen(true)}>
            <Search size={15} />
            <span>Find a screen</span>
            <kbd>
              <Command size={11} /> K
            </kbd>
          </button>
          <div className="topbar__actions">
            <LiveBell />
            <div className="create-menu">
              <Button
                variant="primary"
                aria-haspopup="menu"
                aria-expanded={createOpen}
                onClick={() => setCreateOpen((value) => !value)}
              >
                <Plus size={15} /> Create
              </Button>
              {createOpen ? (
                <>
                  <button
                    type="button"
                    className="create-menu__backdrop"
                    aria-label="Close create menu"
                    onClick={() => setCreateOpen(false)}
                  />
                  <div className="create-menu__list" role="menu">
                    <p className="create-menu__note">
                      Create them in this order — a project needs a client, a deliverable needs a
                      project.
                    </p>
                    {createTargets.map((target) => (
                      <Link
                        key={target.label}
                        role="menuitem"
                        to={target.to}
                        search={{ new: "1" }}
                        onClick={() => setCreateOpen(false)}
                      >
                        <target.icon size={15} />
                        <span>
                          {target.label}
                          <small>{target.hint}</small>
                        </span>
                      </Link>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </header>
        <div className="screen">{children}</div>
      </main>
      {commandOpen ? (
        <div className="command-palette">
          <button
            type="button"
            className="command-palette__backdrop"
            onClick={() => setCommandOpen(false)}
            aria-label="Close command palette"
          />
          <section>
            <label>
              <Search size={16} />
              <input
                ref={commandInput}
                value={commandQuery}
                onChange={(event) => setCommandQuery(event.target.value)}
                placeholder="Search screens — clients, review, settings…"
              />
              <kbd>ESC</kbd>
            </label>
            <div>
              {matches.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.to} to={item.to} onClick={() => setCommandOpen(false)}>
                    <Icon size={16} />
                    <span>
                      {item.label}
                      <small>{item.hint}</small>
                    </span>
                  </Link>
                );
              })}
              {matches.length === 0 ? (
                <p className="command-palette__empty">
                  No screen matches “{commandQuery}”. This searches screen names, not clients or
                  deliverables.
                </p>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
      <UploadManager />
    </div>
  );
}

/** Sidebar footer read-out. Renders a muted dash until the first response so the
 * bar never shows a filled width it cannot justify. */
function CapacityMeter({ usage }: { usage?: StorageUsage }) {
  const percent = usage && usage.quotaBytes > 0 ? (usage.usedBytes / usage.quotaBytes) * 100 : 0;
  const clamped = Math.min(100, Math.max(usage && usage.usedBytes > 0 ? 0.5 : 0, percent));
  return (
    <div className="capacity" data-over={percent >= 90}>
      <span>
        Storage
        <HelpTip label="Storage">
          <p>
            Everything uploaded to this workspace: file versions and the files attached to comments.
            Approved work counts too — nothing is removed when a deliverable is approved.
          </p>
          <p>Ask your platform admin to raise the limit if you are close to it.</p>
        </HelpTip>
      </span>
      <span className="rx-mono">
        {usage ? `${formatBytes(usage.usedBytes)} / ${formatBytes(usage.quotaBytes)}` : "—"}
      </span>
      <i>
        <b style={{ width: `${clamped}%` }} />
      </i>
    </div>
  );
}

/**
 * Identity block and account menu. Sign-out lives here — before this, no shell
 * had one, so the only way out of a session was clearing cookies.
 * `compact` drops the name/role text for the client bar and admin rail.
 */
function UserRow({
  compact = false,
  settingsTo,
}: {
  compact?: boolean;
  settingsTo?: "/agency/settings";
}) {
  const navigate = useNavigate();
  const session = authClient.useSession();
  const workspace = useWorkspace();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const sessionUser = session.data?.user as { name?: string; email?: string } | undefined;
  const name = workspace.data?.user.name ?? sessionUser?.name ?? sessionUser?.email ?? "Signed out";
  const role = workspace.data?.user.role;

  async function signOut() {
    setSigningOut(true);
    await authClient.signOut();
    setSigningOut(false);
    setOpen(false);
    await navigate({ to: "/login" });
  }

  return (
    <div className="user-row-wrap" data-compact={compact}>
      {open ? (
        <>
          <button
            type="button"
            className="create-menu__backdrop"
            aria-label="Close account menu"
            onClick={() => setOpen(false)}
          />
          <div className="user-menu" role="menu">
            <div className="user-menu__identity">
              <strong>{name}</strong>
              <span>{workspace.data?.user.email ?? sessionUser?.email}</span>
              <small>{roleBlurb(role)}</small>
            </div>
            {settingsTo && canManageWorkspace(role) ? (
              <Link role="menuitem" to={settingsTo} onClick={() => setOpen(false)}>
                <Settings size={15} /> Workspace settings
              </Link>
            ) : null}
            <button type="button" role="menuitem" onClick={signOut} disabled={signingOut}>
              <LogOut size={15} /> {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </>
      ) : null}
      <button
        type="button"
        className="user-row"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Avatar initials={initialsFor(name)} label={`${name} — ${roleLabel(role)}`} />
        {compact ? null : (
          <>
            <div>
              <strong>{name}</strong>
              <span>{roleLabel(role)}</span>
            </div>
            <ChevronDown size={14} />
          </>
        )}
      </button>
    </div>
  );
}

/**
 * The client bar.
 *
 * Four nouns told a client nothing about which tab held the thing they were
 * emailed about, so each now carries the question it answers.
 */
const clientNav = [
  { label: "Needs you", to: "/client/home", hint: "Work waiting on your decision right now" },
  { label: "Projects", to: "/client/projects", hint: "Everything your agency is working on" },
  {
    label: "All work",
    to: "/client/review",
    hint: "Every piece of work shared with you, at whatever stage",
  },
  { label: "Approved", to: "/client/approved", hint: "What you have signed off, and the files" },
] as const;

export function ClientShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const workspace = useWorkspace();
  return (
    <div className="client-frame">
      <header className="client-bar">
        <div className="wordmark">
          <span className="wordmark__mark">R</span>
          <span>{workspace.data?.agency?.name ?? "RexOps"}</span>
        </div>
        <nav aria-label="Client navigation">
          {clientNav.map((item) => {
            const active = pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                data-active={active}
                aria-current={active ? "page" : undefined}
                title={`${item.label} — ${item.hint}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="client-bar__account">
          <HelpTip label="How reviewing works" align="end">
            <p>
              Your agency shares a cut with you. Open it, leave comments on the exact frame or
              region you mean, then approve it or request changes.
            </p>
            <p>
              Approving is recorded with your name and the time. Once approved, the files stay
              available under Approved.
            </p>
          </HelpTip>
          <LiveBell inboxPath="/client/home" />
          <UserRow compact />
        </div>
      </header>
      <main className="client-main">{children}</main>
    </div>
  );
}

const adminNav = [
  {
    label: "Agencies",
    to: "/admin/agencies",
    icon: Building2,
    hint: "Every agency on this installation, and how to add another",
  },
  {
    label: "Audit log",
    to: "/admin/audit",
    icon: ScrollText,
    hint: "Every recorded action across every workspace",
  },
] as const;

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <div className="admin-frame">
      <aside className="admin-rail">
        <div className="wordmark">
          <span className="wordmark__mark">R</span>
          <span>RexOps / platform</span>
        </div>
        <nav aria-label="Platform administration">
          {adminNav.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                data-active={active}
                aria-current={active ? "page" : undefined}
                title={`${item.label} — ${item.hint}`}
              >
                <Icon size={16} strokeWidth={1.7} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <span className="root-badge">
          <Sparkles size={12} /> Super admin
          <HelpTip label="Super admin" align="end">
            <p>
              You are outside every agency workspace. You can create agencies and read the audit
              log, but you are not a member of any workspace and will not see client work.
            </p>
          </HelpTip>
        </span>
        <a className="admin-rail__help" href="mailto:support@rexops.app">
          <LifeBuoy size={14} /> Get help
        </a>
        <UserRow compact />
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  );
}
