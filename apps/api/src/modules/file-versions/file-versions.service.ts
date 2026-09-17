import type { Principal } from "@rexops/core";
import {
  assertClientRecordAccess,
  assertTenantAccess,
  assertWritablePrincipal,
  ConflictError,
  can,
  ForbiddenError,
  NotFoundError,
  visibleVersions,
} from "@rexops/core";
import { db, deliverables, fileVersions, outbox, uploadSessions } from "@rexops/db";
import type {
  CompleteUploadInput,
  CreateExternalVersionInput,
  InitiateUploadInput,
} from "@rexops/validators";
import { and, desc, eq, inArray, isNull, max, sql } from "drizzle-orm";
import { getDeliverable } from "../deliverables/deliverables.service";
import { type MultipartUpload, type ObjectStorage, objectStorage } from "./storage";

type UploadMetadata = Omit<InitiateUploadInput, "fileSizeBytes"> & MultipartUpload;

const storage = objectStorage;

function serializeVersion(version: typeof fileVersions.$inferSelect) {
  return {
    ...version,
    fileSizeBytes: version.fileSizeBytes?.toString() ?? null,
    displayVersion: `v${version.majorVersion}.${version.minorVersion}`,
  };
}

async function getDeliverableForFileWrite(principal: Principal, deliverableId: string) {
  if (!can(principal, "create", "fileVersion") || !principal.agencyId) {
    throw new ForbiddenError();
  }
  assertWritablePrincipal(principal);
  const [deliverable] = await db
    .select()
    .from(deliverables)
    .where(
      and(
        eq(deliverables.id, deliverableId),
        eq(deliverables.agencyId, principal.agencyId),
        isNull(deliverables.deletedAt),
      ),
    )
    .limit(1);
  if (!deliverable) throw new NotFoundError();
  if (
    principal.role === "AGENCY_MEMBER" &&
    deliverable.assignedToUserId !== principal.userId &&
    !principal.permissions.canViewAllClients
  ) {
    throw new NotFoundError();
  }
  return deliverable;
}

function parseUploadKey(value: string): UploadMetadata {
  return JSON.parse(value) as UploadMetadata;
}

export async function initiateUpload(
  principal: Principal,
  input: InitiateUploadInput,
  objectStorage: ObjectStorage = storage,
) {
  const deliverable = await getDeliverableForFileWrite(principal, input.deliverableId);
  if (input.purpose === "COMPANION_PREVIEW") {
    const [target] = await db
      .select()
      .from(fileVersions)
      .where(
        and(
          eq(fileVersions.id, input.targetVersionId ?? ""),
          eq(fileVersions.deliverableId, deliverable.id),
          isNull(fileVersions.deletedAt),
        ),
      )
      .limit(1);
    if (!target?.isSource) throw new NotFoundError();
  }
  const safeFileName = input.fileName.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
  const key = `${deliverable.agencyId}/${deliverable.id}/${crypto.randomUUID()}-${safeFileName}`;
  const upload = await objectStorage.initiate(key, input.fileType);
  const metadata: UploadMetadata = {
    ...input,
    uploadId: upload.uploadId,
    key: upload.key,
  };
  const [session] = await db
    .insert(uploadSessions)
    .values({
      agencyId: deliverable.agencyId,
      deliverableId: deliverable.id,
      purpose: input.purpose,
      targetVersionId: input.targetVersionId,
      fileFingerprint: input.fileFingerprint,
      uploadKey: JSON.stringify(metadata),
      bytesTotal: BigInt(input.fileSizeBytes),
      createdByUserId: principal.userId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    })
    .returning({ id: uploadSessions.id });
  if (!session) throw new Error("Upload session insert failed.");
  return {
    sessionId: session.id,
    key,
    uploadId: upload.uploadId,
    partSizeBytes: 10 * 1024 * 1024,
    partCount: Math.ceil(input.fileSizeBytes / (10 * 1024 * 1024)),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  };
}

