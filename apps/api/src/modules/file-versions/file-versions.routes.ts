import {
  completeUploadSchema,
  createExternalCompanionPreviewSchema,
  createExternalVersionSchema,
  initiateUploadSchema,
  signUploadPartsSchema,
} from "@rexops/validators";
import { Elysia, t } from "elysia";
import { authGuard, requirePrincipal } from "../../plugins/auth-guard";
import {
  abortUpload,
  completeUpload,
  createExternalCompanionPreview,
  createExternalVersion,
  getDownloadUrl,
  getPosterUrl,
  getPreviewUrl,
  getSpriteUrl,
  initiateUpload,
  inspectUpload,
  listVersions,
  signUploadParts,
} from "./file-versions.service";
import { DevelopmentObjectStorage, objectStorage } from "./storage";

const metadata = {
  deliverableId: t.String({ minLength: 1 }),
  fileName: t.String({ minLength: 1, maxLength: 255 }),
  fileType: t.String({ minLength: 1 }),
  label: t.Optional(t.String({ maxLength: 100 })),
  tags: t.Optional(t.Array(t.String({ minLength: 1, maxLength: 50 }))),
  isMinor: t.Optional(t.Boolean()),
  versionBump: t.Optional(t.Union([t.Literal("MAJOR"), t.Literal("MINOR")])),
  isSource: t.Optional(t.Boolean()),
  previewUrl: t.Optional(t.String({ format: "uri" })),
  purpose: t.Optional(t.Union([t.Literal("VERSION"), t.Literal("COMPANION_PREVIEW")])),
  targetVersionId: t.Optional(t.String({ minLength: 1 })),
  fileFingerprint: t.Optional(t.String({ minLength: 8, maxLength: 500 })),
};

export const fileVersionsRoutes = new Elysia({ prefix: "/api/file-versions" })
  .use(authGuard)
  .post(
    "/uploads/initiate",
    ({ body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return initiateUpload(actor, initiateUploadSchema.parse(body));
    },
    {
      body: t.Object({
        ...metadata,
        fileSizeBytes: t.Number({ minimum: 1, maximum: 5 * 1024 * 1024 * 1024 }),
      }),
    },
  )
  .post(
    "/deliverable/:deliverableId/upload-batch",
    async ({ params, body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      const sessions = [];
      for (const file of body.files) {
        const parsed = initiateUploadSchema.safeParse({
          ...file,
          deliverableId: params.deliverableId,
        });
        if (!parsed.success) {
          sessions.push({
            fileName: typeof file.fileName === "string" ? file.fileName : "Unknown file",
            error: parsed.error.issues[0]?.message ?? "Invalid upload metadata.",
          });
          continue;
        }
        try {
          sessions.push(await initiateUpload(actor, parsed.data));
        } catch (error) {
          sessions.push({
            fileName: parsed.data.fileName,
            error: error instanceof Error ? error.message : "Upload session could not be opened.",
          });
        }
      }
      return { sessions };
    },
    {
      body: t.Object({
        files: t.Array(t.Record(t.String(), t.Unknown()), { minItems: 1, maxItems: 100 }),
      }),
    },
  )
  .get("/uploads/:sessionId", ({ params, principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return inspectUpload(actor, params.sessionId);
  })
  .post(
    "/uploads/:sessionId/parts",
    ({ params, body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      const input = signUploadPartsSchema.parse(body);
      return signUploadParts(actor, params.sessionId, input.partNumbers);
    },
    {
      body: t.Object({
        partNumbers: t.Array(t.Integer({ minimum: 1, maximum: 10_000 }), {
          minItems: 1,
          maxItems: 100,
        }),
      }),
    },
  )
  .post(
    "/uploads/:sessionId/complete",
    ({ params, body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return completeUpload(actor, params.sessionId, completeUploadSchema.parse(body));
    },
    {
      body: t.Object({
        parts: t.Array(
          t.Object({
            partNumber: t.Integer({ minimum: 1, maximum: 10_000 }),
            eTag: t.String({ minLength: 1 }),
          }),
          { minItems: 1, maxItems: 10_000 },
        ),
      }),
    },
  )
  .delete("/uploads/:sessionId", ({ params, principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return abortUpload(actor, params.sessionId);
  })
  .post(
    "/external",
    ({ body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return createExternalVersion(actor, createExternalVersionSchema.parse(body));
    },
    {
      body: t.Object({
        ...metadata,
        externalLink: t.String({ format: "uri" }),
      }),
    },
  )
  .post(
    "/companion-preview/external",
    ({ body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      const input = createExternalCompanionPreviewSchema.parse(body);
      return createExternalCompanionPreview(actor, input.targetVersionId, input.previewUrl);
    },
    {
      body: t.Object({
        targetVersionId: t.String({ minLength: 1 }),
        previewUrl: t.String({ format: "uri" }),
      }),
    },
  )
  .get("/deliverable/:deliverableId", ({ params, principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return listVersions(actor, params.deliverableId);
  })
  .get("/:id/download", ({ params, principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return getDownloadUrl(actor, params.id);
  })
  .get("/:id/preview", ({ params, principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return getPreviewUrl(actor, params.id);
  })
  .get("/:id/poster", ({ params, principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return getPosterUrl(actor, params.id);
  })
  .get("/:id/sprite", ({ params, principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return getSpriteUrl(actor, params.id);
  });

export const developmentUploadRoutes = new Elysia({ prefix: "/api/dev-uploads" })
  .put("/:uploadId/parts/:partNumber", async ({ params, query, request, set }) => {
    if (!(objectStorage instanceof DevelopmentObjectStorage)) {
      set.status = 404;
      return { error: "NOT_FOUND" };
    }
    const partNumber = Number(params.partNumber);
    const expiresAt = Number(query.expires);
    const token = query.token ?? "";
    if (
      !Number.isInteger(partNumber) ||
      partNumber < 1 ||
      !objectStorage.verifyCapability(`upload:${params.uploadId}:${partNumber}`, expiresAt, token)
    ) {
      set.status = 403;
      return { error: "INVALID_UPLOAD_CAPABILITY" };
    }
    const part = await objectStorage.writePart(
      params.uploadId,
      partNumber,
      await request.arrayBuffer(),
    );
    set.headers.etag = part.eTag;
    return { eTag: part.eTag, bytes: part.bytes };
  })
  .get("/object", async ({ query, set }) => {
    if (!(objectStorage instanceof DevelopmentObjectStorage)) {
      set.status = 404;
      return { error: "NOT_FOUND" };
    }
    const key = query.key ?? "";
    const expiresAt = Number(query.expires);
    const token = query.token ?? "";
    if (!objectStorage.verifyCapability(`download:${key}`, expiresAt, token)) {
      set.status = 403;
      return { error: "INVALID_DOWNLOAD_CAPABILITY" };
    }
    const object = await objectStorage.readObject(key);
    return new Response(object.file, {
      headers: {
        "content-type": object.contentType,
        "content-length": String(object.file.size),
        "cache-control": "private, max-age=60",
      },
    });
  });
