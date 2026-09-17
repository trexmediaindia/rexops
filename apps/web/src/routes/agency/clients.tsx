import { Button, Callout, EmptyState, SegmentedControl, Skeleton, StatusChip } from "@rexops/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Archive, Building2, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { AgencyShell } from "../../components/app-shell";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { FormDialog } from "../../components/ui/form-dialog";
import { PageHeader } from "../../components/ui/page-header";
import { request } from "../../lib/request";
import type { ClientRecord, ProjectRecord } from "../../lib/types";
import { useWorkspace } from "../../lib/workspace";

type Scope = "active" | "all";

export function ClientsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const search = useSearch({ strict: false }) as { new?: string };
  const workspace = useWorkspace();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("active");
  const [creating, setCreating] = useState(search.new === "1");
  const [archiving, setArchiving] = useState<ClientRecord | null>(null);

  const clients = useQuery({
    queryKey: ["clients"],
    queryFn: () => request<ClientRecord[]>("/api/clients"),
  });
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => request<ProjectRecord[]>("/api/projects"),
  });

  const createClient = useMutation({
    mutationFn: (values: Record<string, string>) =>
      request<ClientRecord>("/api/clients", { method: "POST", body: JSON.stringify(values) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      closeDialog();
    },
  });

  const archiveClient = useMutation({
    mutationFn: (id: string) => request(`/api/clients/${id}/archive`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      setArchiving(null);
    },
  });

  function closeDialog() {
    createClient.reset();
    setCreating(false);
    if (search.new) navigate({ to: "/agency/clients", search: {} });
  }

  /** Archiving is reversible only by an admin, so it asks first unless the
   * workspace has explicitly turned the confirmation off in settings. */
  function startArchive(client: ClientRecord) {
    if (workspace.data?.agency?.preferences.confirmBeforeArchiving === false) {
      archiveClient.mutate(client.id);
      return;
    }
    archiveClient.reset();
    setArchiving(client);
  }

  const projectCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const project of projects.data ?? [])
      map.set(project.clientId, (map.get(project.clientId) ?? 0) + 1);
    return map;
  }, [projects.data]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (clients.data ?? [])
      .filter((client) => (scope === "active" ? client.status === "ACTIVE" : true))
      .filter((client) =>
        needle
          ? `${client.name} ${client.companyName ?? ""} ${client.email ?? ""}`
              .toLowerCase()
              .includes(needle)
          : true,
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [clients.data, query, scope]);

  const archivedCount = (clients.data ?? []).filter((client) => client.status !== "ACTIVE").length;
  const activeProjects = (projects.data ?? []).filter(
    (project) => !["COMPLETED", "ARCHIVED"].includes(project.status),
  ).length;

  return (
    <AgencyShell>
      <PageHeader
        eyebrow="Who you work for"
        title="Clients"
        purpose="One row per company you work for. Projects, deliverables and the client portal all hang off a client, so this is where work starts."
        help={
          <>
            <p>
              A client is a company, not a person. People from that company are invited separately
              from the team screen and only ever see their own company's work.
            </p>
            <p>
              Archiving a client hides it and its projects from these lists. Nothing is deleted and
              an admin can bring it back.
            </p>
          </>
        }
        primary={
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} /> Add a client
          </Button>
        }
      />

      <div className="list-toolbar">
        <label>
          <Search size={15} />
          <input
            placeholder="Search by name, company or email"
            aria-label="Search clients"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {/* Was a single button reading "Active only" / "Every status", where the
            label was ambiguous between the current state and what a click does. */}
        <SegmentedControl<Scope>
          label="Show"
          value={scope}
          onChange={setScope}
          options={[
            { value: "active", label: "Active", hint: "Clients you are currently working with" },
            {
              value: "all",
              label: `All${archivedCount ? ` (${archivedCount} archived)` : ""}`,
              hint: "Includes archived and inactive clients",
            },
          ]}
        />
      </div>

      {clients.isPending ? (
        <section className="panel">
          <Skeleton lines={5} label="Loading clients" />
        </section>
      ) : clients.isError ? (
        <Callout tone="danger" title="Clients did not load">
          {(clients.error as Error).message}
          <div className="rx-callout__action">
            <Button variant="secondary" onClick={() => clients.refetch()}>
              Try loading clients again
            </Button>
          </div>
        </Callout>
      ) : !rows.length ? (
        <EmptyState
          icon={<Building2 size={22} />}
          title={
            query
              ? "No clients match that search"
              : scope === "active" && archivedCount
                ? "No active clients"
                : "No clients yet"
          }
          body={
            query
              ? `Nothing matches "${query.trim()}". Search covers the client name, the company name and the email address.`
              : scope === "active" && archivedCount
                ? `Every client here is archived. Switch to "All" to see the ${archivedCount} archived one${archivedCount === 1 ? "" : "s"}.`
                : "A client is a company you work for. Add one, then create a project for it and add the deliverables that get reviewed."
          }
          action={
            query ? (
              <Button variant="secondary" onClick={() => setQuery("")}>
                Clear the search
              </Button>
            ) : scope === "active" && archivedCount ? (
              <Button variant="secondary" onClick={() => setScope("all")}>
                Show archived clients
              </Button>
            ) : (
              <Button onClick={() => setCreating(true)}>
                <Plus size={16} /> Add your first client
              </Button>
            )
          }
        />
      ) : (
        <section className="panel">
          <table className="data-table clients-table">
            <thead>
              <tr className="data-table__head">
                <th scope="col">Client</th>
                <th scope="col">Company</th>
                <th scope="col">Projects</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((client) => (
                <tr className="data-table__row" key={client.id}>
                  <th scope="row">
                    <span className="client-logo">{client.name.slice(0, 2).toUpperCase()}</span>
                    {client.name}
                  </th>
                  <td>{client.companyName ?? "—"}</td>
                  <td className="rx-mono">{projectCount.get(client.id) ?? 0}</td>
                  <td>
                    <StatusChip status={client.status} />
                  </td>
                  <td className="clients-table__actions">
                    <button
                      type="button"
                      onClick={() =>
                        navigate({ to: "/agency/projects", search: { client: client.id } })
                      }
                    >
                      See projects
                    </button>
                    {client.status === "ACTIVE" ? (
                      <button
                        type="button"
                        aria-label={`Archive ${client.name}`}
                        disabled={archiveClient.isPending}
                        onClick={() => startArchive(client)}
                      >
                        <Archive size={14} /> Archive
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {archiveClient.isError && !archiving ? (
        <Callout tone="danger" title="That client was not archived">
          {(archiveClient.error as Error).message} Nothing changed.
        </Callout>
      ) : null}

      {rows.length ? (
        <div className="list-footnote">
          <Building2 size={15} /> Showing {rows.length} of {clients.data?.length ?? 0} client
          {(clients.data?.length ?? 0) === 1 ? "" : "s"} · {activeProjects} project
          {activeProjects === 1 ? "" : "s"} running across them
        </div>
      ) : null}

      {creating ? (
        <FormDialog
          title="Add a client"
          description="A client is a company you work for. Its projects, its portal and everything shared with it hang off this record."
          submitLabel="Add client"
          pendingLabel="Adding client…"
          pending={createClient.isPending}
          error={createClient.error ? (createClient.error as Error).message : null}
          footnote="Adding a client does not email anyone. You invite people from that company separately, once there is something for them to look at."
          fields={[
            {
              name: "name",
              label: "Client name",
              required: true,
              placeholder: "Imperial Living",
              hint: "What your team calls them. Shown in every list and on every deliverable.",
            },
            {
              name: "companyName",
              label: "Registered company name",
              placeholder: "Imperial Living Pvt Ltd",
              hint: "The legal name, if it differs from what you call them day to day.",
            },
            {
              name: "email",
              label: "Main contact email",
              type: "email",
              placeholder: "hello@imperialliving.com",
              hint: "Where approval requests go if you do not name a specific reviewer.",
            },
            { name: "phone", label: "Phone", type: "tel", placeholder: "+91 98765 43210" },
            {
              name: "website",
              label: "Website",
              type: "url",
              placeholder: "https://imperialliving.com",
            },
            {
              name: "portalSlug",
              label: "Portal address",
              placeholder: "imperial-living",
              hint: "The end of the link this client uses to reach their portal. Lowercase letters, numbers and hyphens.",
              help: (
                <p>
                  Each client gets a portal showing only their own work. This is the part of the
                  address that identifies them, so it has to be unique across your workspace.
                </p>
              ),
              validate: (value) =>
                !value.trim() || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.trim())
                  ? null
                  : "Use lowercase letters, numbers and single hyphens — for example, imperial-living.",
            },
            {
              name: "notes",
              label: "Notes for your team",
              type: "textarea",
              hint: "Only your team sees this. The client never does.",
            },
          ]}
          onSubmit={(values) => createClient.mutate(values)}
          onClose={closeDialog}
        />
      ) : null}

      {archiving ? (
        <ConfirmDialog
          title="Archive this client?"
          body={
            <>
              <strong>{archiving.name}</strong> will be hidden from your client list, and so will
              its {projectCount.get(archiving.id) ?? 0} project
              {(projectCount.get(archiving.id) ?? 0) === 1 ? "" : "s"}.
            </>
          }
          consequence="Nothing is deleted. Files, comments and approvals stay exactly as they are, and an owner or admin can bring the client back. People from this company lose access to their portal until it is restored."
          confirmLabel={`Archive ${archiving.name}`}
          pendingLabel="Archiving…"
          pending={archiveClient.isPending}
          error={archiveClient.error ? (archiveClient.error as Error).message : null}
          onConfirm={() => archiveClient.mutate(archiving.id)}
          onClose={() => setArchiving(null)}
        />
      ) : null}
    </AgencyShell>
  );
}
