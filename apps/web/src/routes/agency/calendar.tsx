import { Select } from "@rexops/ui";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AgencyShell } from "../../components/app-shell";
import { CalendarMonth, calendarEntries } from "../../components/calendar-month";
import { PageHeader } from "../../components/ui/page-header";
import { request } from "../../lib/request";
import { SERVICE_OPTIONS } from "../../lib/services";
import type { ClientRecord, DeliverableRecord, ProjectRecord } from "../../lib/types";

export function CalendarPage() {
  const [clientId, setClientId] = useState("");
  const [service, setService] = useState("");
  const deliverables = useQuery({
    queryKey: ["deliverables"],
    queryFn: () => request<DeliverableRecord[]>("/api/deliverables"),
  });
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => request<ProjectRecord[]>("/api/projects"),
  });
  const clients = useQuery({
    queryKey: ["clients"],
    queryFn: () => request<ClientRecord[]>("/api/clients"),
  });

  const clientNames = useMemo(
    () => new Map((clients.data ?? []).map((client) => [client.id, client.name])),
    [clients.data],
  );
  const entries = useMemo(
    () =>
      calendarEntries(deliverables.data ?? [], projects.data ?? []).filter(
        (entry) =>
          (!clientId || entry.project?.clientId === clientId) &&
          (!service || entry.service === service),
      ),
    [deliverables.data, projects.data, clientId, service],
  );

  return (
    <AgencyShell>
      <PageHeader
        eyebrow="Calendar"
        title="Content calendar"
        purpose="Every post and ad on the day it goes out, and every creative on the day it's due."
        help={
          <p>
            Give a post or ad a date on its page and it appears here. Once it's live, mark it as
            posted so the client sees it too.
          </p>
        }
      />
      <div className="list-toolbar calendar-filters">
        <Select
          aria-label="Client"
          size="sm"
          value={clientId}
          placeholder="All clients"
          options={[
            { value: "", label: "All clients" },
            ...(clients.data ?? []).map((client) => ({ value: client.id, label: client.name })),
          ]}
          onChange={setClientId}
        />
        <Select
          aria-label="Service"
          size="sm"
          value={service}
          placeholder="All services"
          options={[{ value: "", label: "All services" }, ...SERVICE_OPTIONS]}
          onChange={setService}
        />
      </div>
      <CalendarMonth entries={entries} linkFor="agency" clientNames={clientNames} />
    </AgencyShell>
  );
}
