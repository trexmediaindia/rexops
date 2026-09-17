import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { db, deliverables, reviewStages } from "@rexops/db";
import { eq } from "drizzle-orm";
import { apiRequest, ensureTestFixtures, principals, responseJson } from "../../test/helpers";

const createdIds: string[] = [];

beforeAll(ensureTestFixtures);

afterEach(async () => {
  for (const id of createdIds.splice(0)) {
    await db.delete(reviewStages).where(eq(reviewStages.deliverableId, id));
    await db.delete(deliverables).where(eq(deliverables.id, id));
  }
});

describe("deliverables routes", () => {
  test("creates default review stages and performs T1", async () => {
    const createResponse = await apiRequest("/api/deliverables", {
      principal: principals.owner,
      method: "POST",
      body: {
        projectId: "project_june_retainer",
        title: "Test Reel",
        contentType: "MOTION",
        assignedToUserId: "user_riya",
      },
    });
    expect(createResponse.status).toBe(200);
    const created = await responseJson(createResponse);
    createdIds.push(String(created.id));

    const stages = await db
      .select()
      .from(reviewStages)
      .where(eq(reviewStages.deliverableId, String(created.id)));
    expect(stages).toHaveLength(0);

    const transition = await apiRequest(`/api/deliverables/${created.id}/transition`, {
      principal: principals.owner,
      method: "POST",
      body: { to: "IN_PROGRESS" },
    });
    expect(transition.status).toBe(200);
    expect((await responseJson(transition)).status).toBe("IN_PROGRESS");
  });

  test("rejects malformed input", async () => {
    const response = await apiRequest("/api/deliverables", {
      principal: principals.owner,
      method: "POST",
      body: { projectId: "", title: "" },
    });
    expect(response.status).toBe(422);
  });

  test("requires authentication", async () => {
    expect((await apiRequest("/api/deliverables")).status).toBe(401);
  });

  test("cross-tenant id guess returns 404", async () => {
    const response = await apiRequest("/api/deliverables/deliverable_beach_vibe", {
      principal: principals.outsider,
    });
    expect(response.status).toBe(404);
  });

  test("client response strips the agency note", async () => {
    await db
      .update(deliverables)
      .set({ agencyNote: "Never expose this note." })
      .where(eq(deliverables.id, "deliverable_beach_vibe"));

    const response = await apiRequest("/api/deliverables/deliverable_beach_vibe", {
      principal: principals.clientOwner,
    });
    expect(response.status).toBe(200);
    const body = await responseJson(response);
    expect(body.agencyNote).toBeUndefined();

    await db
      .update(deliverables)
      .set({ agencyNote: null })
      .where(eq(deliverables.id, "deliverable_beach_vibe"));
  });

  test("invalid state skip returns 409", async () => {
    const response = await apiRequest("/api/deliverables/deliverable_beach_vibe/transition", {
      principal: principals.owner,
      method: "POST",
      body: { to: "APPROVED" },
    });
    expect(response.status).toBe(409);
  });
});
