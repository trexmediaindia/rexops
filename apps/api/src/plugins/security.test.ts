import { beforeEach, describe, expect, test } from "bun:test";
import { app } from "../app";
import { clearRateLimitsForTests, consumeRateLimit } from "./security";

beforeEach(clearRateLimitsForTests);

describe("API hardening", () => {
  test("sets baseline browser security headers", async () => {
    const response = await app.handle(new Request("http://localhost/healthz"));
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("permissions-policy")).toContain("camera=()");
  });

  test("limits public and authentication request bursts", () => {
    for (let index = 0; index < 60; index += 1) {
      expect(consumeRateLimit("test-key", 1000).allowed).toBe(true);
    }
    expect(consumeRateLimit("test-key", 1000).allowed).toBe(false);
    expect(consumeRateLimit("test-key", 61_001).allowed).toBe(true);
  });
});
