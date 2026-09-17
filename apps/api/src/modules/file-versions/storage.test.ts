import { describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { DevelopmentObjectStorage } from "./storage";

describe("development object storage adapter", () => {
  test("returns stable multipart and private-download shapes without cloud credentials", async () => {
    const baseDirectory = `.data/storage-test-${crypto.randomUUID()}`;
    const storage = new DevelopmentObjectStorage({
      baseDirectory,
    });
    const upload = await storage.initiate("agency/deliverable/file.mov", "video/quicktime");
    const part = await storage.signPart(upload, 7);
    expect(part).toContain(`/api/dev-uploads/${upload.uploadId}/parts/7`);
    const bytes = new TextEncoder().encode("storage-test");
    const written = await storage.writePart(upload.uploadId, 7, bytes.buffer);
    await storage.complete(upload, [{ partNumber: 7, eTag: written.eTag }]);
    expect(await storage.abort(upload)).toBeUndefined();
    expect(await storage.signDownload(upload.key)).toContain(
      encodeURIComponent("agency/deliverable/file.mov"),
    );
    await rm(baseDirectory, { recursive: true, force: true });
  });
});
