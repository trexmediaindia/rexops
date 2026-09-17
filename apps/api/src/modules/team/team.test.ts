import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { accounts, auditLogs, db, users } from "@rexops/db";
import { eq, or } from "drizzle-orm";
import { apiRequest, ensureTestFixtures, principals, responseJson } from "../../test/helpers";

const createdUserIds: string[] = [];

beforeAll(ensureTestFixtures);

afterEach(async () => {
  for (const id of createdUserIds.splice(0)) {
    await db.delete(auditLogs).where(or(eq(auditLogs.targetId, id), eq(auditLogs.actorUserId, id)));
    await db.delete(accounts).where(eq(accounts.userId, id));
    await db.delete(users).where(eq(users.id, id));
  }
  // Restore the seeded editor exactly, so the suite leaves the dev database the
  // way it found it however the tests are ordered.
  await db
    .update(users)
    .set({
      role: "AGENCY_MEMBER",
      specialty: "MOTION",
      banned: false,
      banReason: null,
      permissions: {
        canApprove: false,
        canInviteClients: false,
        canManageTeam: false,
        canUploadFinal: false,
        canViewAllClients: false,
        canManageAutomations: false,
      },
    })
    .where(eq(users.id, "user_riya"));
});

describe("team routes", () => {
  test("lists agency staff with their workload, never client users", async () => {
    const response = await apiRequest("/api/team", { principal: principals.owner });
    expect(response.status).toBe(200);
    const rows = (await response.json()) as Array<{
      id: string;
      role: string;
      openDeliverables: number;
      projectCount: number;
    }>;
    const ids = rows.map((row) => row.id);
    expect(ids).toContain("user_manas");
    expect(ids).toContain("user_riya");
    expect(ids).not.toContain("user_sara");
    expect(rows[0]?.role).toBe("AGENCY_OWNER");
    for (const row of rows) {
      expect(typeof row.openDeliverables).toBe("number");
      expect(typeof row.projectCount).toBe("number");
    }
  });

  test("a client user cannot read the agency roster", async () => {
    const response = await apiRequest("/api/team", { principal: principals.clientOwner });
    expect(response.status).toBe(403);
  });

  test("requires authentication", async () => {
    expect((await apiRequest("/api/team")).status).toBe(401);
  });

  test("invite creates a sign-in-ready teammate and returns the password once", async () => {
    const response = await apiRequest("/api/team", {
      principal: principals.owner,
      method: "POST",
      body: {
        name: "New Editor",
        email: "New.Editor@trex.test",
        role: "AGENCY_MEMBER",
        specialty: "EDITOR",
        permissions: { canUploadFinal: true },
      },
    });
    expect(response.status).toBe(200);
    const created = await responseJson(response);
    createdUserIds.push(String(created.id));

    expect(created.agencyId).toBe("agency_trex");
    expect(created.email).toBe("new.editor@trex.test");
    expect(String(created.temporaryPassword)).toHaveLength(16);
    expect((created.permissions as Record<string, boolean>).canUploadFinal).toBe(true);
    expect((created.permissions as Record<string, boolean>).canApprove).toBe(false);

    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, String(created.id)));
    expect(account?.providerId).toBe("credential");
    expect(account?.password).toBeTruthy();
    expect(account?.password).not.toBe(created.temporaryPassword);

    const roster = await apiRequest("/api/team", { principal: principals.owner });
    const ids = ((await roster.json()) as Array<{ id: string }>).map((row) => row.id);
    expect(ids).toContain(String(created.id));
  });

  test("invite rejects a duplicate email", async () => {
    const response = await apiRequest("/api/team", {
      principal: principals.owner,
      method: "POST",
      body: { name: "Copy Cat", email: "riya@trex.test" },
    });
    expect(response.status).toBe(409);
  });

  test("a member without canManageTeam cannot invite", async () => {
    const response = await apiRequest("/api/team", {
      principal: principals.editor,
      method: "POST",
      body: { name: "Sneaky", email: "sneaky@trex.test" },
    });
    expect(response.status).toBe(403);
  });

  test("only an owner may grant the owner role", async () => {
    const admin = { ...principals.owner, role: "AGENCY_ADMIN" as const };
    const response = await apiRequest("/api/team", {
      principal: admin,
      method: "POST",
      body: { name: "Would-be Owner", email: "wouldbe@trex.test", role: "AGENCY_OWNER" },
    });
    expect(response.status).toBe(403);
  });

  test("role, specialty, and permissions update together", async () => {
    const response = await apiRequest("/api/team/user_riya", {
      principal: principals.owner,
      method: "PATCH",
      body: {
        role: "AGENCY_ADMIN",
        specialty: "PM",
        permissions: { canApprove: true },
      },
    });
    expect(response.status).toBe(200);
    const updated = await responseJson(response);
    expect(updated.role).toBe("AGENCY_ADMIN");
    expect(updated.specialty).toBe("PM");
    expect((updated.permissions as Record<string, boolean>).canApprove).toBe(true);
  });

  test("suspending a teammate flips banned and is reversible", async () => {
    const suspend = await apiRequest("/api/team/user_riya", {
      principal: principals.owner,
      method: "PATCH",
      body: { banned: true },
    });
    expect(suspend.status).toBe(200);
    expect((await responseJson(suspend)).banned).toBe(true);

    const reinstate = await apiRequest("/api/team/user_riya", {
      principal: principals.owner,
      method: "PATCH",
      body: { banned: false },
    });
    expect((await responseJson(reinstate)).banned).toBe(false);
  });

  test("you cannot change your own access", async () => {
    const response = await apiRequest("/api/team/user_manas", {
      principal: principals.owner,
      method: "PATCH",
      body: { role: "AGENCY_MEMBER" },
    });
    expect(response.status).toBe(403);
  });

  test("the last active owner cannot be demoted", async () => {
    const secondOwner = {
      ...principals.owner,
      userId: "user_second_owner",
    };
    await db
      .insert(users)
      .values({
        id: "user_second_owner",
        name: "Second Owner",
        email: "second.owner@trex.test",
        role: "AGENCY_OWNER",
        agencyId: "agency_trex",
        permissions: { canManageTeam: true },
      })
      .onConflictDoNothing();
    createdUserIds.push("user_second_owner");

    const response = await apiRequest("/api/team/user_manas", {
      principal: secondOwner,
      method: "PATCH",
      body: { role: "AGENCY_MEMBER" },
    });
    expect(response.status).toBe(200);

    const lockout = await apiRequest("/api/team/user_second_owner", {
      principal: principals.owner,
      method: "PATCH",
      body: { role: "AGENCY_MEMBER" },
    });
    expect(lockout.status).toBe(409);

    await db.update(users).set({ role: "AGENCY_OWNER" }).where(eq(users.id, "user_manas"));
  });

  test("a teammate from another tenant reads as 404", async () => {
    const response = await apiRequest("/api/team/user_riya", {
      principal: principals.outsider,
      method: "PATCH",
      body: { specialty: "PM" },
    });
    expect(response.status).toBe(404);
  });

  test("an empty patch body is rejected", async () => {
    const response = await apiRequest("/api/team/user_riya", {
      principal: principals.owner,
      method: "PATCH",
      body: {},
    });
    expect(response.status).toBe(422);
  });
});
