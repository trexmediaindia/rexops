import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { agencies, db } from "@rexops/db";
import { eq } from "drizzle-orm";
import { apiRequest, ensureTestFixtures, principals, responseJson } from "../../test/helpers";
import { DEFAULT_QUOTA_BYTES, type getStorageUsage } from "./storage.service";

type StorageUsage = Awaited<ReturnType<typeof getStorageUsage>>;

beforeAll(ensureTestFixtures);

afterAll(async () => {
  await db.update(agencies).set({ settings: {} }).where(eq(agencies.id, "agency_trex"));
});

describe("storage usage", () => {
  test("reports bytes held and the tenant's quota", async () => {
    const response = await apiRequest("/api/storage", { principal: principals.owner });
    expect(response.status).toBe(200);
    const usage = (await response.json()) as StorageUsage;
    expect(usage.quotaBytes).toBe(DEFAULT_QUOTA_BYTES);
    expect(usage.usedBytes).toBe(usage.versionBytes + usage.attachmentBytes);
    expect(usage.usedBytes).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(usage.versionCount)).toBe(true);
  });

  test("clients get no window into agency capacity", async () => {
    const response = await apiRequest("/api/storage", { principal: principals.clientOwner });
    expect(response.status).toBe(403);
  });

  test("requires authentication", async () => {
    expect((await apiRequest("/api/storage")).status).toBe(401);
  });

  test("an owner can raise the quota and it persists on the agency row", async () => {
    const quotaBytes = 250 * 1024 * 1024 * 1024;
    const response = await apiRequest("/api/storage", {
      principal: principals.owner,
      method: "PATCH",
      body: { quotaBytes },
    });
    expect(response.status).toBe(200);
    expect((await responseJson(response)).quotaBytes).toBe(quotaBytes);

    const read = await apiRequest("/api/storage", { principal: principals.owner });
    expect((await responseJson(read)).quotaBytes).toBe(quotaBytes);
  });

  test("a plain member cannot change the quota", async () => {
    const response = await apiRequest("/api/storage", {
      principal: principals.editor,
      method: "PATCH",
      body: { quotaBytes: 1024 * 1024 * 1024 },
    });
    expect(response.status).toBe(403);
  });
});
