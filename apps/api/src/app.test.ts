import { describe, expect, test } from "bun:test";
import { apiRequest, principals } from "./test/helpers";

describe("API foundation", () => {
  test("health endpoint is available without authentication", async () => {
    const response = await apiRequest("/healthz");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", service: "rexops-api" });
  });

  test("protected resources return 401 without a session", async () => {
    const response = await apiRequest("/api/clients");
    expect(response.status).toBe(401);
  });

  test("exposes the authenticated shared feature registry", async () => {
    const response = await apiRequest("/api/features/", { principal: principals.owner });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      "files.versioning": true,
      "review.wedge": true,
      "collaboration.live": true,
    });
  });
});
