import { beforeAll, describe, expect, test } from "bun:test";
import type { Principal } from "@rexops/core";
import { db, users } from "@rexops/db";
import { sql } from "drizzle-orm";
import { principalFromRequest } from "../../plugins/auth-guard";
import { apiRequest, ensureTestFixtures, principals, responseJson } from "../../test/helpers";

beforeAll(ensureTestFixtures);

const stamp = Date.now().toString(36);

/** Every row anywhere that still carries this agency's id. */
async function rowsLeftFor(agencyId: string) {
  const tables = (await db.execute(sql`
    select table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'agency_id'
  `)) as unknown as Array<{ table_name: string }>;
  let left = 0;
  for (const { table_name } of tables) {
    const [row] = (await db.execute(
      sql`select count(*)::int as n from ${sql.identifier(table_name)} where agency_id = ${agencyId}`,
    )) as unknown as Array<{ n: number }>;
    left += row?.n ?? 0;
  }
  return left;
}

async function person(id: string) {
  const [row] = (await db.execute(
    sql`select banned, ban_reason, deleted_at, email from "user" where id = ${id}`,
  )) as unknown as Array<{
    banned: boolean;
    ban_reason: string | null;
    deleted_at: Date | null;
    email: string;
  }>;
  return row;
}

describe("removing things", () => {
  let agencyId = "";
  let owner: Principal;
  let clientId = "";
  let projectId = "";
  let personId = "";

  test("the platform admin adds an agency whose owner gets a working password", async () => {
    const response = await apiRequest("/api/agencies", {
      principal: principals.superAdmin,
      method: "POST",
      body: {
        name: `Removal Test ${stamp}`,
        slug: `removal-${stamp}`,
        owner: { name: "Test Owner", email: `owner-${stamp}@removal.test` },
      },
    });
    expect(response.status).toBe(200);
    const body = (await responseJson(response)) as {
      id: string;
      owner: { temporaryPassword: string };
    };
    expect(body.owner.temporaryPassword.length).toBeGreaterThanOrEqual(12);
    agencyId = body.id;
    const [row] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`${users.agencyId} = ${agencyId}`);
    owner = {
      ...principals.owner,
      userId: row?.id ?? "",
      agencyId,
    };
  });

  test("a client, a project, a piece of work and a client login", async () => {
    const client = await apiRequest("/api/clients", {
      principal: owner,
      method: "POST",
      body: { name: "Doomed Client" },
    });
    expect(client.status).toBe(200);
    clientId = (await responseJson(client)).id as string;

    const project = await apiRequest("/api/projects", {
      principal: owner,
      method: "POST",
      body: { clientId, name: "Doomed Project" },
    });
    expect(project.status).toBe(200);
    projectId = (await responseJson(project)).id as string;

    for (const title of ["Post one", "Post two"]) {
      const work = await apiRequest("/api/deliverables", {
        principal: owner,
        method: "POST",
        body: { projectId, title },
      });
      expect(work.status).toBe(200);
    }

    const login = await apiRequest(`/api/clients/${clientId}/people`, {
      principal: owner,
      method: "POST",
      body: { name: "Client Person", email: `person-${stamp}@removal.test` },
    });
    expect(login.status).toBe(200);
    personId = (await responseJson(login)).id as string;
  });

  test("archiving a client locks its logins and restoring opens them again", async () => {
    const archived = await apiRequest(`/api/clients/${clientId}/archive`, {
      principal: owner,
      method: "POST",
    });
    expect(archived.status).toBe(200);
    expect(await person(personId)).toMatchObject({ banned: true });

    const restored = await apiRequest(`/api/clients/${clientId}/restore`, {
      principal: owner,
      method: "POST",
    });
    expect(restored.status).toBe(200);
    expect(await person(personId)).toMatchObject({ banned: false });
  });

  test("a client person can be suspended, restored and removed", async () => {
    const path = `/api/clients/${clientId}/people/${personId}`;
    expect(
      (await apiRequest(path, { principal: owner, method: "PATCH", body: { banned: true } }))
        .status,
    ).toBe(200);
    expect(await person(personId)).toMatchObject({ banned: true });
    expect(
      (await apiRequest(path, { principal: owner, method: "PATCH", body: { banned: false } }))
        .status,
    ).toBe(200);
    expect(await person(personId)).toMatchObject({ banned: false });

    expect((await apiRequest(path, { principal: owner, method: "DELETE" })).status).toBe(200);
    const removed = await person(personId);
    expect(removed?.deleted_at).not.toBeNull();
    expect(removed?.email).toEndWith("@removed.invalid");
    const list = (await (
      await apiRequest(`/api/clients/${clientId}/people`, { principal: owner })
    ).json()) as unknown[];
    expect(list).toHaveLength(0);
  });

  test("members cannot delete, and the name must be typed exactly", async () => {
    const asMember = await apiRequest(`/api/projects/${projectId}`, {
      principal: { ...owner, role: "AGENCY_MEMBER" },
      method: "DELETE",
      body: { confirm: "Doomed Project" },
    });
    expect(asMember.status).toBe(403);
    const wrongName = await apiRequest(`/api/projects/${projectId}`, {
      principal: owner,
      method: "DELETE",
      body: { confirm: "doomed" },
    });
    expect(wrongName.status).toBe(409);
  });

  test("deleting a client erases its projects and work", async () => {
    const response = await apiRequest(`/api/clients/${clientId}`, {
      principal: owner,
      method: "DELETE",
      body: { confirm: "Doomed Client" },
    });
    expect(response.status).toBe(200);
    const body = (await responseJson(response)) as { removed: Record<string, number> };
    expect(body.removed).toMatchObject({ client: 1, project: 1, deliverable: 2 });
  });

  test("suspending an agency refuses its sign-ins until restored", async () => {
    const ownerId = owner.userId;
    expect(
      (
        await apiRequest(`/api/agencies/${agencyId}/suspend`, {
          principal: principals.superAdmin,
          method: "POST",
        })
      ).status,
    ).toBe(200);
    expect(await person(ownerId)).toMatchObject({ banned: true });
    expect(
      (
        await apiRequest(`/api/agencies/${agencyId}/restore`, {
          principal: principals.superAdmin,
          method: "POST",
        })
      ).status,
    ).toBe(200);
    expect(await person(ownerId)).toMatchObject({ banned: false });
  });

  test("only the platform admin can suspend an agency", async () => {
    const response = await apiRequest(`/api/agencies/${agencyId}/suspend`, {
      principal: owner,
      method: "POST",
    });
    expect(response.status).toBe(403);
  });

  test("deleting an agency leaves nothing behind", async () => {
    const response = await apiRequest(`/api/agencies/${agencyId}`, {
      principal: principals.superAdmin,
      method: "DELETE",
      body: { confirm: `Removal Test ${stamp}` },
    });
    expect(response.status).toBe(200);
    expect(await rowsLeftFor(agencyId)).toBe(0);
  });

  test("a request without a session is still refused", async () => {
    expect(await principalFromRequest(new Request("http://localhost/api/clients"))).toBeNull();
  });
});
