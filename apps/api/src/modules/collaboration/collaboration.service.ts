import type { Principal } from "@rexops/core";
import { assertWritablePrincipal, can, ForbiddenError, NotFoundError } from "@rexops/core";
import {
  activityEvents,
  attachments,
  channelReads,
  channels,
  db,
  fileVersions,
  messages,
  outbox,
  users,
} from "@rexops/db";
import type { CreateChannelInput, CreateMessageInput } from "@rexops/validators";
import { and, asc, desc, eq, gt, ilike, inArray, isNull, lt, or } from "drizzle-orm";
import { getDeliverable } from "../deliverables/deliverables.service";
import { getProject } from "../projects/projects.service";

async function assertScopeAccess(
  principal: Principal,
  scopeType: "PROJECT" | "DELIVERABLE" | "DM",
  scopeId: string | null,
) {
  if (!scopeId) throw new NotFoundError();
  if (scopeType === "PROJECT") return getProject(principal, scopeId);
  if (scopeType === "DELIVERABLE") return getDeliverable(principal, scopeId);
  if (!scopeId.split(":").includes(principal.userId)) throw new NotFoundError();
  return { id: scopeId };
}

async function accessibleChannel(principal: Principal, channelId: string) {
  const [channel] = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1);
  if (!channel) throw new NotFoundError();
  if (principal.role !== "SUPER_ADMIN" && channel.agencyId !== principal.agencyId) {
    throw new NotFoundError();
  }
  await assertScopeAccess(principal, channel.scopeType, channel.scopeId);
  return channel;
}

export async function assertChannelAccess(principal: Principal, channelId: string) {
  await accessibleChannel(principal, channelId);
}

export async function listActivity(
  principal: Principal,
  deliverableId: string,
  input: { cursor?: string; limit?: number } = {},
) {
  await getDeliverable(principal, deliverableId);
  const filters = [
    eq(activityEvents.subjectType, "DELIVERABLE"),
    eq(activityEvents.subjectId, deliverableId),
  ];
  if (principal.role.startsWith("CLIENT_")) {
    filters.push(eq(activityEvents.visibility, "CLIENT_VISIBLE"));
  }
  if (input.cursor) filters.push(lt(activityEvents.createdAt, new Date(input.cursor)));
  const limit = Math.min(input.limit ?? 50, 100);
  const rows = await db
    .select({
      event: activityEvents,
      actorName: users.name,
    })
    .from(activityEvents)
    .leftJoin(users, eq(users.id, activityEvents.actorUserId))
    .where(and(...filters))
    .orderBy(desc(activityEvents.createdAt))
    .limit(limit + 1);
  return {
    items: rows.slice(0, limit),
    nextCursor: rows.length > limit ? rows[limit - 1]?.event.createdAt.toISOString() : null,
  };
}

export async function listRecentActivity(principal: Principal, requestedLimit = 20) {
  if (!principal.agencyId) return { items: [] };
  const filters = [eq(activityEvents.agencyId, principal.agencyId)];
  if (principal.role.startsWith("CLIENT_")) {
    filters.push(eq(activityEvents.visibility, "CLIENT_VISIBLE"));
  }
  const rows = await db
    .select({ event: activityEvents, actorName: users.name })
    .from(activityEvents)
    .leftJoin(users, eq(users.id, activityEvents.actorUserId))
    .where(and(...filters))
    .orderBy(desc(activityEvents.createdAt))
    .limit(Math.min(Math.max(requestedLimit, 1), 100));
  return { items: rows };
}

export async function listVersionActivity(
  principal: Principal,
  fileVersionId: string,
  input: { cursor?: string; limit?: number } = {},
) {
  const [version] = await db
    .select()
    .from(fileVersions)
    .where(eq(fileVersions.id, fileVersionId))
    .limit(1);
  if (!version) throw new NotFoundError();
  await getDeliverable(principal, version.deliverableId);
  if (principal.role.startsWith("CLIENT_") && version.visibility !== "CLIENT")
    throw new NotFoundError();
  const filters = [
    eq(activityEvents.subjectType, "FILE_VERSION"),
    eq(activityEvents.subjectId, fileVersionId),
  ];
  if (principal.role.startsWith("CLIENT_"))
    filters.push(eq(activityEvents.visibility, "CLIENT_VISIBLE"));
  if (input.cursor) filters.push(lt(activityEvents.createdAt, new Date(input.cursor)));
  const limit = Math.min(input.limit ?? 50, 100);
  const rows = await db
    .select({ event: activityEvents, actorName: users.name })
    .from(activityEvents)
    .leftJoin(users, eq(users.id, activityEvents.actorUserId))
    .where(and(...filters))
    .orderBy(desc(activityEvents.createdAt))
    .limit(limit + 1);
  return {
    items: rows.slice(0, limit),
    nextCursor: rows.length > limit ? rows[limit - 1]?.event.createdAt.toISOString() : null,
  };
}

