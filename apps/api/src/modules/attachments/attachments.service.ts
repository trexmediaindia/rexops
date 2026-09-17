import type { Principal } from "@rexops/core";
import { assertWritablePrincipal, ForbiddenError, NotFoundError } from "@rexops/core";
import { attachments, comments, db, messages } from "@rexops/db";
import { and, eq } from "drizzle-orm";
import { assertChannelAccess } from "../collaboration/collaboration.service";
import { getDeliverable } from "../deliverables/deliverables.service";
import { objectStorage } from "../file-versions/storage";

export async function initiateAttachment(
  principal: Principal,
  input: { fileName: string; fileType: string; fileSizeBytes: number },
) {
  assertWritablePrincipal(principal);
  if (!principal.agencyId) throw new ForbiddenError();
  const safeName = input.fileName.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
  const key = `${principal.agencyId}/attachments/${crypto.randomUUID()}-${safeName}`;
  const upload = await objectStorage.initiate(key, input.fileType);
  const [attachment] = await db
    .insert(attachments)
    .values({
      agencyId: principal.agencyId,
      objectKey: upload.key,
      uploadId: upload.uploadId,
      fileName: input.fileName,
      fileType: input.fileType,
      fileSizeBytes: BigInt(input.fileSizeBytes),
      ownerUserId: principal.userId,
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

async function pendingAttachment(principal: Principal, id: string) {
  const [attachment] = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.id, id), eq(attachments.ownerUserId, principal.userId)))
    .limit(1);
  if (
    !attachment ||
    attachment.agencyId !== principal.agencyId ||
    attachment.expiresAt <= new Date() ||
    !["PENDING", "READY"].includes(attachment.status)
  ) {
    throw new NotFoundError();
  }
  return attachment;
}

export async function signAttachmentParts(principal: Principal, id: string, partNumbers: number[]) {
  const attachment = await pendingAttachment(principal, id);
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

export async function completeAttachment(
  principal: Principal,
  id: string,
  parts: Array<{ partNumber: number; eTag: string }>,
) {
  const attachment = await pendingAttachment(principal, id);
  await objectStorage.complete({ uploadId: attachment.uploadId, key: attachment.objectKey }, parts);
  const [updated] = await db
    .update(attachments)
    .set({ status: "READY" })
    .where(eq(attachments.id, attachment.id))
    .returning();
  return updated;
}

export async function attachmentDownload(principal: Principal, id: string) {
  const [attachment] = await db.select().from(attachments).where(eq(attachments.id, id)).limit(1);
  if (attachment?.status !== "CLAIMED" || attachment.agencyId !== principal.agencyId) {
    throw new NotFoundError();
  }
  if (attachment.parentType === "COMMENT") {
    const [comment] = await db
      .select()
      .from(comments)
      .where(eq(comments.id, attachment.parentId ?? ""))
      .limit(1);
    if (!comment) throw new NotFoundError();
    await getDeliverable(principal, comment.deliverableId);
    if (principal.role.startsWith("CLIENT_") && comment.visibility === "INTERNAL")
      throw new NotFoundError();
  } else if (attachment.parentType === "MESSAGE") {
    const [message] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, attachment.parentId ?? ""))
      .limit(1);
    if (!message) throw new NotFoundError();
    await assertChannelAccess(principal, message.channelId);
  } else {
    throw new NotFoundError();
  }
  return { url: await objectStorage.signDownload(attachment.objectKey) };
}
