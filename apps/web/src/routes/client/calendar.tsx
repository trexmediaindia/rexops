import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { AdReports } from "../../components/ad-reports";
import { ClientShell } from "../../components/app-shell";
import { CalendarMonth, calendarEntries } from "../../components/calendar-month";
import { request } from "../../lib/request";
import type { DeliverableRecord, ProjectRecord } from "../../lib/types";

export function useClientProjects() {
  return useQuery({
    queryKey: ["client-projects"],
    queryFn: () => request<ProjectRecord[]>("/api/projects"),
  });
}

export function ClientCalendarPage() {
  const deliverables = useQuery({
    queryKey: ["client-deliverables"],
    queryFn: () => request<DeliverableRecord[]>("/api/deliverables"),
  });
  const projects = useClientProjects();
  const entries = useMemo(
    // Clients see the posting plan: posts and ads on their dates, not internal due dates.
    () =>
      calendarEntries(deliverables.data ?? [], projects.data ?? []).filter(
        (entry) => entry.kind === "post",
      ),
    [deliverables.data, projects.data],
  );
  return (
    <ClientShell>
      <section className="client-heading">
        <h1>Calendar</h1>
        <p>When each post or ad is planned to go out. Tap one to see it.</p>
      </section>
      <CalendarMonth entries={entries} linkFor="client" />
    </ClientShell>
  );
}

export function ClientReportsPage() {
  const projects = useClientProjects();
  const ads = (projects.data ?? []).filter((project) => project.service === "ADS");
  return (
    <ClientShell>
      <section className="client-heading">
        <h1>Ad results</h1>
        <p>How your ads are doing, month by month.</p>
      </section>
      {projects.isLoading ? null : ads.length ? (
        ads.map((project) => (
          <div key={project.id} className="client-reports__project">
            {ads.length > 1 ? <h2>{project.name}</h2> : null}
            <AdReports projectId={project.id} canEdit={false} />
          </div>
        ))
      ) : (
        <p className="client-heading">No ads projects yet.</p>
      )}
    </ClientShell>
  );
}
