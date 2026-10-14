import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { accounts, clients, db, sessions, users } from "@rexops/db";
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

describe("client people", () => {
  const createdUserIds: string[] = [];
  const stamp = Date.now();

  afterEach(async () => {
    for (const userId of createdUserIds.splice(0)) {
      await db.delete(sessions).where(eq(sessions.userId, userId));
      await db.delete(accounts).where(eq(accounts.userId, userId));
      await db.delete(users).where(eq(users.id, userId));
    }
  });

  test("adds a client login whose temporary password signs in to the client portal", async () => {
    const email = `approver-${stamp}@imperial.test`;
    const response = await apiRequest("/api/clients/client_imperial/people", {
      principal: principals.owner,
      method: "POST",
      body: { name: "Approver Person", email: email.toUpperCase(), role: "CLIENT_OWNER" },
    });
    expect(response.status).toBe(200);
    const person = await responseJson(response);
    createdUserIds.push(String(person.id));
    expect(person.email).toBe(email);
    expect(person.role).toBe("CLIENT_OWNER");
    expect(String(person.temporaryPassword)).toHaveLength(16);

    const [stored] = await db
      .select()
      .from(users)
      .where(eq(users.id, String(person.id)));
    expect(stored?.clientId).toBe("client_imperial");
    expect(stored?.agencyId).toBe("agency_trex");
    expect(stored?.permissions.canApprove).toBe(true);

    const signIn = await apiRequest("/api/auth/sign-in/email", {
      method: "POST",
      headers: { origin: process.env.WEB_URL ?? "http://localhost:8080" },
      body: { email, password: person.temporaryPassword },
    });
    expect(signIn.status).toBe(200);

    const listed = await apiRequest("/api/clients/client_imperial/people", {
      principal: principals.owner,
    });
    const rows = (await listed.json()) as Array<{ email: string; temporaryPassword?: string }>;
    const row = rows.find((entry) => entry.email === email);
    expect(row).toBeDefined();
    expect(row?.temporaryPassword).toBeUndefined();
  });

  test("a client member can view and comment but not approve", async () => {
    const response = await apiRequest("/api/clients/client_imperial/people", {
      principal: principals.owner,
      method: "POST",
      body: {
        name: "Viewer Person",
        email: `viewer-${stamp}@imperial.test`,
        role: "CLIENT_MEMBER",
      },
    });
    expect(response.status).toBe(200);
    const person = await responseJson(response);
    createdUserIds.push(String(person.id));
    const [stored] = await db
      .select()
      .from(users)
      .where(eq(users.id, String(person.id)));
    expect(stored?.permissions.canApprove).toBe(false);
  });

  test("rejects malformed input and duplicate emails", async () => {
    const malformed = await apiRequest("/api/clients/client_imperial/people", {
      principal: principals.owner,
      method: "POST",
      body: { name: "", email: "nope" },
    });
    expect(malformed.status).toBe(422);

    const duplicate = await apiRequest("/api/clients/client_imperial/people", {
      principal: principals.owner,
      method: "POST",
      body: { name: "Copy of Sara", email: "sara@imperial.test" },
    });
    expect(duplicate.status).toBe(409);
  });

  test("requires authentication", async () => {
    expect((await apiRequest("/api/clients/client_imperial/people")).status).toBe(401);
  });

  test("cross-tenant id guess returns 404", async () => {
    const response = await apiRequest("/api/clients/client_imperial/people", {
      principal: principals.outsider,
      method: "POST",
      body: { name: "Intruder", email: `intruder-${stamp}@outside.test` },
    });
    expect(response.status).toBe(404);
  });

  test("client users and members without the permission cannot add people", async () => {
    for (const principal of [principals.clientOwner, principals.editor]) {
      const response = await apiRequest("/api/clients/client_imperial/people", {
        principal,
        method: "POST",
        body: { name: "Someone", email: `blocked-${stamp}-${principal.userId}@imperial.test` },
      });
      expect(response.status).toBe(403);
    }
    const list = await apiRequest("/api/clients/client_imperial/people", {
      principal: principals.clientOwner,
    });
    expect(list.status).toBe(403);
  });
});
