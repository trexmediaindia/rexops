import { describe, expect, test } from "bun:test";
import { mediaPayloadForEvent, notifyPayloadForEvent } from "./relay";

const baseEvent = {
  id: "event-1",
  agencyId: "agency-1",
  eventType: "VERSION_UPLOADED",
  payload: {
    fileVersionId: "version-1",
    objectKey: "agency-1/deliverable-1/file.mov",
  },
  status: "PENDING" as const,
  attempts: 0,
  availableAt: new Date(),
  createdAt: new Date(),
  sentAt: null,
};

describe("outbox routing", () => {
  test("routes uploaded objects to the media queue", () => {
    expect(mediaPayloadForEvent(baseEvent)).toEqual({
      eventId: "event-1",
      agencyId: "agency-1",
      fileVersionId: "version-1",
      sourceKey: "agency-1/deliverable-1/file.mov",
    });
  });

  test("keeps external links and unrelated events on the generic queue", () => {
    expect(
      mediaPayloadForEvent({
        ...baseEvent,
        payload: { fileVersionId: "version-1", objectKey: undefined },
      }),
    ).toBeNull();
    expect(mediaPayloadForEvent({ ...baseEvent, eventType: "DELIVERABLE_CREATED" })).toBeNull();
    expect(
      mediaPayloadForEvent({
        ...baseEvent,
        payload: { ...baseEvent.payload, isSource: true },
      }),
    ).toBeNull();
  });

  test("routes review events to notification fan-out", () => {
    expect(
      notifyPayloadForEvent({
        ...baseEvent,
        eventType: "APPROVED",
      }),
    ).toMatchObject({
      eventId: "event-1",
      agencyId: "agency-1",
      eventType: "APPROVED",
    });
    expect(notifyPayloadForEvent(baseEvent)).toMatchObject({
      eventType: "VERSION_UPLOADED",
    });
  });
});
