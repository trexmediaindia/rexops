import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { db, notifications, pushSubscriptions } from "@rexops/db";
import { eq } from "drizzle-orm";
import { apiRequest, ensureTestFixtures, principals, responseJson } from "../../test/helpers";

const notificationId = "notification_api_test";
const endpoint = "https://push.example.test/subscription";

beforeAll(async () => {
  await ensureTestFixtures();
  await db
    .insert(notifications)
    .values({
      id: notificationId,
      agencyId: "agency_trex",
      recipientUserId: "user_manas",
      type: "APPROVED",
      title: "Test approval",
      message: "A test notification",
    })
    .onConflictDoNothing();
});

afterAll(async () => {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  await db.delete(notifications).where(eq(notifications.id, notificationId));
});

describe("notification routes", () => {
  test("lists and marks only the recipient notification", async () => {
    const listed = await apiRequest("/api/notifications?unread=true", {
      principal: principals.owner,
    });
    const rows = (await listed.json()) as { items: Array<{ id: string }> };
    expect(rows.items.some((row) => row.id === notificationId)).toBe(true);

    const hidden = await apiRequest("/api/notifications", {
      principal: principals.outsider,
    });
    expect(
      ((await hidden.json()) as { items: Array<{ id: string }> }).items.some(
        (row) => row.id === notificationId,
      ),
    ).toBe(false);

    const marked = await apiRequest(`/api/notifications/${notificationId}/read`, {
      method: "POST",
      principal: principals.owner,
    });
    expect((await responseJson(marked)).isRead).toBe(true);
  });

  test("upserts and removes the authenticated user's push subscription", async () => {
    const saved = await apiRequest("/api/notifications/push-subscriptions", {
      method: "POST",
      principal: principals.owner,
      body: {
        endpoint,
        keys: { p256dh: "public-key", auth: "auth-secret" },
        userAgent: "RexOps test",
      },
    });
    expect(saved.status).toBe(200);

    const removed = await apiRequest("/api/notifications/push-subscriptions", {
      method: "DELETE",
      principal: principals.owner,
      body: { endpoint },
    });
    expect((await responseJson(removed)).removed).toBe(true);
  });

  test("requires authentication and hides another user's id", async () => {
    expect((await apiRequest("/api/notifications")).status).toBe(401);
    const guessed = await apiRequest(`/api/notifications/${notificationId}/read`, {
      method: "POST",
      principal: principals.outsider,
    });
    expect(guessed.status).toBe(404);
  });
});
