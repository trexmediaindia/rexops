import type { Principal } from "@rexops/core";
import { assertWritablePrincipal, ForbiddenError, NotFoundError } from "@rexops/core";
import { db, notifications, pushSubscriptions } from "@rexops/db";
import { and, desc, eq, lt, or } from "drizzle-orm";

function visibleFilter(principal: Principal) {
  const recipient = or(
    eq(notifications.recipientUserId, principal.userId),
    eq(notifications.recipientRole, principal.role),
  );
  if (principal.role === "SUPER_ADMIN") return recipient;
  if (!principal.agencyId) return eq(notifications.recipientUserId, principal.userId);
  return and(eq(notifications.agencyId, principal.agencyId), recipient);
}

export async function listNotifications(
  principal: Principal,
  input: { unreadOnly?: boolean; cursor?: string; limit?: number } = {},
) {
  const filters = [visibleFilter(principal)];
  if (input.unreadOnly) filters.push(eq(notifications.isRead, false));
  if (input.cursor) filters.push(lt(notifications.createdAt, new Date(input.cursor)));
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const rows = await db
    .select()
    .from(notifications)
    .where(and(...filters))
    .orderBy(desc(notifications.createdAt))
    .limit(limit + 1);
  return {
    items: rows.slice(0, limit),
    nextCursor: rows.length > limit ? rows[limit - 1]?.createdAt.toISOString() : null,
  };
}

export async function markNotificationRead(principal: Principal, id: string) {
  assertWritablePrincipal(principal);
  const [updated] = await db
    .update(notifications)
    .set({ isRead: true, readAt: new Date() })
    .where(and(eq(notifications.id, id), visibleFilter(principal)))
    .returning();
  if (!updated) throw new NotFoundError();
  return updated;
}

export async function markAllNotificationsRead(principal: Principal) {
  assertWritablePrincipal(principal);
  const updated = await db
    .update(notifications)
    .set({ isRead: true, readAt: new Date() })
    .where(and(visibleFilter(principal), eq(notifications.isRead, false)))
    .returning({ id: notifications.id });
  return { updated: updated.length };
}

export async function savePushSubscription(
  principal: Principal,
  input: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
    userAgent?: string;
  },
) {
  assertWritablePrincipal(principal);
  if (!principal.agencyId && principal.role !== "SUPER_ADMIN") throw new ForbiddenError();
  const [subscription] = await db
    .insert(pushSubscriptions)
    .values({
      agencyId: principal.agencyId,
      userId: principal.userId,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent: input.userAgent,
      lastUsedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        agencyId: principal.agencyId,
        userId: principal.userId,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        userAgent: input.userAgent,
        lastUsedAt: new Date(),
      },
    })
    .returning({ id: pushSubscriptions.id });
  return subscription;
}

export async function removePushSubscription(principal: Principal, endpoint: string) {
  assertWritablePrincipal(principal);
  const removed = await db
    .delete(pushSubscriptions)
    .where(
      and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, principal.userId)),
    )
    .returning({ id: pushSubscriptions.id });
  return { removed: removed.length > 0 };
}
