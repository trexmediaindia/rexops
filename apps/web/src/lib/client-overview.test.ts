import { describe, expect, test } from "bun:test";
import { clientOverview, latestAdMonth } from "./client-overview";
import type { DeliverableRecord, ProjectRecord } from "./types";

const now = new Date("2026-10-29T10:00:00");

function project(id: string, service: string): ProjectRecord {
  return { id, name: id, clientId: "c", service } as unknown as ProjectRecord;
}

function item(fields: Partial<DeliverableRecord>): DeliverableRecord {
  return {
    id: Math.random().toString(36).slice(2),
    projectId: "social",
    status: "IN_PROGRESS",
    publishAt: null,
    publishedAt: null,
    approvedAt: null,
    submittedAt: null,
    updatedAt: "2026-10-20T10:00:00",
    platforms: [],
    ...fields,
  } as DeliverableRecord;
}

describe("client overview", () => {
  const projects = [project("social", "SOCIAL_MEDIA"), project("films", "CREATIVES")];
  const rows = [
    item({ status: "UNDER_CLIENT_REVIEW", submittedAt: "2026-10-27T09:00:00" }),
    item({ status: "UNDER_CLIENT_REVIEW", submittedAt: "2026-10-25T09:00:00" }),
    item({
      status: "APPROVED",
      approvedAt: "2026-10-02T09:00:00",
      publishAt: "2026-10-30T18:00:00",
    }),
    item({
      status: "DELIVERED",
      approvedAt: "2026-09-28T09:00:00",
      publishedAt: "2026-09-30T09:00:00",
    }),
    item({ status: "IN_PROGRESS", publishAt: "2026-11-04T12:00:00" }),
    item({ status: "APPROVED", projectId: "films", approvedAt: "2026-10-12T09:00:00" }),
    item({ status: "ARCHIVED", publishAt: "2026-10-30T09:00:00" }),
  ];
  const overview = clientOverview(projects, rows, now);

  test("oldest waiting item comes first", () => {
    expect(overview.waiting.map((row) => row.submittedAt)).toEqual([
      "2026-10-25T09:00:00",
      "2026-10-27T09:00:00",
    ]);
  });

  test("the week holds seven days, today first, and the strip count matches the days", () => {
    expect(overview.days).toHaveLength(7);
    expect(overview.days[0]?.isToday).toBe(true);
    const fromDays = overview.days.reduce((sum, day) => sum + day.items.length, 0);
    expect(overview.thisWeek).toHaveLength(fromDays);
    // 30 Oct and 4 Nov are inside the window; the archived post is left out.
    expect(fromDays).toBe(2);
  });

  test("approved this month counts only this month's sign-offs", () => {
    expect(overview.approvedThisMonth).toHaveLength(2);
  });

  test("service progress counts posted social work and approved creatives", () => {
    const social = overview.services.find((row) => row.service === "SOCIAL_MEDIA");
    const films = overview.services.find((row) => row.service === "CREATIVES");
    expect(social).toMatchObject({ total: 5, done: 1, waiting: 2 });
    expect(films).toMatchObject({ total: 1, done: 1, waiting: 0 });
  });
});

describe("latest ad month", () => {
  test("sums every platform in the latest month and works out cost per lead", () => {
    const month = latestAdMonth([
      {
        platform: "META",
        periodStart: "2026-09-01T12:00:00Z",
        periodEnd: "2026-09-30T12:00:00Z",
        currency: "INR",
        spend: 85000,
        leads: 212,
        clicks: 6900,
      },
      {
        platform: "GOOGLE",
        periodStart: "2026-09-01T12:00:00Z",
        periodEnd: "2026-09-30T12:00:00Z",
        currency: "INR",
        spend: 42000,
        leads: 74,
        clicks: 3100,
      },
      {
        platform: "META",
        periodStart: "2026-08-01T12:00:00Z",
        periodEnd: "2026-08-31T12:00:00Z",
        currency: "INR",
        spend: 50000,
        leads: 100,
        clicks: 2000,
      },
    ]);
    expect(month).toMatchObject({ label: "September", spend: 127000, leads: 286 });
    expect(month?.costPerLead).toBeCloseTo(127000 / 286);
  });

  test("no reports, no month", () => {
    expect(latestAdMonth([])).toBeNull();
  });
});
