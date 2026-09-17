import type { Principal } from "@rexops/core";
import {
  assertShareActive,
  assertWritablePrincipal,
  can,
  ForbiddenError,
  NotFoundError,
} from "@rexops/core";
import {
  attachments,
  commentReactions,
  comments,
  db,
  deliverables,
  fileVersions,
  outbox,
  shares,
  users,
} from "@rexops/db";
import type { CreateShareInput, GuestCommentInput } from "@rexops/validators";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { getDeliverable } from "../deliverables/deliverables.service";
import { objectStorage } from "../file-versions/storage";
import { normalizedAnchor } from "../reviews/reviews.service";

async function resolveShareResource(
  resourceType: "DELIVERABLE" | "FILE_VERSION",
  resourceId: string,
) {
  if (resourceType === "DELIVERABLE") {
    const [deliverable] = await db
      .select()
      .from(deliverables)
      .where(and(eq(deliverables.id, resourceId), isNull(deliverables.deletedAt)))
      .limit(1);
    if (!deliverable) throw new NotFoundError();
    return { deliverable, fileVersion: null };
  }
  const [fileVersion] = await db
    .select()
    .from(fileVersions)
    .where(and(eq(fileVersions.id, resourceId), isNull(fileVersions.deletedAt)))
    .limit(1);
  if (!fileVersion) throw new NotFoundError();
  const [deliverable] = await db
    .select()
    .from(deliverables)
    .where(and(eq(deliverables.id, fileVersion.deliverableId), isNull(deliverables.deletedAt)))
    .limit(1);
  if (!deliverable) throw new NotFoundError();
  return { deliverable, fileVersion };
}

