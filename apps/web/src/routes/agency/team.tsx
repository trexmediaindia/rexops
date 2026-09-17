import {
  Avatar,
  Button,
  Callout,
  EmptyState,
  humanize,
  SegmentedControl,
  Select,
  Skeleton,
  StatusChip,
} from "@rexops/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, KeyRound, Search, ShieldCheck, UserPlus, Users, X } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { AgencyShell } from "../../components/app-shell";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { FormDialog } from "../../components/ui/form-dialog";
import { PageHeader } from "../../components/ui/page-header";
import { authClient } from "../../lib/auth-client";
import { request } from "../../lib/request";
import type {
  AgencyRole,
  InvitedTeamMember,
  PermissionFlags,
  Specialty,
  TeamMember,
} from "../../lib/types";

const ROLE_LABEL: Record<AgencyRole, string> = {
  AGENCY_OWNER: "Owner",
  AGENCY_ADMIN: "Admin",
  AGENCY_MEMBER: "Member",
};

const ROLE_BLURB: Record<AgencyRole, string> = {
  AGENCY_OWNER: "Full control, including billing and other owners.",
  AGENCY_ADMIN: "Everything except unmaking an owner.",
  AGENCY_MEMBER: "Scoped by the permission flags below.",
};

const SPECIALTIES: Specialty[] = [
  "GENERAL",
  "EDITOR",
  "MOTION",
  "DESIGNER",
  "PHOTOGRAPHER",
  "PM",
  "ACCOUNT",
];

const PERMISSIONS: Array<{ key: keyof PermissionFlags; label: string; hint: string }> = [
  { key: "canApprove", label: "Approve deliverables", hint: "Can close a review stage." },
  { key: "canUploadFinal", label: "Upload final files", hint: "Can promote a version to client." },
  {
    key: "canViewAllClients",
    label: "See every client",
    hint: "Otherwise limited to their projects.",
  },
  { key: "canInviteClients", label: "Invite clients", hint: "Can create client portal users." },
  { key: "canManageTeam", label: "Manage the team", hint: "Can invite and edit teammates." },
  {
    key: "canManageAutomations",
    label: "Manage automations",
    hint: "Can edit rules and pipelines.",
  },
];

/** Owner and admin clear every gate through the role itself, so their flags are
 * shown as inherited rather than as switches that appear to do nothing. */
function inheritsEverything(role: AgencyRole) {
  return role === "AGENCY_OWNER" || role === "AGENCY_ADMIN";
}

