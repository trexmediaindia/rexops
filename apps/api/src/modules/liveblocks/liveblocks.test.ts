import { describe, expect, test } from "bun:test";
import { apiRequest, principals, responseJson } from "../../test/helpers";

describe("liveblocks auth seam", () => {
  test("requires authentication", async () => {
    const response = await apiRequest("/api/liveblocks-auth", {
      method: "POST",
      body: { room: "review:deliverable_beach_vibe" },
    });
    expect(response.status).toBe(401);
  });

  test("returns a room-scoped development token", async () => {
    const response = await apiRequest("/api/liveblocks-auth", {
      principal: principals.owner,
      method: "POST",
      body: { room: "review:deliverable_beach_vibe" },
    });
    expect(response.status).toBe(200);
    const body = (await responseJson(response)) as {
      room: string;
      token: string;
      userInfo: { name: string; audience: string; agencyId: string; color: string };
    };
    expect(body.room).toBe("review:deliverable_beach_vibe");
    expect(String(body.token)).toContain("user_manas");
    expect(body.userInfo).toMatchObject({
      name: "Manas",
      audience: "AGENCY",
      agencyId: "agency_trex",
    });
    expect(body.userInfo.color).toMatch(/^#/);
  });

  test("unknown room kinds are hidden as 404", async () => {
    const response = await apiRequest("/api/liveblocks-auth", {
      principal: principals.owner,
      method: "POST",
      body: { room: "global:anything" },
    });
    expect(response.status).toBe(404);
  });

  test("cross-tenant room ids are hidden as 404", async () => {
    const response = await apiRequest("/api/liveblocks-auth", {
      method: "POST",
      principal: principals.outsider,
      body: { room: "review:deliverable_beach_vibe" },
    });
    expect(response.status).toBe(404);
  });

  test("isolates client review presence and user notification rooms", async () => {
    const agencyRoom = await apiRequest("/api/liveblocks-auth", {
      method: "POST",
      principal: principals.clientOwner,
      body: { room: "review:deliverable_beach_vibe" },
    });
    expect(agencyRoom.status).toBe(404);
    const clientRoom = await apiRequest("/api/liveblocks-auth", {
      method: "POST",
      principal: principals.clientOwner,
      body: { room: "review:deliverable_beach_vibe:client" },
    });
    expect(clientRoom.status).toBe(200);
    expect(
      (
        (await responseJson(clientRoom)) as {
          userInfo: { audience: string };
        }
      ).userInfo.audience,
    ).toBe("CLIENT");

    const ownRoom = await apiRequest("/api/liveblocks-auth", {
      method: "POST",
      principal: principals.owner,
      body: { room: "user:user_manas" },
    });
    expect(ownRoom.status).toBe(200);
    const foreignRoom = await apiRequest("/api/liveblocks-auth", {
      method: "POST",
      principal: principals.owner,
      body: { room: "user:user_riya" },
    });
    expect(foreignRoom.status).toBe(404);
  });
});
