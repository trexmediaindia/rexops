import { featureRegistry } from "@rexops/core";
import { db, outbox } from "@rexops/db";
import {
  createMediaQueue,
  createNoopQueue,
  createNotifyQueue,
  type MediaJobPayload,
  type NotifyJobPayload,
} from "@rexops/jobs";
import { and, eq, lte } from "drizzle-orm";

type RelayEvent = typeof outbox.$inferSelect;
let relayQueues:
  | {
      noopQueue: ReturnType<typeof createNoopQueue>;
      mediaQueue: ReturnType<typeof createMediaQueue>;
      notifyQueue: ReturnType<typeof createNotifyQueue>;
    }
  | undefined;

function getRelayQueues() {
  relayQueues ??= {
    noopQueue: createNoopQueue(),
    mediaQueue: createMediaQueue(),
    notifyQueue: createNotifyQueue(),
  };
  return relayQueues;
}

export function mediaPayloadForEvent(event: RelayEvent): MediaJobPayload | null {
  if (event.eventType !== "VERSION_UPLOADED" || !event.agencyId) return null;
  const fileVersionId = event.payload.fileVersionId;
  const sourceKey = event.payload.objectKey;
  if (
    typeof fileVersionId !== "string" ||
    typeof sourceKey !== "string" ||
    event.payload.isSource === true ||
    typeof event.payload.previewUrl === "string"
  ) {
    return null;
  }
  return {
    eventId: event.id,
    agencyId: event.agencyId,
    fileVersionId,
    sourceKey,
  };
}

const projectionEvents = new Set([
  "DELIVERABLE_CREATED",
  "DELIVERABLE_STATUS_CHANGED",
  "VERSION_UPLOADED",
  "COMPANION_PREVIEW_ATTACHED",
  "INTERNAL_REVIEW_REQUESTED",
  "REVIEW_STAGE_ACTIVATED",
  "REVIEW_DECISION_RECORDED",
  "SUBMITTED_TO_CLIENT",
  "REVISION_REQUESTED",
  "APPROVED",
  "DELIVERED",
  "COMMENT_ADDED",
  "MENTION",
  "SHARE_VIEWED",
  "ASSIGNMENT",
]);

export function notifyPayloadForEvent(event: RelayEvent): NotifyJobPayload | null {
  if (!projectionEvents.has(event.eventType)) return null;
  return {
    eventId: event.id,
    agencyId: event.agencyId,
    eventType: event.eventType,
    payload: event.payload,
  };
}

export async function relayPendingOutbox() {
  const { noopQueue, mediaQueue, notifyQueue } = getRelayQueues();
  const features = featureRegistry();
  const events = await db
    .select()
    .from(outbox)
    .where(and(eq(outbox.status, "PENDING"), lte(outbox.availableAt, new Date())))
    .limit(100);

  for (const event of events) {
    try {
      const mediaPayload = mediaPayloadForEvent(event);
      const notifyPayload = notifyPayloadForEvent(event);
      let routed = false;
      if (mediaPayload && features["files.versioning"]) {
        await mediaQueue.add("generate-preview", mediaPayload, { jobId: event.id });
        routed = true;
      }
      if (notifyPayload && features["collaboration.live"]) {
        await notifyQueue.add(event.eventType, notifyPayload, {
          jobId: `${event.id}:projection`,
        });
        routed = true;
      }
      if (!routed) {
        await noopQueue.add(
          event.eventType,
          {
            eventId: event.id,
            eventType: event.eventType,
            payload: event.payload,
          },
          { jobId: event.id },
        );
      }
      await db
        .update(outbox)
        .set({ status: "SENT", sentAt: new Date(), attempts: event.attempts + 1 })
        .where(eq(outbox.id, event.id));
    } catch {
      await db
        .update(outbox)
        .set({ status: "FAILED", attempts: event.attempts + 1 })
        .where(eq(outbox.id, event.id));
    }
  }

  return events.length;
}

export async function closeRelayQueues() {
  if (!relayQueues) return;
  await Promise.all([
    relayQueues.noopQueue.close(),
    relayQueues.mediaQueue.close(),
    relayQueues.notifyQueue.close(),
  ]);
  relayQueues = undefined;
}
