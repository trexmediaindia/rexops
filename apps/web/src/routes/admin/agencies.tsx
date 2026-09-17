import { Button, Callout, EmptyState, Skeleton, StatusChip } from "@rexops/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { AdminShell } from "../../components/app-shell";
import { FormDialog } from "../../components/ui/form-dialog";
import { PageHeader } from "../../components/ui/page-header";
import { request } from "../../lib/request";
import type { AgencyRecord } from "../../lib/types";

type AgencyRow = AgencyRecord & { memberCount: number };

export function AdminAgencies() {
  const queryClient = useQueryClient();
  const [provisioning, setProvisioning] = useState(false);

  const agencies = useQuery({
    queryKey: ["agencies"],
    queryFn: () => request<AgencyRow[]>("/api/agencies"),
  });

  const provision = useMutation({
    mutationFn: (values: Record<string, string>) =>
      request<AgencyRecord>("/api/agencies", {
        method: "POST",
        body: JSON.stringify({
          name: values.name,
          slug: values.slug,
          owner: { name: values.ownerName, email: values.ownerEmail },
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agencies"] });
      provision.reset();
      setProvisioning(false);
    },
  });

  return (
    <AdminShell>
      <PageHeader
        eyebrow="Platform administration"
        title="Agencies"
        purpose="Every agency using this installation of RexOps. Each one is a separate workspace: its people, clients and files are invisible to the others."
        help={
          <>
            <p>
              Adding an agency creates the workspace and its first owner account in one go. That
              owner then adds their own team and clients.
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
              </tr>
            </thead>
            <tbody>
              {(agencies.data ?? []).map((agency) => (
                <tr className="data-table__row" key={agency.id}>
                  <th scope="row">
                    {agency.name} <small>{agency.slug}</small>
                  </th>
                  <td className="rx-mono">{agency.slug}</td>
                  <td className="rx-mono">{String(agency.memberCount).padStart(2, "0")}</td>
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
                    <StatusChip status="ACTIVE" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {provisioning ? (
        <FormDialog
          title="Add an agency"
          description="This creates the workspace and its first owner account together. The owner can sign in immediately and invite the rest of their team."
          submitLabel="Create the agency and its owner"
          pendingLabel="Creating the agency…"
          footnote="Nothing is emailed automatically. Pass the sign-in details to the owner yourself."
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
