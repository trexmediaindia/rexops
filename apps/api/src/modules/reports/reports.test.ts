import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { adReports, db, deliverables, projectMembers, projects } from "@rexops/db";
import { eq, inArray } from "drizzle-orm";
import { apiRequest, ensureTestFixtures, principals, responseJson } from "../../test/helpers";

const createdProjectIds: string[] = [];
const createdDeliverableIds: string[] = [];

async function newProject(service: string) {
  const response = await apiRequest("/api/projects", {
    principal: principals.owner,
    method: "POST",
    body: { clientId: "client_imperial", name: `Test ${service} ${Date.now()}`, service },
  });
  expect(response.status).toBe(200);
  const project = await responseJson(response);
  createdProjectIds.push(String(project.id));
  return project;
}

let adsProject: Record<string, unknown>;

beforeAll(async () => {
  await ensureTestFixtures();
  adsProject = await newProject("ADS");
});

afterAll(async () => {
  if (createdDeliverableIds.length) {
    await db.delete(deliverables).where(inArray(deliverables.id, createdDeliverableIds));
  }
  if (createdProjectIds.length) {
    await db.delete(adReports).where(inArray(adReports.projectId, createdProjectIds));
    await db.delete(projectMembers).where(inArray(projectMembers.projectId, createdProjectIds));
    await db.delete(projects).where(inArray(projects.id, createdProjectIds));
  }
});

describe("services", () => {
  test("a project keeps the service it was created with, through edits", async () => {
    expect(adsProject.service).toBe("ADS");
    const edited = await apiRequest(`/api/projects/${adsProject.id}`, {
      principal: principals.owner,
      method: "PATCH",
      body: { name: "Renamed ads retainer" },
    });
    expect(edited.status).toBe(200);
    const body = await responseJson(edited);
    expect(body.service).toBe("ADS");
    expect(body.priority).toBe("MEDIUM");
  });
});

describe("ad reports", () => {
  const month = { periodStart: "2026-09-01", periodEnd: "2026-09-30" };

  test("the agency adds a report and the client can read it", async () => {
    const created = await apiRequest(`/api/projects/${adsProject.id}/reports`, {
      principal: principals.owner,
      method: "POST",
      body: { ...month, platform: "META", spend: "25000.50", clicks: 1200, leads: 48 },
    });
    expect(created.status).toBe(200);
    const report = await responseJson(created);
    expect(report.spend).toBe(25000.5);
    expect(report.currency).toBe("INR");

    const asClient = await apiRequest(`/api/projects/${adsProject.id}/reports`, {
      principal: principals.clientOwner,
    });
    expect(asClient.status).toBe(200);
    const rows = (await asClient.json()) as Array<{ id: string; leads: number }>;
    expect(rows.find((row) => row.id === report.id)?.leads).toBe(48);
  });

  test("clients can't add reports, and other agencies can't see them", async () => {
    const asClient = await apiRequest(`/api/projects/${adsProject.id}/reports`, {
      principal: principals.clientOwner,
      method: "POST",
      body: month,
    });
    expect(asClient.status).toBe(403);
    const outsider = await apiRequest(`/api/projects/${adsProject.id}/reports`, {
      principal: principals.outsider,
    });
    expect(outsider.status).toBe(404);
  });

  test("reports only belong on ads projects, and the dates must make sense", async () => {
    const creatives = await newProject("CREATIVES");
    const wrongService = await apiRequest(`/api/projects/${creatives.id}/reports`, {
      principal: principals.owner,
      method: "POST",
      body: month,
    });
    expect(wrongService.status).toBe(403);
    const backwards = await apiRequest(`/api/projects/${adsProject.id}/reports`, {
      principal: principals.owner,
      method: "POST",
      body: { periodStart: "2026-09-30", periodEnd: "2026-09-01" },
    });
    expect(backwards.status).toBe(422);
  });

  test("requires authentication and can be deleted by the agency", async () => {
    expect((await apiRequest(`/api/projects/${adsProject.id}/reports`)).status).toBe(401);
    const created = await responseJson(
      await apiRequest(`/api/projects/${adsProject.id}/reports`, {
        principal: principals.owner,
        method: "POST",
        body: { ...month, platform: "GOOGLE" },
      }),
    );
    const removed = await apiRequest(`/api/reports/${created.id}`, {
      principal: principals.owner,
      method: "DELETE",
    });
    expect(removed.status).toBe(200);
    const rows = (await (
      await apiRequest(`/api/projects/${adsProject.id}/reports`, { principal: principals.owner })
    ).json()) as Array<{ id: string }>;
    expect(rows.some((row) => row.id === created.id)).toBe(false);
  });
});

describe("posting tracker", () => {
  test("approved posts can be marked as posted, with a link, and undone", async () => {
    const social = await newProject("SOCIAL_MEDIA");
    const created = await apiRequest("/api/deliverables", {
      principal: principals.owner,
      method: "POST",
      body: {
        projectId: social.id,
        title: "Diwali carousel",
        contentType: "STATIC",
        priority: "HIGH",
        publishAt: "2026-11-01T10:30:00.000Z",
        platforms: ["Instagram", "Facebook"],
        caption: "Lights, colour, family.",
      },
    });
    expect(created.status).toBe(200);
    const post = await responseJson(created);
    createdDeliverableIds.push(String(post.id));
    expect(post.platforms).toEqual(["Instagram", "Facebook"]);

    const early = await apiRequest(`/api/deliverables/${post.id}/published`, {
      principal: principals.owner,
      method: "POST",
      body: {},
    });
    expect(early.status).toBe(403);

    // Editing one field must not reset the others.
    const renamed = await responseJson(
      await apiRequest(`/api/deliverables/${post.id}`, {
        principal: principals.owner,
        method: "PATCH",
        body: { title: "Diwali carousel v2" },
      }),
    );
    expect(renamed.priority).toBe("HIGH");
    expect(renamed.contentType).toBe("STATIC");

    await db
      .update(deliverables)
      .set({ status: "APPROVED" })
      .where(eq(deliverables.id, String(post.id)));
    const posted = await responseJson(
      await apiRequest(`/api/deliverables/${post.id}/published`, {
        principal: principals.owner,
        method: "POST",
        body: { publishUrl: "https://instagram.com/p/abc123" },
      }),
    );
    expect(posted.status).toBe("DELIVERED");
    expect(posted.publishUrl).toBe("https://instagram.com/p/abc123");
    expect(posted.publishedAt).toBeTruthy();

    const asClient = await apiRequest(`/api/deliverables/${post.id}/published`, {
      principal: principals.clientOwner,
      method: "DELETE",
    });
    expect(asClient.status).toBe(403);
    const undone = await responseJson(
      await apiRequest(`/api/deliverables/${post.id}/published`, {
        principal: principals.owner,
        method: "DELETE",
      }),
    );
    expect(undone.status).toBe("APPROVED");
    expect(undone.publishedAt).toBeNull();
  });
});