export async function listChannels(
  principal: Principal,
  input: {
    scopeType?: "PROJECT" | "DELIVERABLE" | "DM";
    scopeId?: string;
    search?: string;
    cursor?: string;
    limit?: number;
  },
) {
  if (!principal.agencyId) return { items: [], nextCursor: null };
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  if (input.scopeType && input.scopeType !== "DM") {
    await assertScopeAccess(principal, input.scopeType, input.scopeId ?? null);
    const rows = await db
      .select()
      .from(channels)
      .where(
        and(
          eq(channels.agencyId, principal.agencyId),
          eq(channels.scopeType, input.scopeType),
          eq(channels.scopeId, input.scopeId ?? ""),
          input.cursor ? gt(channels.createdAt, new Date(input.cursor)) : undefined,
        ),
      )
      .orderBy(asc(channels.createdAt))
      .limit(limit + 1);
    return {
      items: rows.slice(0, limit).map((channel) => ({ ...channel, unreadCount: 0 })),
      nextCursor: rows.length > limit ? rows[limit - 1]?.createdAt.toISOString() : null,
    };
  }
  const rows = await db
    .select()
    .from(channels)
    .where(
      and(
        eq(channels.agencyId, principal.agencyId),
        input.scopeType ? eq(channels.scopeType, input.scopeType) : undefined,
        input.search ? ilike(channels.name, `%${input.search}%`) : undefined,
        input.cursor ? gt(channels.createdAt, new Date(input.cursor)) : undefined,
      ),
    )
    .orderBy(asc(channels.createdAt));
  const visible = [];
  for (const channel of rows) {
    try {
      await assertScopeAccess(principal, channel.scopeType, channel.scopeId);
      visible.push(channel);
    } catch {
      // Hidden scope.
    }
  }
  const reads = visible.length
    ? await db
        .select()
        .from(channelReads)
        .where(
          and(
            eq(channelReads.userId, principal.userId),
            inArray(
              channelReads.channelId,
              visible.map((channel) => channel.id),
            ),
          ),
        )
    : [];
  const page = visible.slice(0, limit);
  const items = await Promise.all(
    page.map(async (channel) => {
      const readAt = reads.find((read) => read.channelId === channel.id)?.readAt;
      const unread = await db
        .select({ id: messages.id })
        .from(messages)
        .where(
          and(
            eq(messages.channelId, channel.id),
            isNull(messages.deletedAt),
            readAt ? gt(messages.createdAt, readAt) : undefined,
          ),
        );
      return {
        ...channel,
        unreadCount: unread.filter((message) => message.id).length,
      };
    }),
  );
  return {
    items,
    nextCursor:
      visible.length > limit ? (page[page.length - 1]?.createdAt.toISOString() ?? null) : null,
  };
}

export async function createChannel(principal: Principal, input: CreateChannelInput) {
  if (!can(principal, "create", "comment") || !principal.agencyId) throw new ForbiddenError();
  assertWritablePrincipal(principal);
  let scopeId = input.scopeId ?? null;
  if (input.scopeType === "DM") {
    if (!scopeId) throw new NotFoundError();
    const [target] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, scopeId), isNull(users.deletedAt)))
      .limit(1);
    if (
      !target ||
      target.agencyId !== principal.agencyId ||
      (principal.role.startsWith("CLIENT_") && target.clientId !== principal.clientId)
    ) {
      throw new NotFoundError();
    }
    scopeId = [principal.userId, target.id].sort().join(":");
  } else {
    await assertScopeAccess(principal, input.scopeType, scopeId);
  }
  const [existing] = await db
    .select()
    .from(channels)
    .where(
      and(
        eq(channels.agencyId, principal.agencyId),
        eq(channels.scopeType, input.scopeType),
        eq(channels.scopeId, scopeId ?? ""),
      ),
    )
    .limit(1);
  if (existing) return existing;
  const [channel] = await db
    .insert(channels)
    .values({
      agencyId: principal.agencyId,
      scopeType: input.scopeType,
      scopeId,
      name: input.name,
    })
    .returning();
  if (!channel) throw new Error("Channel insert failed.");
  return channel;
}

export async function listMessages(principal: Principal, channelId: string) {
  return listMessagesPage(principal, channelId, {});
}

export async function listMessagesPage(
  principal: Principal,
  channelId: string,
  input: { cursor?: string; limit?: number; search?: string },
) {
  await accessibleChannel(principal, channelId);
  const filters = [eq(messages.channelId, channelId), isNull(messages.deletedAt)];
  if (input.cursor) filters.push(lt(messages.createdAt, new Date(input.cursor)));
  if (input.search) filters.push(ilike(messages.body, `%${input.search}%`));
  const limit = Math.min(input.limit ?? 50, 100);
  const rows = await db
    .select({
      message: messages,
      authorName: users.name,
    })
    .from(messages)
    .innerJoin(users, eq(users.id, messages.userId))
    .where(and(...filters))
    .orderBy(desc(messages.createdAt))
    .limit(limit + 1);
  const items = rows
    .slice(0, limit)
    .reverse()
    .map((row) => ({ ...row.message, authorName: row.authorName }));
  const attachmentRows = items.length
    ? await db
        .select({
          id: attachments.id,
          parentId: attachments.parentId,
          fileName: attachments.fileName,
          fileType: attachments.fileType,
          fileSizeBytes: attachments.fileSizeBytes,
        })
        .from(attachments)
        .where(
          and(
            eq(attachments.parentType, "MESSAGE"),
            inArray(
              attachments.parentId,
              items.map((item) => item.id),
            ),
          ),
        )
    : [];
  return {
    items: items.map((item) => ({
      ...item,
      attachmentRows: attachmentRows
        .filter((attachment) => attachment.parentId === item.id)
        .map((attachment) => ({
          ...attachment,
          fileSizeBytes: attachment.fileSizeBytes.toString(),
        })),
    })),
    nextCursor: rows.length > limit ? rows[limit - 1]?.message.createdAt.toISOString() : null,
  };
}

