import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { activityEvents, channels, db, fileVersions, messages } from "@rexops/db";
import { eq } from "drizzle-orm";
import { apiRequest, ensureTestFixtures, principals, responseJson } from "../../test/helpers";

const channelName = "review-test-channel";
let channelId = "";
let messageId = "";

beforeAll(async () => {
  await ensureTestFixtures();
  await db
    .insert(activityEvents)
    .values({
      id: "activity_collab_test",
      agencyId: "agency_trex",
      subjectType: "DELIVERABLE",
      subjectId: "deliverable_beach_vibe",
      type: "COMMENT",
      actorUserId: "user_manas",
      summary: "Test activity",
    })
    .onConflictDoNothing();
});

afterAll(async () => {
  if (channelId) await db.delete(messages).where(eq(messages.channelId, channelId));
  if (channelId) await db.delete(channels).where(eq(channels.id, channelId));
  await db.delete(activityEvents).where(eq(activityEvents.id, "activity_collab_test"));
});

describe("collaboration routes", () => {
  test("creates a scoped channel with version-tagged threaded messages", async () => {
    const created = await apiRequest("/api/collaboration/channels", {
      method: "POST",
      principal: principals.owner,
      body: {
        scopeType: "DELIVERABLE",
        scopeId: "deliverable_beach_vibe",
        name: channelName,
      },
    });
    expect(created.status).toBe(200);
    channelId = String((await responseJson(created)).id);
    await db.delete(messages).where(eq(messages.channelId, channelId));

    const [version] = await db
      .select({ id: fileVersions.id })
      .from(fileVersions)
      .where(eq(fileVersions.deliverableId, "deliverable_beach_vibe"))
      .limit(1);
    const posted = await apiRequest(`/api/collaboration/channels/${channelId}/messages`, {
      method: "POST",
      principal: principals.owner,
      body: {
        body: "Review this version in context",
        refVersionIds: version ? [version.id] : [],
      },
    });
    expect(posted.status).toBe(200);
    messageId = String((await responseJson(posted)).id);

    const reply = await apiRequest(`/api/collaboration/channels/${channelId}/messages`, {
      method: "POST",
      principal: principals.editor,
      body: { body: "On it", parentId: messageId },
    });
    expect(reply.status).toBe(200);
    const replyId = String((await responseJson(reply)).id);

    const listed = await apiRequest(`/api/collaboration/channels/${channelId}/messages`, {
      principal: principals.owner,
    });
    expect(((await listed.json()) as { items: unknown[] }).items).toHaveLength(2);
    await db.delete(messages).where(eq(messages.id, replyId));
  });

  test("returns activity and hides cross-tenant channel access", async () => {
    const activity = await apiRequest(
      "/api/collaboration/activity/deliverable/deliverable_beach_vibe",
      { principal: principals.owner },
    );
    expect(
      ((await activity.json()) as { items: Array<{ event: { id: string } }> }).items.some(
        (row) => row.event.id === "activity_collab_test",
      ),
    ).toBe(true);

    const guessed = await apiRequest(`/api/collaboration/channels/${channelId}/messages`, {
      principal: principals.outsider,
    });
    expect(guessed.status).toBe(404);
  });
});
