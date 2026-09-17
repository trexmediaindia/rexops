import { Button, Callout, SaveState, Select, Skeleton, Toggle } from "@rexops/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ExternalLink, ListChecks, Users, Workflow } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AgencyShell } from "../../components/app-shell";
import { Field, SettingsSection } from "../../components/ui/field";
import { PageHeader } from "../../components/ui/page-header";
import { useFeatures } from "../../lib/features";
import { formatBytes } from "../../lib/format";
import { request } from "../../lib/request";
import type { StorageUsage } from "../../lib/types";
import {
  canManageWorkspace,
  useUpdatePreferences,
  useWorkspace,
  type WorkspacePreferences,
} from "../../lib/workspace";

/**
 * Workspace settings.
 *
 * `/agency/settings` used to render the automation rule builder, so everything a
 * user expects to find in settings — the workspace's own name, its branding, the
 * defaults that decide how work moves — existed nowhere in the product.
 *
 * Every control here states four things: what it is called in the user's
 * language, what it does, what it is set to now, and what changing it will
 * actually cause. Nothing is labelled "Mode", "Level" or "Type".
 */
export function AgencySettingsPage() {
  const workspace = useWorkspace();
  const features = useFeatures();
  const storage = useQuery({
    queryKey: ["storage"],
    queryFn: () => request<StorageUsage>("/api/storage"),
    retry: false,
  });

  const role = workspace.data?.user.role;
  const editable = canManageWorkspace(role);

  return (
    <AgencyShell>
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        purpose="Your workspace's name, how it looks to clients, and the defaults that decide how work moves through it."
        help={
          <>
            <p>
              These settings apply to everyone in this workspace, not just to you. Changing a
              default does not alter work that already exists.
            </p>
            <p>Only owners and admins can change them. Everyone else sees them read-only.</p>
          </>
        }
      />

      {workspace.isPending ? (
        <div className="settings-stack">
          <Skeleton lines={4} label="Loading your workspace settings" />
        </div>
      ) : workspace.isError ? (
        <Callout tone="danger" title="Settings did not load">
          {(workspace.error as Error).message} Your session may have expired.
          <div className="rx-callout__action">
            <Button variant="secondary" onClick={() => workspace.refetch()}>
              Try loading settings again
            </Button>
          </div>
        </Callout>
      ) : (
        <div className="settings-stack">
          {!editable ? (
            <Callout tone="info" title="You can read these but not change them">
              Changing workspace settings needs the owner or admin role. Ask an owner in your team
              if something here needs to change.
            </Callout>
          ) : null}

          <GeneralSection editable={editable} />
          <AppearanceSection editable={editable} />
          <BehaviorSection editable={editable} />

          <SettingsSection
            title="Who can do what"
            purpose="Roles, permissions and the review stages that decide when work moves forward live on their own screens."
          >
            <div className="settings-links">
              <Link to="/agency/team" className="settings-link">
                <Users size={17} />
                <span>
                  Team and permissions
                  <small>Invite colleagues and choose what each of them can do.</small>
                </span>
              </Link>
              {features.data?.["review.wedge"] ? (
                <Link to="/agency/settings/pipelines" className="settings-link">
                  <ListChecks size={17} />
                  <span>
                    Review stages
                    <small>Who has to sign off, in what order, and how long they get.</small>
                  </span>
                </Link>
              ) : null}
              {features.data?.automation ? (
                <Link to="/agency/automation" className="settings-link">
                  <Workflow size={17} />
                  <span>
                    Automation
                    <small>Rules that act on a deliverable when its status changes.</small>
                  </span>
                </Link>
              ) : null}
            </div>
          </SettingsSection>

          <AdvancedSection storage={storage.data} />
        </div>
      )}
    </AgencyShell>
  );
}

