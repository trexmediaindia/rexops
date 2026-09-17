import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { request } from "./request";
import type { DeliverableRecord, ProjectRecord } from "./types";

/** Deliverables the client is being asked to look at right now. */
export const AWAITING_CLIENT = new Set(["UNDER_CLIENT_REVIEW"]);

/** Deliverables the client has signed off. */
export const SETTLED = new Set(["APPROVED", "DELIVERED"]);

/** Deliverables back with the agency after the client asked for changes. */
export const WITH_AGENCY = new Set([
  "PENDING",
  "IN_PROGRESS",
  "READY_FOR_INTERNAL_REVIEW",
  "UNDER_INTERNAL_REVIEW",
  "INTERNAL_APPROVED",
  "REVISION_REQUESTED",
]);

/**
 * The client portal's whole dataset: the two tenant-scoped list endpoints, which
 * the API already narrows by both `agencyId` and `clientId`. Every client screen
 * reads this rather than issuing its own pair of requests, so the three tabs
 * share one React Query cache entry each.
 */
export function useClientWorkspace() {
  const projects = useQuery({
    queryKey: ["client-projects"],
    queryFn: () => request<ProjectRecord[]>("/api/projects"),
  });
  const deliverables = useQuery({
    queryKey: ["client-deliverables"],
    queryFn: () => request<DeliverableRecord[]>("/api/deliverables"),
  });

  const byProject = useMemo(() => {
    const map = new Map<string, DeliverableRecord[]>();
    for (const deliverable of deliverables.data ?? []) {
      const bucket = map.get(deliverable.projectId);
      if (bucket) bucket.push(deliverable);
      else map.set(deliverable.projectId, [deliverable]);
    }
    return map;
  }, [deliverables.data]);

  return {
    projects: projects.data ?? [],
    deliverables: deliverables.data ?? [],
    byProject,
    isLoading: projects.isLoading || deliverables.isLoading,
    error: (projects.error ?? deliverables.error) as Error | null,
    refetch: () => {
      projects.refetch();
      deliverables.refetch();
    },
  };
}

/** Progress a client can actually verify: how much of a project they've approved. */
export function approvalProgress(items: DeliverableRecord[]) {
  if (!items.length) return { approved: 0, total: 0, percent: 0 };
  const approved = items.filter((item) => SETTLED.has(item.status)).length;
  return { approved, total: items.length, percent: Math.round((approved / items.length) * 100) };
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Days until a due date. Negative means it has slipped. */
export function daysUntil(value: string | null | undefined) {
  if (!value) return null;
  const diff = new Date(value).getTime() - Date.now();
  return Math.ceil(diff / 86_400_000);
}
