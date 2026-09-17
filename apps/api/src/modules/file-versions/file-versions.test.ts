import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { db, deliverables, fileVersions, uploadSessions } from "@rexops/db";
import { eq } from "drizzle-orm";
import { apiRequest, ensureTestFixtures, principals, responseJson } from "../../test/helpers";

const deliverableId = "deliverable_files_test";

beforeAll(async () => {
  await ensureTestFixtures();
  await db
    .insert(deliverables)
    .values({
      id: deliverableId,
      agencyId: "agency_trex",
      clientId: "client_imperial",
      projectId: "project_reels",
      title: "File Version Test Reel",
      contentType: "MOTION",
      status: "IN_PROGRESS",
      assignedToUserId: "user_riya",
      createdByUserId: "user_manas",
    })
    .onConflictDoNothing();
});

afterEach(async () => {
  await db.delete(uploadSessions).where(eq(uploadSessions.deliverableId, deliverableId));
  await db.delete(fileVersions).where(eq(fileVersions.deliverableId, deliverableId));
  await db
    .update(deliverables)
    .set({ status: "IN_PROGRESS" })
    .where(eq(deliverables.id, deliverableId));
});

afterAll(async () => {
  await db.delete(uploadSessions).where(eq(uploadSessions.deliverableId, deliverableId));
  await db.delete(fileVersions).where(eq(fileVersions.deliverableId, deliverableId));
  await db.delete(deliverables).where(eq(deliverables.id, deliverableId));
});

describe("client access to a shared version", () => {
  const versionId = "fv_client_visibility_test";

  test("a client can download a version promoted to them", async () => {
    await db.insert(fileVersions).values({
      id: versionId,
      agencyId: "agency_trex",
      deliverableId,
      versionNumber: 1,
      fileUrl: "agency_trex/deliverable_files_test/final.mp4",
      fileName: "final.mp4",
      visibility: "CLIENT",
      status: "APPROVED",
      uploadedByUserId: "user_manas",
    });

    const listed = await apiRequest(`/api/file-versions/deliverable/${deliverableId}`, {
      principal: principals.clientOwner,
    });
    expect(listed.status).toBe(200);
    expect(((await listed.json()) as Array<{ id: string }>).map((row) => row.id)).toEqual([
      versionId,
    ]);

    const download = await apiRequest(`/api/file-versions/${versionId}/download`, {
      principal: principals.clientOwner,
    });
    expect(download.status).toBe(200);
    expect((await responseJson(download)).url).toBeTruthy();
  });

  test("a client still cannot reach an internal version", async () => {
    await db.insert(fileVersions).values({
      id: versionId,
      agencyId: "agency_trex",
      deliverableId,
      versionNumber: 1,
      fileUrl: "agency_trex/deliverable_files_test/wip.mp4",
      visibility: "INTERNAL",
      uploadedByUserId: "user_manas",
    });

    const download = await apiRequest(`/api/file-versions/${versionId}/download`, {
      principal: principals.clientOwner,
    });
    expect(download.status).toBe(404);
  });

  test("a client of another tenant cannot reach it either", async () => {
    await db.insert(fileVersions).values({
      id: versionId,
      agencyId: "agency_trex",
      deliverableId,
      versionNumber: 1,
      fileUrl: "agency_trex/deliverable_files_test/final.mp4",
      visibility: "CLIENT",
      uploadedByUserId: "user_manas",
    });

    const download = await apiRequest(`/api/file-versions/${versionId}/download`, {
      principal: principals.outsider,
    });
    expect(download.status).toBe(404);
  });
});