export async function createMessage(
  principal: Principal,
  channelId: string,
  input: CreateMessageInput,
) {
  if (!can(principal, "create", "comment")) throw new ForbiddenError();
  assertWritablePrincipal(principal);
  const channel = await accessibleChannel(principal, channelId);
  if (input.parentId) {
    const [parent] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.id, input.parentId), eq(messages.channelId, channel.id)))
      .limit(1);
    if (!parent) throw new NotFoundError();
  }
  if (input.refVersionIds.length) {
    const versions = await db
      .select()
      .from(fileVersions)
      .where(
        and(
          inArray(fileVersions.id, input.refVersionIds),
          eq(fileVersions.agencyId, channel.agencyId),
          isNull(fileVersions.deletedAt),
        ),
      );
    if (
      versions.length !== new Set(input.refVersionIds).size ||
      (principal.role.startsWith("CLIENT_") &&
        versions.some((version) => version.visibility !== "CLIENT"))
    ) {
      throw new NotFoundError();
    }
  }
  if (input.mentionUserIds.length) {
    const mentioned = await db
      .select()
      .from(users)
      .where(and(inArray(users.id, input.mentionUserIds), isNull(users.deletedAt)));
    if (
      mentioned.length !== new Set(input.mentionUserIds).size ||
      mentioned.some(
        (user) =>
          user.agencyId !== channel.agencyId ||
          (principal.role.startsWith("CLIENT_") && user.clientId !== principal.clientId),
      )
    ) {
      throw new NotFoundError();
    }
  }
  const hashtags = [
    ...new Set(
      input.body.match(/#[\p{L}\p{N}_-]+/gu)?.map((tag) => tag.slice(1).toLowerCase()) ?? [],
    ),
  ];
  const [message] = await db
    .insert(messages)
    .values({
      agencyId: channel.agencyId,
      channelId,
      userId: principal.userId,
      body: input.body,
      parentId: input.parentId,
      refVersionIds: input.refVersionIds,
      mentionUserIds: input.mentionUserIds,
      hashtags,
    })
    .returning();
  if (!message) throw new Error("Message insert failed.");
  if (input.attachmentIds.length) {
    const rows = await db
      .select()
      .from(attachments)
      .where(inArray(attachments.id, input.attachmentIds));
    if (
      rows.length !== new Set(input.attachmentIds).size ||
      rows.some(
        (attachment) =>
          attachment.agencyId !== channel.agencyId ||
          attachment.ownerUserId !== principal.userId ||
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
        parentType: "MESSAGE",
        parentId: message.id,
        claimedAt: new Date(),
      })
      .where(inArray(attachments.id, input.attachmentIds));
  }
  if (input.mentionUserIds.length) {
    await db.insert(outbox).values(
      input.mentionUserIds.map((mentionedUserId) => ({
        agencyId: channel.agencyId,
        eventType: "MENTION",
        payload: {
          messageId: message.id,
          channelId,
          mentionedUserId,
          actorUserId: principal.userId,
        },
      })),
    );
  }
  return message;
}

export async function markChannelRead(principal: Principal, channelId: string, messageId?: string) {
  assertWritablePrincipal(principal);
  const channel = await accessibleChannel(principal, channelId);
  if (messageId) {
    const [message] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.id, messageId), eq(messages.channelId, channel.id)))
      .limit(1);
    if (!message) throw new NotFoundError();
  }
  const [row] = await db
    .insert(channelReads)
    .values({
      agencyId: channel.agencyId,
      channelId,
      userId: principal.userId,
      lastReadMessageId: messageId,
      readAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [channelReads.channelId, channelReads.userId],
      set: { lastReadMessageId: messageId, readAt: new Date() },
    })
    .returning();
  return row;
}

export async function listChatUsers(principal: Principal, search?: string) {
  if (!principal.agencyId) return [];
  const filters = [
    eq(users.agencyId, principal.agencyId),
    isNull(users.deletedAt),
    search ? or(ilike(users.name, `%${search}%`), ilike(users.email, `%${search}%`)) : undefined,
  ];
  if (principal.role.startsWith("CLIENT_"))
    filters.push(eq(users.clientId, principal.clientId ?? ""));
  return db
    .select({ id: users.id, name: users.name, image: users.image, role: users.role })
    .from(users)
    .where(and(...filters))
    .orderBy(asc(users.name))
    .limit(50);
}
