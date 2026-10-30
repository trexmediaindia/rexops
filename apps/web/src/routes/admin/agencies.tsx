import { Button, Callout, EmptyState, Skeleton, StatusChip } from "@rexops/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Check,
  Copy,
  KeyRound,
  PauseCircle,
  PlayCircle,
  Plus,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
import { AdminShell } from "../../components/app-shell";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { FormDialog } from "../../components/ui/form-dialog";
import { PageHeader } from "../../components/ui/page-header";
import { request } from "../../lib/request";
import type { AgencyRecord } from "../../lib/types";

type AgencyRow = AgencyRecord & { memberCount: number; suspendedAt?: string | null };
type OwnerLogin = { name: string; email: string; temporaryPassword: string };
type Handover = { agency: string; owner: OwnerLogin; isNew: boolean };

/** The owner's sign-in details, shown once, for the platform admin to pass on. */
function HandoverDialog({ handover, onClose }: { handover: Handover; onClose: () => void }) {
  const headingId = useId();
  const [copied, setCopied] = useState(false);
  const signInUrl = `${window.location.origin}/login`;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  return (
    <div className="review-dialog form-dialog">
      <button
        type="button"
        className="review-dialog__backdrop"
        onClick={onClose}
        aria-label="Close"
      />
      <section role="dialog" aria-modal="true" aria-labelledby={headingId}>
        <div>
          <strong id={headingId}>
            {handover.isNew ? `${handover.agency} is ready` : "New password set"}
          </strong>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={15} />
          </button>
        </div>
        <small>
          Hand these to {handover.owner.name} now. The password is stored only as a hash, so this is
          the last place it exists in the clear.
        </small>
        <div className="handover">
          <KeyRound size={18} />
          <dl>
            <div>
              <dt>Sign in at</dt>
              <dd className="rx-mono">{signInUrl}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd className="rx-mono">{handover.owner.email}</dd>
            </div>
            <div>
              <dt>Temporary password</dt>
              <dd className="rx-mono">{handover.owner.temporaryPassword}</dd>
            </div>
          </dl>
        </div>
        <footer className="form-dialog__foot">
          <button
            type="button"
            className="form-dialog__cancel"
            onClick={async () => {
              await navigator.clipboard?.writeText(
                `Sign in at ${signInUrl}\nEmail: ${handover.owner.email}\nTemporary password: ${handover.owner.temporaryPassword}`,
              );
              setCopied(true);
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}{" "}
            {copied ? "Copied" : "Copy all three"}
          </button>
          <button type="button" className="form-dialog__submit" onClick={onClose}>
            Done
          </button>
        </footer>
      </section>
    </div>
  );
}

export function AdminAgencies() {
  const queryClient = useQueryClient();
  const [provisioning, setProvisioning] = useState(false);
  const [handover, setHandover] = useState<Handover | null>(null);
  const [suspending, setSuspending] = useState<AgencyRow | null>(null);
  const [deleting, setDeleting] = useState<AgencyRow | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["agencies"] });

  const agencies = useQuery({
    queryKey: ["agencies"],
    queryFn: () => request<AgencyRow[]>("/api/agencies"),
  });

  const provision = useMutation({
    mutationFn: (values: Record<string, string>) =>
      request<AgencyRecord & { owner: OwnerLogin }>("/api/agencies", {
        method: "POST",
        body: JSON.stringify({
          name: values.name,
          slug: values.slug,
          owner: { name: values.ownerName, email: values.ownerEmail },
        }),
      }),
    onSuccess: (agency) => {
      refresh();
      provision.reset();
      setProvisioning(false);
      setHandover({ agency: agency.name, owner: agency.owner, isNew: true });
    },
  });

  const setSuspended = useMutation({
    mutationFn: ({ id, suspend }: { id: string; suspend: boolean }) =>
      request(`/api/agencies/${id}/${suspend ? "suspend" : "restore"}`, { method: "POST" }),
    onSuccess: () => {
      refresh();
      setSuspending(null);
    },
  });

  const resetOwner = useMutation({
    mutationFn: (agency: AgencyRow) =>
      request<{ owner: OwnerLogin }>(`/api/agencies/${agency.id}/reset-owner-password`, {
        method: "POST",
      }),
    onSuccess: (result, agency) =>
      setHandover({ agency: agency.name, owner: result.owner, isNew: false }),
  });

  const remove = useMutation({
    mutationFn: (agency: AgencyRow) =>
      request(`/api/agencies/${agency.id}`, {
        method: "DELETE",
        body: JSON.stringify({ confirm: agency.name }),
      }),
    onSuccess: () => {
      refresh();
      setDeleting(null);
    },
  });

  return (
    <AdminShell>
      <PageHeader
        eyebrow="Platform administration"
        title="Agencies"
        purpose="Every agency using this installation of Creative Dock. Each one is a separate workspace: its people, clients and files are invisible to the others."
        help={
          <>
            <p>
              Adding an agency creates the workspace and its first owner account in one go. That
              owner then adds their own team and clients.
            </p>
            <p>
              Suspending an agency signs out everyone in it, team and clients, until you restore it.
              Nothing is lost. Deleting erases the agency and everything in it for good.
            </p>
            <p>
              You are outside any single workspace here. Anything you read across agencies is
              written to the audit log with your name against it.
            </p>
          </>
        }
        primary={
          <Button onClick={() => setProvisioning(true)}>
            <Plus size={16} /> Add an agency
          </Button>
        }
      />
      <div className="root-warning">
        <ShieldCheck size={17} /> You are signed in as a platform administrator. Everything you
        change here is recorded in the audit log.
      </div>

      {agencies.isError ? (
        <Callout tone="danger" title="The agency list did not load">
          {(agencies.error as Error).message}
          <div className="rx-callout__action">
            <Button variant="secondary" onClick={() => agencies.refetch()}>
              Try loading it again
            </Button>
          </div>
        </Callout>
      ) : null}

      {agencies.isLoading ? (
        <section className="panel">
          <Skeleton lines={4} label="Loading agencies" />
        </section>
      ) : null}

      {!agencies.data?.length ? (
        !agencies.isLoading && !agencies.isError ? (
          <EmptyState
            icon={<Building2 size={22} />}
            title="No agencies yet"
            body="Nobody can sign in until an agency exists. Adding one creates the workspace and an owner account, and the owner takes it from there."
            action={
              <Button onClick={() => setProvisioning(true)}>
                <Plus size={16} /> Add the first agency
              </Button>
            }
          />
        ) : null
      ) : (
        <section className="panel">
          <table className="data-table admin-table">
            <thead>
              <tr className="data-table__head">
                <th scope="col">Agency</th>
                <th scope="col">Web address</th>
                <th scope="col">People</th>
                <th scope="col">Added</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {(agencies.data ?? []).map((agency) => (
                <tr className="data-table__row" key={agency.id}>
                  <th scope="row">
                    {agency.name} <small>{agency.slug}</small>
                  </th>
                  <td className="rx-mono">{agency.slug}</td>
                  <td className="rx-mono">{agency.memberCount}</td>
                  <td className="rx-mono">
                    {new Date(agency.createdAt)
                      .toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })
                      .toUpperCase()}
                  </td>
                  <td>
                    <StatusChip status={agency.suspendedAt ? "SUSPENDED" : "ACTIVE"} />
                  </td>
                  <td className="clients-table__actions">
                    {agency.suspendedAt ? (
                      <button
                        type="button"
                        disabled={setSuspended.isPending}
                        onClick={() => setSuspended.mutate({ id: agency.id, suspend: false })}
                      >
                        <PlayCircle size={14} /> Restore
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setSuspended.reset();
                          setSuspending(agency);
                        }}
                      >
                        <PauseCircle size={14} /> Suspend
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={resetOwner.isPending}
                      title="Sets a new temporary password for the agency's owner and signs them out"
                      onClick={() => resetOwner.mutate(agency)}
                    >
                      <KeyRound size={14} /> New owner password
                    </button>
                    <button
                      type="button"
                      className="row-action--danger"
                      aria-label={`Delete ${agency.name} permanently`}
                      onClick={() => {
                        remove.reset();
                        setDeleting(agency);
                      }}
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {setSuspended.isError && !suspending ? (
        <Callout tone="danger" title="That did not work">
          {(setSuspended.error as Error).message}
        </Callout>
      ) : null}
      {resetOwner.isError ? (
        <Callout tone="danger" title="No new password was set">
          {(resetOwner.error as Error).message}
        </Callout>
      ) : null}

      {handover ? <HandoverDialog handover={handover} onClose={() => setHandover(null)} /> : null}

      {suspending ? (
        <ConfirmDialog
          tone="danger"
          title={`Suspend ${suspending.name}?`}
          body={`All ${suspending.memberCount} people in it, their team and their clients, are signed out and can't sign in until you restore the agency.`}
          consequence="Nothing is deleted. Restore lets everyone back in exactly as they were (anyone the agency had suspended itself stays suspended)."
          confirmLabel={`Suspend ${suspending.name}`}
          pendingLabel="Suspending…"
          pending={setSuspended.isPending}
          error={setSuspended.error ? (setSuspended.error as Error).message : null}
          onConfirm={() => setSuspended.mutate({ id: suspending.id, suspend: true })}
          onClose={() => setSuspending(null)}
        />
      ) : null}

      {deleting ? (
        <ConfirmDialog
          tone="danger"
          title={`Delete ${deleting.name} for good?`}
          body="The agency, its people, clients, projects, work, files, comments, approvals and history will all be erased."
          consequence="This cannot be undone. To stop them using Creative Dock but keep everything, suspend the agency instead."
          typeToConfirm={deleting.name}
          confirmLabel="Delete permanently"
          pendingLabel="Deleting…"
          pending={remove.isPending}
          error={remove.error ? (remove.error as Error).message : null}
          onConfirm={() => remove.mutate(deleting)}
          onClose={() => setDeleting(null)}
        />
      ) : null}

      {provisioning ? (
        <FormDialog
          title="Add an agency"
          description="This creates the workspace and its first owner account together. The owner can sign in immediately and invite the rest of their team."
          submitLabel="Create the agency and its owner"
          pendingLabel="Creating the agency…"
          footnote="Nothing is emailed. Next you will see the owner's temporary password, once, to pass on yourself."
          pending={provision.isPending}
          error={provision.error ? (provision.error as Error).message : null}
          fields={[
            {
              name: "name",
              label: "Agency name",
              required: true,
              placeholder: "Northlight Studio",
              hint: "The name their team and their clients will see throughout the app.",
            },
            {
              name: "slug",
              label: "Web address",
              required: true,
              placeholder: "northlight-studio",
              hint: "Lower case, words joined by hyphens. It has to be unique across the platform and cannot be changed afterwards.",
            },
            {
              name: "ownerName",
              label: "Owner's full name",
              required: true,
              placeholder: "Priya Nair",
              hint: "The first account in the workspace. They can do everything, including adding other owners.",
            },
            {
              name: "ownerEmail",
              label: "Owner's email address",
              type: "email",
              required: true,
              placeholder: "priya@northlight.studio",
              hint: "This is the address they sign in with.",
            },
          ]}
          onSubmit={(values) => provision.mutate(values)}
          onClose={() => {
            provision.reset();
            setProvisioning(false);
          }}
        />
      ) : null}
    </AdminShell>
  );
}