export async function initiateUploadBatch(
  principal: Principal,
  inputs: InitiateUploadInput[],
  objectStorage: ObjectStorage = storage,
) {
  const sessions = [];
  for (const input of inputs) {
    try {
      sessions.push(await initiateUpload(principal, input, objectStorage));
    } catch (error) {
      sessions.push({
        fileName: input.fileName,
        error: error instanceof Error ? error.message : "Upload session could not be opened.",
      });
    }
  }
  return { sessions };
}

async function getUploadSession(principal: Principal, sessionId: string) {
  const [session] = await db
    .select()
    .from(uploadSessions)
    .where(eq(uploadSessions.id, sessionId))
    .limit(1);
  if (!session) throw new NotFoundError();
  assertClientRecordAccess(principal, session);
  if (session.createdByUserId !== principal.userId && principal.role === "AGENCY_MEMBER") {
    throw new NotFoundError();
  }
  if (
    session.expiresAt <= new Date() &&
    !["COMPLETE", "ABORTED", "EXPIRED"].includes(session.status)
  ) {
    await db
      .update(uploadSessions)
      .set({ status: "EXPIRED" })
      .where(eq(uploadSessions.id, session.id));
    throw new ForbiddenError("This upload session has expired.");
  }
  return session;
}

export async function inspectUpload(
  principal: Principal,
  sessionId: string,
  objectStorage: ObjectStorage = storage,
) {
  const session = await getUploadSession(principal, sessionId);
  const upload = parseUploadKey(session.uploadKey);
  const parts =
    session.status === "COMPLETE" || session.status === "ABORTED"
      ? []
      : await objectStorage.listParts(upload);
  const partSizeBytes = 10 * 1024 * 1024;
  const bytesTotal = Number(session.bytesTotal ?? 0n);
  const completedBytes = parts.reduce((total, part) => {
    const start = (part.partNumber - 1) * partSizeBytes;
    return total + Math.max(0, Math.min(partSizeBytes, bytesTotal - start));
  }, 0);
  if (BigInt(completedBytes) !== session.bytesUploaded) {
    await db
      .update(uploadSessions)
      .set({ bytesUploaded: BigInt(completedBytes) })
      .where(eq(uploadSessions.id, session.id));
  }
  return {
    sessionId: session.id,
    deliverableId: session.deliverableId,
    purpose: session.purpose,
    targetVersionId: session.targetVersionId,
    fileName: upload.fileName,
    fileType: upload.fileType,
    fileSizeBytes: session.bytesTotal?.toString() ?? null,
    fileFingerprint: session.fileFingerprint,
    status: session.status,
    expiresAt: session.expiresAt,
    partSizeBytes,
    partCount: Math.ceil(bytesTotal / partSizeBytes),
    completedParts: parts,
  };
}

export async function signUploadParts(
  principal: Principal,
  sessionId: string,
  partNumbers: number[],
  objectStorage: ObjectStorage = storage,
) {
  const session = await getUploadSession(principal, sessionId);
  if (["COMPLETE", "ABORTED", "EXPIRED"].includes(session.status)) {
    throw new ForbiddenError("This upload session is closed.");
  }
  const upload = parseUploadKey(session.uploadKey);
  const parts = await Promise.all(
    partNumbers.map(async (partNumber) => ({
      partNumber,
      url: await objectStorage.signPart(upload, partNumber),
    })),
  );
  await db
    .update(uploadSessions)
    .set({ status: "UPLOADING" })
    .where(eq(uploadSessions.id, session.id));
  return { sessionId, parts };
}