describe("file version routes", () => {
  test("runs a multipart session through initiate, sign, and complete", async () => {
    const initiated = await apiRequest("/api/file-versions/uploads/initiate", {
      principal: principals.editor,
      method: "POST",
      body: {
        deliverableId,
        fileName: "beach-vibe-v1.mov",
        fileType: "video/quicktime",
        fileSizeBytes: 21 * 1024 * 1024,
        tags: ["client-cut"],
      },
    });
    expect(initiated.status).toBe(200);
    const upload = await responseJson(initiated);
    expect(upload.partCount).toBe(3);

    const signed = await apiRequest(`/api/file-versions/uploads/${upload.sessionId}/parts`, {
      principal: principals.editor,
      method: "POST",
      body: { partNumbers: [1, 2, 3] },
    });
    expect(signed.status).toBe(200);
    const signedBody = await responseJson(signed);
    expect(signedBody.parts).toHaveLength(3);
    const signedParts = signedBody.parts as Array<{ partNumber: number; url: string }>;
    const uploadedParts = await Promise.all(
      signedParts.map(async (part) => {
        const target = new URL(part.url);
        const uploaded = await apiRequest(`${target.pathname}${target.search}`, {
          method: "PUT",
          rawBody: `part-${part.partNumber}`,
          headers: { "content-type": "application/octet-stream" },
        });
        expect(uploaded.status).toBe(200);
        return {
          partNumber: part.partNumber,
          eTag: uploaded.headers.get("etag"),
        };
      }),
    );
    const inspected = await apiRequest(`/api/file-versions/uploads/${upload.sessionId}`, {
      principal: principals.editor,
    });
    const inspectedBody = await responseJson(inspected);
    expect(inspectedBody.status).toBe("UPLOADING");
    expect(inspectedBody.completedParts).toHaveLength(3);

    const completed = await apiRequest(`/api/file-versions/uploads/${upload.sessionId}/complete`, {
      principal: principals.editor,
      method: "POST",
      body: { parts: uploadedParts },
    });
    expect(completed.status).toBe(200);
    const version = await responseJson(completed);
    expect(version.versionNumber).toBe(1);
    expect(version.displayVersion).toBe("v1.0");
    expect(version.visibility).toBe("INTERNAL");
    expect(version.status).toBe("UPLOADED");

    const download = await apiRequest(`/api/file-versions/${version.id}/download`, {
      principal: principals.editor,
    });
    const downloadTarget = new URL((await responseJson(download)).url as string);
    const downloaded = await apiRequest(`${downloadTarget.pathname}${downloadTarget.search}`);
    expect(downloaded.status).toBe(200);
    expect(await downloaded.text()).toBe("part-1part-2part-3");

    const [updatedDeliverable] = await db
      .select({ status: deliverables.status })
      .from(deliverables)
      .where(eq(deliverables.id, deliverableId));
    expect(updatedDeliverable?.status).toBe("READY_FOR_INTERNAL_REVIEW");
  });

  test("assigns concurrent external versions unique sequential numbers", async () => {
    const create = (label: string) =>
      apiRequest("/api/file-versions/external", {
        principal: principals.editor,
        method: "POST",
        body: {
          deliverableId,
          fileName: `${label}.mov`,
          fileType: "video/quicktime",
          externalLink: `https://video.example.com/${encodeURIComponent(label)}`,
          label,
        },
      });

    const responses = await Promise.all([create("Director Cut"), create("Social Cut")]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    const versions = await Promise.all(responses.map(responseJson));
    expect(versions.map((version) => version.versionNumber).sort()).toEqual([1, 2]);
    expect(versions.map((version) => version.displayVersion).sort()).toEqual(["v1.0", "v2.0"]);
  });

  test("tracks major and minor display versions independently from audit order", async () => {
    const create = (label: string, versionBump: "MAJOR" | "MINOR") =>
      apiRequest("/api/file-versions/external", {
        principal: principals.editor,
        method: "POST",
        body: {
          deliverableId,
          fileName: `${label}.mov`,
          fileType: "video/quicktime",
          externalLink: `https://video.example.com/${label}`,
          label,
          versionBump,
        },
      });
    const first = await responseJson(await create("first", "MAJOR"));
    const polish = await responseJson(await create("polish", "MINOR"));
    const campaign = await responseJson(await create("campaign", "MAJOR"));
    expect([first.displayVersion, polish.displayVersion, campaign.displayVersion]).toEqual([
      "v1.0",
      "v1.1",
      "v2.0",
    ]);
    expect([first.versionNumber, polish.versionNumber, campaign.versionNumber]).toEqual([1, 2, 3]);
  });

  test("keeps internal versions out of the client response", async () => {
    const created = await apiRequest("/api/file-versions/external", {
      principal: principals.editor,
      method: "POST",
      body: {
        deliverableId,
        fileName: "internal.mov",
        fileType: "video/quicktime",
        externalLink: "https://video.example.com/internal",
      },
    });
    const version = await responseJson(created);

    const hidden = await apiRequest(`/api/file-versions/deliverable/${deliverableId}`, {
      principal: principals.clientOwner,
    });
    expect(hidden.status).toBe(200);
    expect(await hidden.json()).toEqual([]);

    await db
      .update(fileVersions)
      .set({ visibility: "CLIENT" })
      .where(eq(fileVersions.id, String(version.id)));

    const visible = await apiRequest(`/api/file-versions/deliverable/${deliverableId}`, {
      principal: principals.clientOwner,
    });
    expect(((await visible.json()) as unknown[]).length).toBe(1);
  });

  test("protects private downloads and allows the agency external link", async () => {
    const created = await apiRequest("/api/file-versions/external", {
      principal: principals.editor,
      method: "POST",
      body: {
        deliverableId,
        fileName: "private.mov",
        fileType: "video/quicktime",
        externalLink: "https://video.example.com/private",
      },
    });
    const version = await responseJson(created);

    const denied = await apiRequest(`/api/file-versions/${version.id}/download`, {
      principal: principals.clientOwner,
    });
    expect(denied.status).toBe(404);

    const allowed = await apiRequest(`/api/file-versions/${version.id}/download`, {
      principal: principals.owner,
    });
    expect(allowed.status).toBe(200);
    expect((await responseJson(allowed)).url).toBe("https://video.example.com/private");
  });

  test("validates input, requires auth, and hides cross-tenant deliverables", async () => {
    const malformed = await apiRequest("/api/file-versions/uploads/initiate", {
      principal: principals.editor,
      method: "POST",
      body: { deliverableId, fileName: "", fileType: "", fileSizeBytes: 0 },
    });
    expect(malformed.status).toBe(422);

    const unauthenticated = await apiRequest(`/api/file-versions/deliverable/${deliverableId}`);
    expect(unauthenticated.status).toBe(401);

    const guessed = await apiRequest("/api/file-versions/uploads/initiate", {
      principal: principals.outsider,
      method: "POST",
      body: {
        deliverableId,
        fileName: "guess.mov",
        fileType: "video/quicktime",
        fileSizeBytes: 1024,
      },
    });
    expect(guessed.status).toBe(404);
  });

  test("opens batch uploads with per-file validation failures", async () => {
    const response = await apiRequest(
      `/api/file-versions/deliverable/${deliverableId}/upload-batch`,
      {
        principal: principals.editor,
        method: "POST",
        body: {
          files: [
            {
              fileName: "valid.mov",
              fileType: "video/quicktime",
              fileSizeBytes: 1024,
              fileFingerprint: "valid:1024:1",
            },
            {
              fileName: "too-large.mov",
              fileType: "video/quicktime",
              fileSizeBytes: 6 * 1024 * 1024 * 1024,
              fileFingerprint: "large:1:1",
            },
          ],
        },
      },
    );
    expect(response.status).toBe(200);
    const body = (await responseJson(response)) as {
      sessions: Array<{ sessionId?: string; error?: string }>;
    };
    expect(body.sessions).toHaveLength(2);
    expect(body.sessions[0]?.sessionId).toBeString();
    expect(body.sessions[1]?.error).toBeString();
  });

  test("serves signed poster and sprite metadata only after derivation", async () => {
    const [version] = await db
      .insert(fileVersions)
      .values({
        agencyId: "agency_trex",
        deliverableId,
        versionNumber: 1,
        majorVersion: 1,
        minorVersion: 0,
        versionBump: "MAJOR",
        fileName: "derived.mov",
        fileType: "video/mp4",
        status: "UPLOADED",
        previewStatus: "READY",
        posterFrameUrl: "derived/poster.jpg",
        thumbnailSpriteUrl: "derived/sprite.jpg",
        spriteIntervalMs: 2000,
        spriteColumns: 10,
        spriteRows: 3,
        spriteCellWidth: 240,
        spriteCellHeight: 135,
        durationMs: 60000,
      })
      .returning();
    if (!version) throw new Error("Fixture version was not created.");

    const poster = await apiRequest(`/api/file-versions/${version.id}/poster`, {
      principal: principals.editor,
    });
    expect(poster.status).toBe(200);
    const sprite = await apiRequest(`/api/file-versions/${version.id}/sprite`, {
      principal: principals.editor,
    });
    expect(sprite.status).toBe(200);
    expect(await responseJson(sprite)).toMatchObject({
      intervalMs: 2000,
      columns: 10,
      rows: 3,
      durationMs: 60000,
    });
  });
});
