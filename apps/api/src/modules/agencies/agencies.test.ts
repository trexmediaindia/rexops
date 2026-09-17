import { beforeAll, describe, expect, test } from "bun:test";
import { apiRequest, ensureTestFixtures, principals, responseJson } from "../../test/helpers";

beforeAll(ensureTestFixtures);

describe("agencies routes", () => {
  test("owner reads its own agency", async () => {
    const response = await apiRequest("/api/agencies/agency_trex", {
      principal: principals.owner,
    });
    expect(response.status).toBe(200);
    expect((await responseJson(response)).name).toBe("T-Rex Media");
  });

  test("requires authentication", async () => {
    const response = await apiRequest("/api/agencies/agency_trex");
    expect(response.status).toBe(401);
  });

  test("cross-tenant id guess returns 404", async () => {
    const response = await apiRequest("/api/agencies/agency_trex", {
      principal: principals.outsider,
    });
    expect(response.status).toBe(404);
  });

  test("rejects malformed provisioning input", async () => {
    const response = await apiRequest("/api/agencies", {
      principal: principals.superAdmin,
      method: "POST",
      body: { name: "", slug: "Invalid Slug", owner: { name: "", email: "bad" } },
    });
    expect(response.status).toBe(422);
  });
});
