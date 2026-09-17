import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { db, projectMembers, projects } from "@rexops/db";
import { eq } from "drizzle-orm";
import { apiRequest, ensureTestFixtures, principals, responseJson } from "../../test/helpers";

const createdIds: string[] = [];

beforeAll(ensureTestFixtures);

afterEach(async () => {
  for (const id of createdIds.splice(0)) {
    await db.delete(projectMembers).where(eq(projectMembers.projectId, id));
    await db.delete(projects).where(eq(projects.id, id));
  }
});

describe("projects routes", () => {
  test("creates a project for a client in the same agency", async () => {
    const response = await apiRequest("/api/projects", {
      principal: principals.owner,
      method: "POST",
      body: {
        clientId: "client_imperial",
        name: "Test Project",
        priority: "HIGH",
        memberIds: ["user_riya"],
      },
    });
    expect(response.status).toBe(200);
    const created = await responseJson(response);
    createdIds.push(String(created.id));
    expect(created.clientId).toBe("client_imperial");
  });

  test("rejects invalid project input", async () => {
    const response = await apiRequest("/api/projects", {
      principal: principals.owner,
      method: "POST",
      body: { clientId: "", name: "" },
    });
    expect(response.status).toBe(422);
  });

  test("requires authentication", async () => {
    expect((await apiRequest("/api/projects")).status).toBe(401);
  });

  test("cross-tenant id guess returns 404", async () => {
    const response = await apiRequest("/api/projects/project_june_retainer", {
      principal: principals.outsider,
    });
    expect(response.status).toBe(404);
  });

  test("client only sees its own projects", async () => {
    const response = await apiRequest("/api/projects", {
      principal: principals.clientOwner,
    });
    expect(response.status).toBe(200);
    const rows = (await response.json()) as Array<{ clientId: string }>;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.clientId === "client_imperial")).toBe(true);
  });
});