export function TeamPage() {
  const queryClient = useQueryClient();
  const session = authClient.useSession();
  const currentUserId = session.data?.user?.id;
  const [query, setQuery] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [suspending, setSuspending] = useState<TeamMember | null>(null);
  const [inviting, setInviting] = useState(false);
  const [managing, setManaging] = useState<TeamMember | null>(null);
  const [handover, setHandover] = useState<InvitedTeamMember | null>(null);

  const team = useQuery({
    queryKey: ["team"],
    queryFn: () => request<TeamMember[]>("/api/team"),
  });

  const invite = useMutation({
    mutationFn: (values: Record<string, string>) =>
      request<InvitedTeamMember>("/api/team", { method: "POST", body: JSON.stringify(values) }),
    onSuccess: (member) => {
      queryClient.invalidateQueries({ queryKey: ["team"] });
      setInviting(false);
      setHandover(member);
    },
  });

  const save = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      request<TeamMember>(`/api/team/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team"] }),
  });

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (team.data ?? [])
      .filter((member) => (activeOnly ? !member.banned : true))
      .filter((member) =>
        needle ? `${member.name} ${member.email}`.toLowerCase().includes(needle) : true,
      );
  }, [team.data, query, activeOnly]);

  const roster = team.data ?? [];
  const active = roster.filter((member) => !member.banned).length;
  const suspendedCount = roster.filter((member) => member.banned).length;
  const unassigned = roster.filter((member) => !member.banned && member.openDeliverables === 0);

  return (
    <AgencyShell>
      <PageHeader
        eyebrow="Who can get in"
        title="Team"
        purpose="Everyone at your agency who can sign in, what each of them is allowed to do, and how much work they are carrying."
        help={
          <>
            <p>
              Role sets the broad level of access. Owners and admins can do everything; members are
              limited to the specific permissions you switch on for them.
            </p>
            <p>
              Adding someone here gives them a sign-in straight away. Clients are added separately,
              on the Clients screen, and never see this list.
            </p>
          </>
        }
        primary={
          <Button onClick={() => setInviting(true)}>
            <UserPlus size={16} /> Add a teammate
          </Button>
        }
      />

      <div className="list-toolbar">
        <label>
          <Search size={15} />
          <input
            placeholder="Search by name or email"
            aria-label="Search teammates by name or email"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <SegmentedControl<"active" | "all">
          label="Show"
          value={activeOnly ? "active" : "all"}
          onChange={(next) => setActiveOnly(next === "active")}
          options={[
            { value: "active", label: "Active", hint: "People who can sign in right now" },
            {
              value: "all",
              label: `Everyone${suspendedCount ? ` (${suspendedCount} suspended)` : ""}`,
              hint: "Includes people whose access has been switched off",
            },
          ]}
        />
      </div>

      {team.isLoading ? (
        <section className="panel">
          <Skeleton lines={5} label="Loading the team" />
        </section>
      ) : null}
      {team.isError ? (
        <Callout tone="danger" title="The team list did not load">
          {(team.error as Error).message}
          <div className="rx-callout__action">
            <Button variant="secondary" onClick={() => team.refetch()}>
              Try loading it again
            </Button>
          </div>
        </Callout>
      ) : null}

      {!team.isLoading && !team.isError && !rows.length ? (
        <EmptyState
          icon={<Users size={22} />}
          title={
            query
              ? "Nobody matches that search"
              : activeOnly && suspendedCount
                ? "Nobody is active right now"
                : "No teammates yet"
          }
          body={
            query
              ? `Nothing in the roster matches "${query.trim()}". Searching looks at names and email addresses only.`
              : activeOnly && suspendedCount
                ? `Everyone on this workspace is suspended. Switch to "Everyone" to see them and reinstate anyone who should be back.`
                : "Deliverables get assigned to people, and reviews get approved by them, so add whoever will be doing the work. They can sign in as soon as you add them."
          }
          action={
            query ? (
              <Button variant="secondary" onClick={() => setQuery("")}>
                Clear the search
              </Button>
            ) : activeOnly && suspendedCount ? (
              <Button variant="secondary" onClick={() => setActiveOnly(false)}>
                Show suspended teammates
              </Button>
            ) : (
              <Button onClick={() => setInviting(true)}>
                <UserPlus size={16} /> Add your first teammate
              </Button>
            )
          }
        />
      ) : rows.length ? (
        <section className="panel">
          <table className="data-table team-table">
            <thead>
              <tr className="data-table__head">
                <th scope="col">Teammate</th>
                <th scope="col">Role</th>
                <th scope="col">Speciality</th>
                <th scope="col">Open work</th>
                <th scope="col">Projects</th>
                <th scope="col">Last signed in</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((member) => (
                <tr className="data-table__row" key={member.id} data-suspended={member.banned}>
                  <th scope="row">
                    <Avatar initials={initialsOf(member.name)} label={member.name} />
                    <div className="team-table__identity">
                      <strong>
                        {member.name}
                        {member.id === currentUserId ? <em>you</em> : null}
                      </strong>
                      <span>{member.email}</span>
                    </div>
                  </th>
                  <td>
                    <StatusChip status={member.banned ? "SUSPENDED" : ROLE_LABEL[member.role]} />
                  </td>
                  <td className="team-table__craft">{humanize(member.specialty ?? "GENERAL")}</td>
                  <td className="rx-mono">{member.openDeliverables}</td>
                  <td className="rx-mono">{member.projectCount}</td>
                  <td className="team-table__seen">{relativeTime(member.lastSeenAt)}</td>
                  <td className="team-table__actions">
                    <button type="button" onClick={() => setManaging(member)}>
                      <ShieldCheck size={14} /> Change what they can do
                    </button>
                    {member.id === currentUserId ? null : (
                      /* Suspending cuts somebody off mid-project, so it asks first.
                         Reinstating is harmless and stays one click. */
                      <button
                        type="button"
                        disabled={save.isPending}
                        onClick={() =>
                          member.banned
                            ? save.mutate({ id: member.id, patch: { banned: false } })
                            : setSuspending(member)
                        }
                      >
                        {member.banned ? "Give access back" : "Suspend access"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {save.isError ? (
        <Callout tone="danger" title="That change was not saved">
          {(save.error as Error).message}
        </Callout>
      ) : null}

      {suspending ? (
        <ConfirmDialog
          title={`Suspend ${suspending.name}?`}
          body="They are signed out and cannot sign in again until you give the access back."
          consequence={
            suspending.openDeliverables
              ? `They still have ${suspending.openDeliverables} open deliverable${suspending.openDeliverables === 1 ? "" : "s"}. The work stays assigned to them and will need reassigning.`
              : "Their comments, approvals and past work stay exactly as they are."
          }
          confirmLabel="Suspend their access"
          pendingLabel="Suspending…"
          cancelLabel="Leave them active"
          tone="danger"
          pending={save.isPending}
          error={save.error ? (save.error as Error).message : null}
          onConfirm={() => {
            save.mutate(
              { id: suspending.id, patch: { banned: true } },
              { onSuccess: () => setSuspending(null) },
            );
          }}
          onClose={() => setSuspending(null)}
        />
      ) : null}

      <div className="list-footnote">
        <Users size={15} /> {active} teammate{active === 1 ? "" : "s"} can sign in
        {unassigned.length
          ? ` · ${unassigned.length} with no open work, so free to take something on`
          : null}
      </div>

      {inviting ? (
        <FormDialog
          title="Add a teammate"
          description="This creates their sign-in immediately. The next screen gives you a one-time password to pass on to them."
          submitLabel="Add them to the team"
          pendingLabel="Adding them…"
          pending={invite.isPending}
          error={invite.error ? (invite.error as Error).message : null}
          fields={[
            { name: "name", label: "Full name", required: true, placeholder: "Riya Sharma" },
            {
              name: "email",
              label: "Work email",
              type: "email",
              required: true,
              placeholder: "riya@youragency.com",
            },
            {
              name: "role",
              label: "Role",
              type: "select",
              defaultValue: "AGENCY_MEMBER",
              options: (Object.keys(ROLE_LABEL) as AgencyRole[])
                .reverse()
                .map((role) => ({ value: role, label: ROLE_LABEL[role] })),
              hint: "Members are scoped by permission flags; admins and owners are not.",
            },
            {
              name: "specialty",
              label: "Speciality",
              hint: "What they mainly do. Used for filtering and assignment; it grants no access of its own.",
              type: "select",
              defaultValue: "GENERAL",
              options: SPECIALTIES.map((value) => ({ value, label: titleCase(value) })),
            },
          ]}
          onSubmit={(values) => invite.mutate(values)}
          onClose={() => {
            invite.reset();
            setInviting(false);
          }}
        />
      ) : null}

      {handover ? <HandoverDialog member={handover} onClose={() => setHandover(null)} /> : null}

      {managing ? (
        <AccessDialog
          member={managing}
          isSelf={managing.id === currentUserId}
          pending={save.isPending}
          error={save.error ? (save.error as Error).message : null}
          onSave={(patch) =>
            save.mutate({ id: managing.id, patch }, { onSuccess: () => setManaging(null) })
          }
          onClose={() => {
            save.reset();
            setManaging(null);
          }}
        />
      ) : null}
    </AgencyShell>
  );
}

/**
 * The one-time credential handover. There is no outbound email in this stack, so
 * the password exists in exactly one place — this dialog — and only until it is
 * dismissed.
 */
function HandoverDialog({ member, onClose }: { member: InvitedTeamMember; onClose: () => void }) {
  const headingId = useId();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function copy() {
    await navigator.clipboard?.writeText(`${member.email} / ${member.temporaryPassword}`);
    setCopied(true);
  }

  return (
    <div className="review-dialog form-dialog">
      <button
        type="button"
        className="review-dialog__backdrop"
        onClick={onClose}
        aria-label="Close handover"
      />
      <section role="dialog" aria-modal="true" aria-labelledby={headingId}>
        <div>
          <strong id={headingId}>{member.name} is on the team</strong>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={15} />
          </button>
        </div>
        <small>
          Hand these over now. The password is stored only as a hash — this screen is the last place
          it exists in the clear.
        </small>
        <div className="handover">
          <KeyRound size={18} />
          <dl>
            <div>
              <dt>Email</dt>
              <dd className="rx-mono">{member.email}</dd>
            </div>
            <div>
              <dt>Temporary password</dt>
              <dd className="rx-mono">{member.temporaryPassword}</dd>
            </div>
          </dl>
        </div>
        <footer className="form-dialog__foot">
          <button type="button" className="form-dialog__cancel" onClick={copy}>
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy both"}
          </button>
          <button type="button" className="form-dialog__submit" onClick={onClose}>
            Done
          </button>
        </footer>
      </section>
    </div>
  );
}

/** Role, craft, and the six permission flags for one teammate. */
function AccessDialog({
  member,
  isSelf,
  pending,
  error,
  onSave,
  onClose,
}: {
  member: TeamMember;
  isSelf: boolean;
  pending: boolean;
  error: string | null;
  onSave: (patch: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const headingId = useId();
  const [role, setRole] = useState<AgencyRole>(member.role);
  const [specialty, setSpecialty] = useState<Specialty>(member.specialty ?? "GENERAL");
  const [permissions, setPermissions] = useState<PermissionFlags>(member.permissions);
  const inherited = inheritsEverything(role);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const dirty =
    role !== member.role ||
    specialty !== (member.specialty ?? "GENERAL") ||
    PERMISSIONS.some(({ key }) => permissions[key] !== member.permissions[key]);

  function submit() {
    if (!dirty || pending) return;
    const patch: Record<string, unknown> = { specialty };
    if (!isSelf) {
      patch.role = role;
      patch.permissions = permissions;
    }
    onSave(patch);
  }

  return (
    <div className="review-dialog form-dialog access-dialog">
      <button
        type="button"
        className="review-dialog__backdrop"
        onClick={onClose}
        aria-label="Close access"
      />
      <section role="dialog" aria-modal="true" aria-labelledby={headingId}>
        <div>
          <strong id={headingId}>{member.name}</strong>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={15} />
          </button>
        </div>
        <small>{member.email}</small>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="form-dialog__field">
            <label htmlFor="access-role">Role</label>
            <Select
              id="access-role"
              value={role}
              disabled={isSelf}
              options={(Object.keys(ROLE_LABEL) as AgencyRole[])
                .reverse()
                .map((value) => ({ value, label: ROLE_LABEL[value] }))}
              onChange={(value) => setRole(value as AgencyRole)}
            />
            <em className="form-dialog__hint">
              {isSelf ? "You cannot change your own role." : ROLE_BLURB[role]}
            </em>
          </div>

          <div className="form-dialog__field">
            <label htmlFor="access-craft">Craft</label>
            <Select
              id="access-craft"
              value={specialty}
              options={SPECIALTIES.map((value) => ({ value, label: titleCase(value) }))}
              onChange={(value) => setSpecialty(value as Specialty)}
            />
          </div>

          <fieldset className="permission-grid" disabled={isSelf || inherited}>
            <legend>
              Permissions
              {inherited ? (
                <em> — inherited from the {ROLE_LABEL[role].toLowerCase()} role</em>
              ) : null}
            </legend>
            {PERMISSIONS.map(({ key, label, hint }) => (
              <label key={key} className="permission-grid__row">
                <input
                  type="checkbox"
                  checked={inherited || permissions[key]}
                  onChange={(event) =>
                    setPermissions((current) => ({ ...current, [key]: event.target.checked }))
                  }
                />
                <span>
                  <strong>{label}</strong>
                  <small>{hint}</small>
                </span>
              </label>
            ))}
          </fieldset>

          {error ? (
            <p className="form-dialog__error" role="alert">
              {error}
            </p>
          ) : null}

          <footer className="form-dialog__foot">
            <button type="button" className="form-dialog__cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="form-dialog__submit" disabled={!dirty || pending}>
              {pending ? "Saving…" : "Save access"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "RX"
  );
}

function titleCase(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

/** Coarse "last seen" from the newest session row. Precision past a day is noise. */
function relativeTime(value: string | null) {
  if (!value) return "Never";
  const elapsed = Date.now() - new Date(value).getTime();
  const hours = Math.floor(elapsed / 3_600_000);
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
}