async function createVersionInTransaction(
  principal: Principal,
  metadata: UploadMetadata | CreateExternalVersionInput,
  file: { fileUrl?: string; externalLink?: string; previewUrl?: string; fileSizeBytes?: bigint },
) {
  const deliverable = await getDeliverableForFileWrite(principal, metadata.deliverableId);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${deliverable.id}))`);
    const [current] = await tx
      .select({
        latest: max(fileVersions.versionNumber),
        major: max(fileVersions.majorVersion),
      })
      .from(fileVersions)
      .where(and(eq(fileVersions.deliverableId, deliverable.id), isNull(fileVersions.deletedAt)));
    const versionNumber = (current?.latest ?? 0) + 1;
    const latestMajor = current?.major ?? 0;
    const [latestSemantic] = latestMajor
      ? await tx
          .select({
            majorVersion: fileVersions.majorVersion,
            minorVersion: fileVersions.minorVersion,
          })
          .from(fileVersions)
          .where(
            and(
              eq(fileVersions.deliverableId, deliverable.id),
              eq(fileVersions.majorVersion, latestMajor),
              isNull(fileVersions.deletedAt),
            ),
          )
          .orderBy(desc(fileVersions.minorVersion))
          .limit(1)
      : [];
    const bump = versionNumber === 1 ? "MAJOR" : metadata.versionBump;
    const majorVersion =
      versionNumber === 1
        ? 1
        : bump === "MAJOR"
          ? (latestSemantic?.majorVersion ?? 0) + 1
          : latestMajor;
    const minorVersion =
      versionNumber === 1 || bump === "MAJOR" ? 0 : (latestSemantic?.minorVersion ?? 0) + 1;

    if (deliverable.status === "REVISION_REQUESTED") {
      await tx
        .update(fileVersions)
        .set({ status: "REPLACED" })
        .where(and(eq(fileVersions.deliverableId, deliverable.id), isNull(fileVersions.deletedAt)));
    }

    const [version] = await tx
      .insert(fileVersions)
      .values({
        agencyId: deliverable.agencyId,
        deliverableId: deliverable.id,
        versionNumber,
        majorVersion,
        minorVersion,
        versionBump: bump,
        label: metadata.label,
        tags: metadata.tags,
        isMinor: bump === "MINOR",
        fileUrl: file.fileUrl,
        externalLink: file.externalLink,
        previewUrl: file.previewUrl,
        previewStatus: file.previewUrl ? "READY" : "PENDING",
        previewGeneratedAt: file.previewUrl ? new Date() : null,
        fileName: metadata.fileName,
        fileType: metadata.fileType,
        fileSizeBytes: file.fileSizeBytes,
        isSource: metadata.isSource,
        uploadedByUserId: principal.userId,
      })
      .returning();
    if (!version) throw new Error("File version insert failed.");

    if (["IN_PROGRESS", "REVISION_REQUESTED"].includes(deliverable.status)) {
      await tx
        .update(deliverables)
        .set({ status: "READY_FOR_INTERNAL_REVIEW" })
        .where(eq(deliverables.id, deliverable.id));
    }
    await tx.insert(outbox).values({
      agencyId: deliverable.agencyId,
      eventType: "VERSION_UPLOADED",
      payload: {
        fileVersionId: version.id,
        deliverableId: deliverable.id,
        objectKey: file.fileUrl,
        isSource: metadata.isSource,
        previewUrl: file.previewUrl,
      },
    });
    return serializeVersion(version);
  });
}

export async function completeUpload(
  principal: Principal,
  sessionId: string,
  input: CompleteUploadInput,
  objectStorage: ObjectStorage = storage,
) {
  const session = await getUploadSession(principal, sessionId);
  if (["COMPLETE", "ABORTED", "EXPIRED"].includes(session.status)) {
    throw new ForbiddenError("This upload session is closed.");
  }
  const metadata = parseUploadKey(session.uploadKey);
  await objectStorage.complete(metadata, input.parts);
  const version =
    session.purpose === "COMPANION_PREVIEW"
      ? await attachCompanionPreview(principal, session.targetVersionId ?? "", metadata.key)
      : await createVersionInTransaction(principal, metadata, {
          fileUrl: metadata.key,
          previewUrl: metadata.previewUrl,
          fileSizeBytes: session.bytesTotal ?? undefined,
        });
  await db
    .update(uploadSessions)
    .set({
      status: "COMPLETE",
      bytesUploaded: session.bytesTotal ?? 0n,
      completedAt: new Date(),
    })
    .where(eq(uploadSessions.id, session.id));
  return version;
}

async function attachCompanionPreview(
  principal: Principal,
  targetVersionId: string,
  previewUrl: string,
) {
  const [target] = await db
    .select()
    .from(fileVersions)
    .where(and(eq(fileVersions.id, targetVersionId), isNull(fileVersions.deletedAt)))
    .limit(1);
  if (!target) throw new NotFoundError();
  await getDeliverableForFileWrite(principal, target.deliverableId);
  if (!target.isSource) throw new NotFoundError();
  const [updated] = await db
    .update(fileVersions)
    .set({
      previewUrl,
      previewStatus: "READY",
      previewError: null,
      previewGeneratedAt: new Date(),
    })
    .where(eq(fileVersions.id, target.id))
    .returning();
  if (!updated) throw new NotFoundError();
  await db.insert(outbox).values({
    agencyId: updated.agencyId,
    eventType: "COMPANION_PREVIEW_ATTACHED",
    payload: {
      deliverableId: updated.deliverableId,
      fileVersionId: updated.id,
      previewUrl,
      actorUserId: principal.userId,
    },
  });
  return serializeVersion(updated);
}

export async function createExternalCompanionPreview(
  principal: Principal,
  targetVersionId: string,
  previewUrl: string,
) {
  return attachCompanionPreview(principal, targetVersionId, previewUrl);
}

export async function abortUpload(
  principal: Principal,
  sessionId: string,
  objectStorage: ObjectStorage = storage,
) {
  const session = await getUploadSession(principal, sessionId);
  const upload = parseUploadKey(session.uploadKey);
  await objectStorage.abort(upload);
  await db
    .update(uploadSessions)
    .set({ status: "ABORTED" })
    .where(eq(uploadSessions.id, session.id));
  return { aborted: true };
}

export async function expireUploads(now = new Date(), objectStorage: ObjectStorage = storage) {
  const sessions = await db
    .select()
    .from(uploadSessions)
    .where(
      and(
        sql`${uploadSessions.expiresAt} <= ${now}`,
        inArray(uploadSessions.status, ["INIT", "UPLOADING"]),
      ),
    );
  for (const session of sessions) {
    await objectStorage.abort(parseUploadKey(session.uploadKey)).catch(() => undefined);
    await db
      .update(uploadSessions)
      .set({ status: "EXPIRED" })
      .where(eq(uploadSessions.id, session.id));
  }
  return sessions.length;
}

export async function createExternalVersion(
  principal: Principal,
  input: CreateExternalVersionInput,
) {
  return createVersionInTransaction(principal, input, {
    externalLink: input.externalLink,
    previewUrl: input.previewUrl,
  });
}

export async function listVersions(principal: Principal, deliverableId: string) {
  await getDeliverable(principal, deliverableId);
  const versions = await db
    .select()
    .from(fileVersions)
    .where(and(eq(fileVersions.deliverableId, deliverableId), isNull(fileVersions.deletedAt)))
    .orderBy(desc(fileVersions.versionNumber));
  return visibleVersions(principal, versions).map(serializeVersion);
}

export async function getDownloadUrl(
  principal: Principal,
  versionId: string,
  objectStorage: ObjectStorage = storage,
) {
  const [version] = await db
    .select()
    .from(fileVersions)
    .where(and(eq(fileVersions.id, versionId), isNull(fileVersions.deletedAt)))
    .limit(1);
  if (!version) throw new NotFoundError();
  // `file_version` carries no `clientId` — the client scoping is the
  // `getDeliverable` call below, which reads the column that does have one.
  // Asking for a client record match here compared against `undefined` and so
  // 404'd every client read of a version they were explicitly sent.
  assertTenantAccess(principal, version);
  await getDeliverable(principal, version.deliverableId);
  if (principal.role.startsWith("CLIENT_") && version.visibility !== "CLIENT") {
    throw new NotFoundError();
  }
  if (version.externalLink) return { url: version.externalLink, external: true };
  if (!version.fileUrl) throw new NotFoundError();
  return { url: await objectStorage.signDownload(version.fileUrl), external: false };
}

export async function getPreviewUrl(
  principal: Principal,
  versionId: string,
  objectStorage: ObjectStorage = storage,
) {
  const [version] = await db
    .select()
    .from(fileVersions)
    .where(and(eq(fileVersions.id, versionId), isNull(fileVersions.deletedAt)))
    .limit(1);
  if (!version) throw new NotFoundError();
  // `file_version` carries no `clientId` — the client scoping is the
  // `getDeliverable` call below, which reads the column that does have one.
  // Asking for a client record match here compared against `undefined` and so
  // 404'd every client read of a version they were explicitly sent.
  assertTenantAccess(principal, version);
  await getDeliverable(principal, version.deliverableId);
  if (principal.role.startsWith("CLIENT_") && version.visibility !== "CLIENT") {
    throw new NotFoundError();
  }
  if (!version.previewUrl) throw new NotFoundError();
  if (/^https?:\/\//i.test(version.previewUrl)) {
    return { url: version.previewUrl, external: true };
  }
  return { url: await objectStorage.signDownload(version.previewUrl), external: false };
}

async function getAccessibleVersion(principal: Principal, versionId: string) {
  const [version] = await db
    .select()
    .from(fileVersions)
    .where(and(eq(fileVersions.id, versionId), isNull(fileVersions.deletedAt)))
    .limit(1);
  if (!version) throw new NotFoundError();
  // `file_version` carries no `clientId` — the client scoping is the
  // `getDeliverable` call below, which reads the column that does have one.
  // Asking for a client record match here compared against `undefined` and so
  // 404'd every client read of a version they were explicitly sent.
  assertTenantAccess(principal, version);
  await getDeliverable(principal, version.deliverableId);
  if (principal.role.startsWith("CLIENT_") && version.visibility !== "CLIENT") {
    throw new NotFoundError();
  }
  return version;
}

export async function getPosterUrl(
  principal: Principal,
  versionId: string,
  objectStorage: ObjectStorage = storage,
) {
  const version = await getAccessibleVersion(principal, versionId);
  if (!version.posterFrameUrl) {
    throw new ConflictError("POSTER_NOT_READY");
  }
  return {
    url: /^https?:\/\//i.test(version.posterFrameUrl)
      ? version.posterFrameUrl
      : await objectStorage.signDownload(version.posterFrameUrl),
  };
}

export async function getSpriteUrl(
  principal: Principal,
  versionId: string,
  objectStorage: ObjectStorage = storage,
) {
  const version = await getAccessibleVersion(principal, versionId);
  if (
    !version.thumbnailSpriteUrl ||
    !version.spriteIntervalMs ||
    !version.spriteColumns ||
    !version.spriteRows ||
    !version.spriteCellWidth ||
    !version.spriteCellHeight ||
    !version.durationMs
  ) {
    throw new ConflictError("SPRITE_NOT_READY");
  }
  return {
    url: /^https?:\/\//i.test(version.thumbnailSpriteUrl)
      ? version.thumbnailSpriteUrl
      : await objectStorage.signDownload(version.thumbnailSpriteUrl),
    intervalMs: version.spriteIntervalMs,
    columns: version.spriteColumns,
    rows: version.spriteRows,
    cellWidth: version.spriteCellWidth,
    cellHeight: version.spriteCellHeight,
    durationMs: version.durationMs,
  };
}