export async function createShare(principal: Principal, input: CreateShareInput) {
  if (!can(principal, "create", "share") || !principal.agencyId) throw new ForbiddenError();
  assertWritablePrincipal(principal);
  const resource = await resolveShareResource(input.resourceType, input.resourceId);
  await getDeliverable(principal, resource.deliverable.id);
  if (resource.deliverable.agencyId !== principal.agencyId) throw new NotFoundError();
  const token = `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
  const [share] = await db
    .insert(shares)
    .values({
      agencyId: principal.agencyId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      token,
      passphraseHash: input.passphrase ? await hashPassword(input.passphrase) : null,
      expiresAt: input.expiresAt,
      allowComment: input.allowComment,
      allowDownload: input.allowDownload,
      watermark: input.watermark,
      audience: input.audience,
      createdByUserId: principal.userId,
    })
    .returning();
  if (!share) throw new Error("Share insert failed.");
  return {
    ...share,
    passphraseHash: undefined,
    url: `${process.env.WEB_URL ?? "http://localhost:5173"}/share/${token}`,
    protected: Boolean(share.passphraseHash),
  };
}

export async function listShares(principal: Principal, deliverableId: string) {
  const deliverable = await getDeliverable(principal, deliverableId);
  const versions = await db
    .select({ id: fileVersions.id })
    .from(fileVersions)
    .where(eq(fileVersions.deliverableId, deliverableId));
  const resources = [
    and(eq(shares.resourceType, "DELIVERABLE"), eq(shares.resourceId, deliverableId)),
  ];
  if (versions.length) {
    resources.push(
      and(
        eq(shares.resourceType, "FILE_VERSION"),
        inArray(
          shares.resourceId,
          versions.map((version) => version.id),
        ),
      ),
    );
  }
  const visibilityFilter = principal.role.startsWith("CLIENT_")
    ? or(eq(shares.audience, "CLIENT"), eq(shares.audience, "GUEST"))
    : undefined;
  return db
    .select({
      id: shares.id,
      token: shares.token,
      resourceType: shares.resourceType,
      resourceId: shares.resourceId,
      expiresAt: shares.expiresAt,
      allowComment: shares.allowComment,
      allowDownload: shares.allowDownload,
      watermark: shares.watermark,
      audience: shares.audience,
      viewCount: shares.viewCount,
      createdAt: shares.createdAt,
    })
    .from(shares)
    .where(
      and(
        eq(shares.agencyId, (deliverable as { agencyId: string }).agencyId),
        isNull(shares.deletedAt),
        or(...resources),
        visibilityFilter,
      ),
    )
    .orderBy(desc(shares.createdAt));
}

export async function revokeShare(principal: Principal, shareId: string) {
  if (!can(principal, "delete", "share") || !principal.agencyId) throw new ForbiddenError();
  assertWritablePrincipal(principal);
  const [share] = await db
    .update(shares)
    .set({ deletedAt: new Date() })
    .where(and(eq(shares.id, shareId), eq(shares.agencyId, principal.agencyId)))
    .returning({ id: shares.id });
  if (!share) throw new NotFoundError();
  return { revoked: true };
}

async function verifiedShare(token: string, passphrase?: string) {
  const [share] = await db
    .select()
    .from(shares)
    .where(and(eq(shares.token, token), isNull(shares.deletedAt)))
    .limit(1);
  if (!share) throw new NotFoundError();
  try {
    assertShareActive(share);
  } catch {
    throw new ForbiddenError("This review link has expired.");
  }
  if (
    share.passphraseHash &&
    (!passphrase || !(await verifyPassword({ hash: share.passphraseHash, password: passphrase })))
  ) {
    throw new ForbiddenError("The review-link passphrase is incorrect.");
  }
  return share;
}

async function shareVersion(share: typeof shares.$inferSelect) {
  const resource = await resolveShareResource(
    share.resourceType as "DELIVERABLE" | "FILE_VERSION",
    share.resourceId,
  );
  if (resource.fileVersion) return { ...resource, fileVersion: resource.fileVersion };
  const [fileVersion] = await db
    .select()
    .from(fileVersions)
    .where(
      and(eq(fileVersions.deliverableId, resource.deliverable.id), isNull(fileVersions.deletedAt)),
    )
    .orderBy(desc(fileVersions.versionNumber))
    .limit(1);
  if (!fileVersion) throw new NotFoundError();
  return { ...resource, fileVersion };
}

async function ensureGuestUser(
  share: typeof shares.$inferSelect,
  deliverable: typeof deliverables.$inferSelect,
  guestName: string,
) {
  const guestKey = new Bun.CryptoHasher("sha256")
    .update(`${share.id}:${guestName.toLowerCase()}`)
    .digest("hex")
    .slice(0, 24);
  const guestUserId = `guest_${guestKey}`;
  await db
    .insert(users)
    .values({
      id: guestUserId,
      name: guestName,
      email: `${guestKey}@guest.rexops.invalid`,
      role: "CLIENT_MEMBER",
      agencyId: deliverable.agencyId,
      clientId: deliverable.clientId,
      permissions: {},
    })
    .onConflictDoNothing();
  return guestUserId;
}

export async function accessShare(token: string, passphrase?: string) {
  const share = await verifiedShare(token, passphrase);
  const resource = await shareVersion(share);
  const previewUrl = resource.fileVersion.previewUrl
    ? /^https?:\/\//i.test(resource.fileVersion.previewUrl)
      ? resource.fileVersion.previewUrl
      : await objectStorage.signDownload(resource.fileVersion.previewUrl)
    : null;
  const downloadUrl =
    share.allowDownload && resource.fileVersion.fileUrl
      ? await objectStorage.signDownload(resource.fileVersion.fileUrl)
      : share.allowDownload
        ? resource.fileVersion.externalLink
        : null;
  const commentRows = await db
    .select({
      id: comments.id,
      parentId: comments.parentId,
      message: comments.message,
      anchorType: comments.anchorType,
      anchor: comments.anchor,
      authorName: users.name,
      resolvedAt: comments.resolvedAt,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.userId))
    .where(
      and(
        eq(comments.deliverableId, resource.deliverable.id),
        eq(comments.fileVersionId, resource.fileVersion.id),
        eq(comments.visibility, "CLIENT_VISIBLE"),
        isNull(comments.deletedAt),
      ),
    )
    .orderBy(asc(comments.createdAt));
  const commentIds = commentRows.map((comment) => comment.id);
  const [reactionRows, attachmentRows] = await Promise.all([
    commentIds.length
      ? db.select().from(commentReactions).where(inArray(commentReactions.commentId, commentIds))
      : Promise.resolve([]),
    commentIds.length
      ? db
          .select({
            id: attachments.id,
            parentId: attachments.parentId,
            fileName: attachments.fileName,
            fileType: attachments.fileType,
            fileSizeBytes: attachments.fileSizeBytes,
          })
          .from(attachments)
          .where(
            and(eq(attachments.parentType, "COMMENT"), inArray(attachments.parentId, commentIds)),
          )
      : Promise.resolve([]),
  ]);
  await db.transaction(async (tx) => {
    await tx
      .update(shares)
      .set({ viewCount: sql`${shares.viewCount} + 1` })
      .where(eq(shares.id, share.id));
    await tx.insert(outbox).values({
      agencyId: share.agencyId,
      eventType: "SHARE_VIEWED",
      payload: {
        shareId: share.id,
        deliverableId: resource.deliverable.id,
        fileVersionId: resource.fileVersion.id,
      },
    });
  });
  return {
    share: {
      allowComment: share.allowComment,
      allowDownload: share.allowDownload,
      watermark: share.watermark,
      audience: share.audience,
      expiresAt: share.expiresAt,
      protected: Boolean(share.passphraseHash),
    },
    deliverable: {
      id: resource.deliverable.id,
      title: resource.deliverable.title,
      contentType: resource.deliverable.contentType,
    },
    fileVersion: {
      id: resource.fileVersion.id,
      versionNumber: resource.fileVersion.versionNumber,
      label: resource.fileVersion.label,
      fileName: resource.fileVersion.fileName,
      fileType: resource.fileVersion.fileType,
      previewUrl,
      downloadUrl,
    },
    comments: commentRows.map((comment) => ({
      ...comment,
      reactionRows: reactionRows.filter((reaction) => reaction.commentId === comment.id),
      attachmentRows: attachmentRows
        .filter((attachment) => attachment.parentId === comment.id)
        .map((attachment) => ({
          ...attachment,
          fileSizeBytes: attachment.fileSizeBytes.toString(),
        })),
    })),
    watermarkText:
      share.watermark === "STANDARD"
        ? `Shared via RexOps · ${token.slice(-8).toUpperCase()}`
        : null,
  };
}

export async function createGuestComment(token: string, input: GuestCommentInput) {
  const share = await verifiedShare(token, input.passphrase);
  if (!share.allowComment) throw new ForbiddenError("Comments are disabled for this review link.");
  const resource = await shareVersion(share);
  if (input.fileVersionId && input.fileVersionId !== resource.fileVersion.id) {
    throw new NotFoundError();
  }
  const guestUserId = await ensureGuestUser(share, resource.deliverable, input.guestName);
  if (input.parentId) {
    const [parent] = await db
      .select()
      .from(comments)
      .where(
        and(
          eq(comments.id, input.parentId),
          eq(comments.deliverableId, resource.deliverable.id),
          eq(comments.visibility, "CLIENT_VISIBLE"),
        ),
      )
      .limit(1);
    if (!parent) throw new NotFoundError();
  }
  const [comment] = await db
    .insert(comments)
    .values({
      agencyId: resource.deliverable.agencyId,
      deliverableId: resource.deliverable.id,
      fileVersionId: resource.fileVersion.id,
      parentId: input.parentId,
      userId: guestUserId,
      message: input.message,
      visibility: "CLIENT_VISIBLE",
      anchorType: input.anchorType,
      anchor: normalizedAnchor(resource.fileVersion, input.anchorType, input.anchor),
    })
    .returning();
  if (!comment) throw new Error("Guest comment insert failed.");
  if (input.attachmentIds.length) {
    const rows = await db
      .select()
      .from(attachments)
      .where(inArray(attachments.id, input.attachmentIds));
    if (
      rows.length !== new Set(input.attachmentIds).size ||
      rows.some(
        (attachment) =>
          attachment.agencyId !== resource.deliverable.agencyId ||
          attachment.ownerUserId !== guestUserId ||
          attachment.status !== "READY" ||
          attachment.expiresAt <= new Date(),
      )
    ) {
      throw new NotFoundError();
    }
    await db
      .update(attachments)
      .set({
        status: "CLAIMED",
        parentType: "COMMENT",
        parentId: comment.id,
        claimedAt: new Date(),
      })
      .where(inArray(attachments.id, input.attachmentIds));
  }
  await db.insert(outbox).values({
    agencyId: resource.deliverable.agencyId,
    eventType: "COMMENT_ADDED",
    payload: {
      commentId: comment.id,
      deliverableId: resource.deliverable.id,
      fileVersionId: resource.fileVersion.id,
      shareId: share.id,
      actorUserId: guestUserId,
    },
  });
  return comment;
}

export async function initiateGuestAttachment(
  token: string,
  input: {
    passphrase?: string;
    guestName: string;
    fileName: string;
    fileType: string;
    fileSizeBytes: number;
  },
) {
  const share = await verifiedShare(token, input.passphrase);
  if (!share.allowComment) throw new ForbiddenError("Comments are disabled for this review link.");
  const resource = await shareVersion(share);
  const guestUserId = await ensureGuestUser(share, resource.deliverable, input.guestName);
  const safeName = input.fileName.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
  const key = `${share.agencyId}/guest-attachments/${share.id}/${crypto.randomUUID()}-${safeName}`;
  const upload = await objectStorage.initiate(key, input.fileType);
  const [attachment] = await db
    .insert(attachments)
    .values({
      agencyId: share.agencyId,
      objectKey: upload.key,
      uploadId: upload.uploadId,
      fileName: input.fileName,
      fileType: input.fileType,
      fileSizeBytes: BigInt(input.fileSizeBytes),
      ownerUserId: guestUserId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    })
    .returning();
  if (!attachment) throw new Error("Attachment insert failed.");
  return {
    attachmentId: attachment.id,
    partSizeBytes: 10 * 1024 * 1024,
    partCount: Math.ceil(input.fileSizeBytes / (10 * 1024 * 1024)),
  };
}

async function guestPendingAttachment(
  token: string,
  attachmentId: string,
  passphrase: string | undefined,
  guestName: string,
) {
  const share = await verifiedShare(token, passphrase);
  const resource = await shareVersion(share);
  const guestUserId = await ensureGuestUser(share, resource.deliverable, guestName);
  const [attachment] = await db
    .select()
    .from(attachments)
    .where(
      and(
        eq(attachments.id, attachmentId),
        eq(attachments.ownerUserId, guestUserId),
        eq(attachments.agencyId, share.agencyId),
      ),
    )
    .limit(1);
  if (
    !attachment ||
    attachment.expiresAt <= new Date() ||
    !["PENDING", "READY"].includes(attachment.status)
  ) {
    throw new NotFoundError();
  }
  return attachment;
}

export async function signGuestAttachmentParts(
  token: string,
  attachmentId: string,
  passphrase: string | undefined,
  guestName: string,
  partNumbers: number[],
) {
  const attachment = await guestPendingAttachment(token, attachmentId, passphrase, guestName);
  return {
    parts: await Promise.all(
      partNumbers.map(async (partNumber) => ({
        partNumber,
        url: await objectStorage.signPart(
          { uploadId: attachment.uploadId, key: attachment.objectKey },
          partNumber,
        ),
      })),
    ),
  };
}

export async function completeGuestAttachment(
  token: string,
  attachmentId: string,
  passphrase: string | undefined,
  guestName: string,
  parts: Array<{ partNumber: number; eTag: string }>,
) {
  const attachment = await guestPendingAttachment(token, attachmentId, passphrase, guestName);
  await objectStorage.complete({ uploadId: attachment.uploadId, key: attachment.objectKey }, parts);
  const [updated] = await db
    .update(attachments)
    .set({ status: "READY" })
    .where(eq(attachments.id, attachment.id))
    .returning({ id: attachments.id, fileName: attachments.fileName });
  return updated;
}

export async function downloadGuestAttachment(
  token: string,
  attachmentId: string,
  passphrase?: string,
) {
  const share = await verifiedShare(token, passphrase);
  const resource = await shareVersion(share);
  const [attachment] = await db
    .select()
    .from(attachments)
    .where(
      and(
        eq(attachments.id, attachmentId),
        eq(attachments.agencyId, share.agencyId),
        eq(attachments.parentType, "COMMENT"),
      ),
    )
    .limit(1);
  if (!attachment?.parentId) throw new NotFoundError();
  const [comment] = await db
    .select()
    .from(comments)
    .where(
      and(
        eq(comments.id, attachment.parentId),
        eq(comments.deliverableId, resource.deliverable.id),
        eq(comments.visibility, "CLIENT_VISIBLE"),
      ),
    )
    .limit(1);
  if (!comment) throw new NotFoundError();
  return { url: await objectStorage.signDownload(attachment.objectKey) };
}

export async function reactToGuestComment(
  token: string,
  commentId: string,
  input: { passphrase?: string; guestName: string; emoji: string; remove: boolean },
) {
  const share = await verifiedShare(token, input.passphrase);
  const resource = await shareVersion(share);
  const guestUserId = await ensureGuestUser(share, resource.deliverable, input.guestName);
  if (!/^\p{Extended_Pictographic}$/u.test(input.emoji)) throw new ForbiddenError("Use one emoji.");
  const [comment] = await db
    .select()
    .from(comments)
    .where(
      and(
        eq(comments.id, commentId),
        eq(comments.deliverableId, resource.deliverable.id),
        eq(comments.visibility, "CLIENT_VISIBLE"),
      ),
    )
    .limit(1);
  if (!comment) throw new NotFoundError();
  if (input.remove) {
    await db
      .delete(commentReactions)
      .where(
        and(
          eq(commentReactions.commentId, comment.id),
          eq(commentReactions.userId, guestUserId),
          eq(commentReactions.emoji, input.emoji),
        ),
      );
  } else {
    await db
      .insert(commentReactions)
      .values({
        agencyId: share.agencyId,
        commentId: comment.id,
        userId: guestUserId,
        emoji: input.emoji,
      })
      .onConflictDoNothing();
  }
  return { reacted: !input.remove };
}

export async function resolveGuestComment(
  token: string,
  commentId: string,
  passphrase: string | undefined,
  guestName: string,
  reopen = false,
) {
  const share = await verifiedShare(token, passphrase);
  if (!share.allowComment) throw new ForbiddenError("Comments are disabled for this review link.");
  const resource = await shareVersion(share);
  const guestUserId = await ensureGuestUser(share, resource.deliverable, guestName);
  const [comment] = await db
    .update(comments)
    .set({
      resolvedAt: reopen ? null : new Date(),
      resolvedByUserId: reopen ? null : guestUserId,
    })
    .where(
      and(
        eq(comments.id, commentId),
        eq(comments.deliverableId, resource.deliverable.id),
        eq(comments.visibility, "CLIENT_VISIBLE"),
      ),
    )
    .returning();
  if (!comment) throw new NotFoundError();
  return comment;
}