/** Name and address. Both are visible to clients, which is why they are first. */
function GeneralSection({ editable }: { editable: boolean }) {
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  const agency = workspace.data?.agency;

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [errors, setErrors] = useState<{ name?: string; slug?: string }>({});

  useEffect(() => {
    if (!agency) return;
    setName(agency.name);
    setSlug(agency.slug);
  }, [agency]);

  const save = useMutation({
    mutationFn: (input: { name: string; slug: string }) =>
      request(`/api/agencies/${agency?.id}`, { method: "PATCH", body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workspace"] }),
  });

  const dirty = Boolean(agency) && (name !== agency?.name || slug !== agency?.slug);

  /** Validated here rather than at the API, so the message names the field and
   * says what a valid value looks like instead of returning a 422. */
  function validate() {
    const next: { name?: string; slug?: string } = {};
    if (name.trim().length < 2) next.name = "Give the workspace a name of at least two characters.";
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug.trim())) {
      next.slug =
        "Use lowercase letters, numbers and single hyphens only — for example, north-star-studio.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  return (
    <SettingsSection
      title="General"
      purpose="What this workspace is called, and the address your clients use to reach it."
      action={
        <SaveState
          state={
            save.isPending
              ? "saving"
              : save.isError
                ? "error"
                : save.isSuccess && !dirty
                  ? "saved"
                  : dirty
                    ? "dirty"
                    : "idle"
          }
          error={save.error ? (save.error as Error).message : null}
          savedLabel="Workspace updated"
        />
      }
    >
      <Field
        label="Workspace name"
        hint="Shown in your sidebar, in client emails, and at the top of the client portal."
        error={errors.name}
      >
        {(props) => (
          <input
            {...props}
            type="text"
            value={name}
            disabled={!editable}
            placeholder="North Star Studio"
            onChange={(event) => setName(event.target.value)}
            onBlur={() => dirty && validate()}
          />
        )}
      </Field>

      <Field
        label="Workspace address"
        hint="The part of the link your clients see. Lowercase letters, numbers and hyphens."
        help={
          <p>
            Client portal links are built from this. Changing it breaks links you have already sent,
            so change it only if the old one is wrong.
          </p>
        }
        error={errors.slug}
      >
        {(props) => (
          <div className="settings-slug">
            <span>rexops.app/</span>
            <input
              {...props}
              type="text"
              value={slug}
              disabled={!editable}
              placeholder="north-star-studio"
              onChange={(event) => setSlug(event.target.value.toLowerCase())}
              onBlur={() => dirty && validate()}
            />
          </div>
        )}
      </Field>

      {editable ? (
        <div className="settings-actions">
          <Button
            onClick={() => {
              if (!validate()) return;
              save.mutate({ name: name.trim(), slug: slug.trim() });
            }}
            disabled={!dirty || save.isPending}
          >
            {save.isPending ? "Saving workspace…" : "Save workspace details"}
          </Button>
          {dirty ? (
            <Button
              variant="ghost"
              onClick={() => {
                setName(agency?.name ?? "");
                setSlug(agency?.slug ?? "");
                setErrors({});
              }}
            >
              Discard changes
            </Button>
          ) : null}
        </div>
      ) : null}
    </SettingsSection>
  );
}

/** Branding, which only matters because clients see it. */
function AppearanceSection({ editable }: { editable: boolean }) {
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  const agency = workspace.data?.agency;

  const [color, setColor] = useState("#f2a341");
  const [logo, setLogo] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!agency) return;
    setColor(agency.brandColor ?? "#f2a341");
    setLogo(agency.logoUrl ?? "");
  }, [agency]);

  const save = useMutation({
    mutationFn: (input: { brandColor: string; logoUrl: string | null }) =>
      request(`/api/agencies/${agency?.id}`, { method: "PATCH", body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workspace"] }),
  });

  const dirty =
    Boolean(agency) &&
    (color !== (agency?.brandColor ?? "#f2a341") || logo !== (agency?.logoUrl ?? ""));

  return (
    <SettingsSection
      title="Appearance"
      purpose="How this workspace looks to your clients. It does not change how the app looks to your team."
      action={
        <SaveState
          state={
            save.isPending
              ? "saving"
              : save.isError
                ? "error"
                : save.isSuccess && !dirty
                  ? "saved"
                  : dirty
                    ? "dirty"
                    : "idle"
          }
          error={save.error ? (save.error as Error).message : null}
          savedLabel="Branding updated"
        />
      }
    >
      <Field
        label="Brand colour"
        hint="Used for buttons and highlights on the client portal and on share links."
      >
        {(props) => (
          <div className="settings-color">
            <input
              {...props}
              type="color"
              value={color}
              disabled={!editable}
              onChange={(event) => setColor(event.target.value)}
            />
            <code>{color}</code>
            <span>Currently {color === "#f2a341" ? "the RexOps default" : "your own colour"}</span>
          </div>
        )}
      </Field>

      <Field
        label="Logo image address"
        optional
        hint="A link to your logo, shown to clients instead of the RexOps mark. PNG or SVG on a transparent background works best."
        error={error}
      >
        {(props) => (
          <input
            {...props}
            type="url"
            value={logo}
            disabled={!editable}
            placeholder="https://example.com/logo.svg"
            onChange={(event) => setLogo(event.target.value)}
            onBlur={() => {
              if (!logo.trim()) return setError(null);
              setError(
                /^https?:\/\/.+/.test(logo.trim())
                  ? null
                  : "Paste a full link starting with https://",
              );
            }}
          />
        )}
      </Field>

      {logo.trim() && !error ? (
        <div className="settings-logo-preview">
          <span>What clients will see</span>
          <img src={logo} alt="Your logo as clients will see it" />
        </div>
      ) : null}

      {editable ? (
        <div className="settings-actions">
          <Button
            disabled={!dirty || save.isPending || Boolean(error)}
            onClick={() => save.mutate({ brandColor: color, logoUrl: logo.trim() || null })}
          >
            {save.isPending ? "Saving branding…" : "Save branding"}
          </Button>
        </div>
      ) : null}
    </SettingsSection>
  );
}

const LANDING_OPTIONS = [
  { value: "dashboard", label: "Dashboard", hint: "What needs attention today" },
  { value: "work", label: "Work board", hint: "Every deliverable in one view" },
  { value: "review", label: "Review queue", hint: "Only what is waiting on a decision" },
];

/**
 * Defaults. Each of these exists so a first-time owner does not have to configure
 * anything for the product to behave sensibly — the value shipped is the sensible
 * one, and the control says what changing it would do.
 */
function BehaviorSection({ editable }: { editable: boolean }) {
  const workspace = useWorkspace();
  const update = useUpdatePreferences();
  const preferences = workspace.data?.agency?.preferences;

  const set = <K extends keyof WorkspacePreferences>(key: K, value: WorkspacePreferences[K]) =>
    update.mutate({ [key]: value } as Partial<WorkspacePreferences>);

  const [dueSoon, setDueSoon] = useState("7");
  const [expiry, setExpiry] = useState("14");
  useEffect(() => {
    if (!preferences) return;
    setDueSoon(String(preferences.dueSoonWindowDays));
    setExpiry(String(preferences.shareLinkExpiryDays));
  }, [preferences]);

  const dueSoonError = useMemo(() => {
    const value = Number(dueSoon);
    if (!Number.isInteger(value) || value < 1 || value > 60) {
      return "Enter a whole number of days between 1 and 60.";
    }
    return null;
  }, [dueSoon]);

  const expiryError = useMemo(() => {
    const value = Number(expiry);
    if (!Number.isInteger(value) || value < 1 || value > 365) {
      return "Enter a whole number of days between 1 and 365.";
    }
    return null;
  }, [expiry]);

  if (!preferences) return null;

  return (
    <SettingsSection
      title="How work moves"
      purpose="Defaults that apply to every new deliverable and every share link. Changing one does not affect work that already exists."
      action={
        <SaveState
          state={
            update.isPending
              ? "saving"
              : update.isError
                ? "error"
                : update.isSuccess
                  ? "saved"
                  : "idle"
          }
          error={update.error ? (update.error as Error).message : null}
          savedLabel="Default saved"
        />
      }
    >
      <Field
        label="Where you land after signing in"
        hint="The first screen this workspace opens on. Everyone in the workspace gets the same one."
      >
        {(props) => (
          <Select
            id={props.id}
            value={preferences.defaultLanding}
            options={LANDING_OPTIONS}
            disabled={!editable}
            onChange={(value) =>
              set("defaultLanding", value as WorkspacePreferences["defaultLanding"])
            }
          />
        )}
      </Field>

      <Toggle
        label="Send to the client automatically once internal review passes"
        hint="When your team's last internal reviewer approves a deliverable, it moves straight into client review without anyone pressing a button."
        checked={preferences.autoSendToClientOnInternalApproval}
        disabled={!editable}
        onChange={(next) => set("autoSendToClientOnInternalApproval", next)}
        effect={
          preferences.autoSendToClientOnInternalApproval
            ? "On: clients see work as soon as your team signs off internally."
            : "Off: someone on your team decides when each cut goes to the client."
        }
      />

      <Toggle
        label="Ask before archiving a client or project"
        hint="Archiving hides a record and everything under it. The confirmation names what is about to be hidden."
        checked={preferences.confirmBeforeArchiving}
        disabled={!editable}
        onChange={(next) => set("confirmBeforeArchiving", next)}
        effect={
          preferences.confirmBeforeArchiving
            ? "On: archiving takes two clicks and shows what it affects."
            : "Off: archiving happens immediately. Nothing is deleted, but nothing warns you either."
        }
      />

      <Toggle
        label="Show the setup guide on the dashboard"
        hint="A five-step checklist for getting a first piece of work through the pipeline. It disappears on its own once every step is done."
        checked={preferences.showSetupGuide}
        disabled={!editable}
        onChange={(next) => set("showSetupGuide", next)}
      />

      <Field
        label="Warn that a deliverable is due soon"
        hint="How many days before a due date work starts showing as due soon. Between 1 and 60 days."
        error={dueSoonError}
      >
        {(props) => (
          <div className="settings-number">
            <input
              {...props}
              type="number"
              min={1}
              max={60}
              value={dueSoon}
              disabled={!editable}
              onChange={(event) => setDueSoon(event.target.value)}
              onBlur={() => {
                if (dueSoonError) return;
                set("dueSoonWindowDays", Number(dueSoon));
              }}
            />
            <span>days before the due date</span>
          </div>
        )}
      </Field>

      <Field
        label="Share links stop working after"
        hint="The default lifetime of a link you send to someone outside RexOps. You can still set a different date on an individual link."
        error={expiryError}
      >
        {(props) => (
          <div className="settings-number">
            <input
              {...props}
              type="number"
              min={1}
              max={365}
              value={expiry}
              disabled={!editable}
              onChange={(event) => setExpiry(event.target.value)}
              onBlur={() => {
                if (expiryError) return;
                set("shareLinkExpiryDays", Number(expiry));
              }}
            />
            <span>days</span>
          </div>
        )}
      </Field>
    </SettingsSection>
  );
}

const FEATURE_COPY: Record<string, { label: string; hint: string }> = {
  "files.versioning": {
    label: "File versions",
    hint: "Upload v1, v2, v3 of a deliverable and compare them side by side.",
  },
  "review.wedge": {
    label: "Review and approvals",
    hint: "The review room, comments on a frame or region, and recorded sign-off.",
  },
  "collaboration.live": {
    label: "Live collaboration",
    hint: "Presence, the inbox, and notifications when something needs you.",
  },
  "work.views": {
    label: "Work views",
    hint: "The board, list, calendar and timeline views of every deliverable.",
  },
  automation: { label: "Automation", hint: "Rules that act when a deliverable changes status." },
  analytics: {
    label: "Reporting",
    hint: "Dashboard metrics, the client roll-up and the audit log.",
  },
};

/**
 * Things a user reads rather than sets: what this install has switched on, how
 * much storage is gone, and the identifier support will ask for.
 */
function AdvancedSection({ storage }: { storage?: StorageUsage }) {
  const features = useFeatures();
  const workspace = useWorkspace();
  const [open, setOpen] = useState(false);
  const percent =
    storage && storage.quotaBytes > 0
      ? Math.round((storage.usedBytes / storage.quotaBytes) * 100)
      : 0;

  return (
    <SettingsSection
      title="Advanced"
      purpose="Information you will only need when something is wrong or when support asks for it."
      action={
        <Button variant="ghost" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
          {open ? "Hide advanced details" : "Show advanced details"}
        </Button>
      }
    >
      {open ? (
        <>
          <div className="settings-readout">
            <div>
              <dt>Storage used</dt>
              <dd>
                {storage
                  ? `${formatBytes(storage.usedBytes)} of ${formatBytes(storage.quotaBytes)} (${percent}%)`
                  : "Not available"}
              </dd>
              {storage ? (
                <small>
                  {storage.versionCount} file versions and {storage.attachmentCount} comment
                  attachments. Nothing is removed when work is approved.
                </small>
              ) : null}
            </div>
            <div>
              <dt>Workspace ID</dt>
              <dd className="rx-mono">{workspace.data?.agency?.id ?? "—"}</dd>
              <small>Quote this if you contact support about this workspace.</small>
            </div>
          </div>

          <div>
            <h3 className="settings-subheading">What this install has switched on</h3>
            <p className="rx-field__hint">
              Features are set by whoever runs this install, not from here. A feature that is off
              hides its screens rather than showing them empty.
            </p>
            <ul className="settings-features">
              {Object.entries(FEATURE_COPY).map(([key, copy]) => {
                const on = features.data?.[key as keyof typeof features.data] === true;
                return (
                  <li key={key} data-on={on}>
                    <strong>{copy.label}</strong>
                    <span>{on ? "On" : "Off"}</span>
                    <small>{copy.hint}</small>
                  </li>
                );
              })}
            </ul>
          </div>

          <Callout tone="info" title="Closing this workspace">
            Workspaces are created and removed by whoever runs this RexOps install. Ask them if you
            need this one closed.
            <div className="rx-callout__action">
              <a className="rx-action" href="mailto:support@rexops.app">
                Email support <ExternalLink size={13} />
              </a>
            </div>
          </Callout>
        </>
      ) : (
        <p className="rx-field__hint">
          Storage, this workspace's identifier, and which features this install has switched on.
        </p>
      )}
    </SettingsSection>
  );
}
