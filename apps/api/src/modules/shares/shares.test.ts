import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { comments, db, deliverables, fileVersions, shares, users } from "@rexops/db";
import { eq, like } from "drizzle-orm";
import { apiRequest, ensureTestFixtures, principals, responseJson } from "../../test/helpers";

const deliverableId = "deliverable_share_test";
const versionId = "version_share_test";

beforeAll(async () => {
  await ensureTestFixtures();
  await db
    .insert(deliverables)
    .values({
      id: deliverableId,
      agencyId: "agency_trex",
      clientId: "client_imperial",
      projectId: "project_reels",
      title: "Share Test Reel",
      contentType: "MOTION",
      status: "UNDER_CLIENT_REVIEW",
      assignedToUserId: "user_riya",
      createdByUserId: "user_manas",
    })
    .onConflictDoNothing();
  await db
    .insert(fileVersions)
    .values({
      id: versionId,
      agencyId: "agency_trex",
      deliverableId,
      versionNumber: 1,
      fileName: "share.mov",
      fileType: "video/quicktime",
      externalLink: "https://video.example.com/share",
      previewUrl: "https://video.example.com/share-preview",
      visibility: "CLIENT",
      status: "UNDER_CLIENT_REVIEW",
      uploadedByUserId: "user_riya",
    })
    .onConflictDoNothing();
});

afterEach(async () => {
  await db.delete(comments).where(eq(comments.deliverableId, deliverableId));
  await db.delete(shares).where(eq(shares.agencyId, "agency_trex"));
  await db.delete(users).where(like(users.id, "guest_%"));
});

afterAll(async () => {
  await db.delete(comments).where(eq(comments.deliverableId, deliverableId));
  await db.delete(shares).where(eq(shares.agencyId, "agency_trex"));
  await db.delete(fileVersions).where(eq(fileVersions.deliverableId, deliverableId));
  await db.delete(deliverables).where(eq(deliverables.id, deliverableId));
  await db.delete(users).where(like(users.id, "guest_%"));
});

describe("review shares", () => {
  test("enforces passphrase, download, watermark, expiry, and guest comments", async () => {
    const created = await apiRequest("/api/shares", {
      method: "POST",
      principal: principals.owner,
      body: {
        resourceType: "FILE_VERSION",
        resourceId: versionId,
        passphrase: "meteor-forest",
        expiresAt: new Date(Date.now() + 60_000),
        allowComment: true,
        allowDownload: false,
        watermark: "STANDARD",
      },
    });
    expect(created.status).toBe(200);
    const share = await responseJson(created);

    const denied = await apiRequest(`/api/public/shares/${share.token}/access`, {
      method: "POST",
      body: { passphrase: "wrong-value" },
    });
    expect(denied.status).toBe(403);

    const allowed = await apiRequest(`/api/public/shares/${share.token}/access`, {
      method: "POST",
      body: { passphrase: "meteor-forest" },
    });
    expect(allowed.status).toBe(200);
    const access = await responseJson(allowed);
    expect((access.fileVersion as { downloadUrl: string | null }).downloadUrl).toBeNull();
    expect(access.watermarkText).toContain("Shared via RexOps");

    const commented = await apiRequest(`/api/public/shares/${share.token}/comments`, {
      method: "POST",
      body: {
        passphrase: "meteor-forest",
        guestName: "External Reviewer",
        message: "The pacing lands well.",
        anchorType: "TIMECODE",
        anchor: { milliseconds: 8200 },
      },
    });
    expect(commented.status).toBe(200);

    await db
      .update(shares)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(shares.id, String(share.id)));
    const expired = await apiRequest(`/api/public/shares/${share.token}/access`, {
      method: "POST",
      body: { passphrase: "meteor-forest" },
    });
    expect(expired.status).toBe(403);
  });

  test("hides cross-tenant resources and validates share input", async () => {
    const guessed = await apiRequest("/api/shares", {
      method: "POST",
      principal: principals.outsider,
      body: { resourceType: "FILE_VERSION", resourceId: versionId },
    });
    expect(guessed.status).toBe(404);

    const malformed = await apiRequest("/api/shares", {
      method: "POST",
      principal: principals.owner,
      body: {
        resourceType: "FILE_VERSION",
        resourceId: versionId,
        passphrase: "short",
      },
    });
    expect(malformed.status).toBe(422);
  });
});
