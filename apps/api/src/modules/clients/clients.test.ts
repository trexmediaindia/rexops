import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { clients, db } from "@rexops/db";
import { eq } from "drizzle-orm";
import { apiRequest, ensureTestFixtures, principals, responseJson } from "../../test/helpers";

const createdIds: string[] = [];

beforeAll(ensureTestFixtures);

afterEach(async () => {
  for (const id of createdIds.splice(0)) {
    await db.delete(clients).where(eq(clients.id, id));
  }
});

describe("clients routes", () => {
  test("creates and reads a tenant-scoped client", async () => {
    const response = await apiRequest("/api/clients", {
      principal: principals.owner,
      method: "POST",
      body: {
        name: "Test Client",
        companyName: "Test Company",
        email: "client@example.com",
      },
    });
    expect(response.status).toBe(200);
    const created = await responseJson(response);
    createdIds.push(String(created.id));
    expect(created.agencyId).toBe("agency_trex");

    const read = await apiRequest(`/api/clients/${created.id}`, {
      principal: principals.owner,
    });
    expect(read.status).toBe(200);
  });

  test("rejects malformed input", async () => {
    const response = await apiRequest("/api/clients", {
      principal: principals.owner,
      method: "POST",
      body: { name: "", email: "not-an-email" },
    });
    expect(response.status).toBe(422);
  });

  test("requires authentication", async () => {
    expect((await apiRequest("/api/clients")).status).toBe(401);
  });

  test("cross-tenant id guess returns 404", async () => {
    const response = await apiRequest("/api/clients/client_imperial", {
      principal: principals.outsider,
    });
    expect(response.status).toBe(404);
  });

  test("client can only list its own client organization", async () => {
    const response = await apiRequest("/api/clients", {
      principal: principals.clientOwner,
    });
    expect(response.status).toBe(200);
    const rows = (await response.json()) as Array<{ id: string }>;
    expect(rows.map((row) => row.id)).toEqual(["client_imperial"]);
  });
});
