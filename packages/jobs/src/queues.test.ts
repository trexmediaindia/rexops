import { describe, expect, test } from "bun:test";
import type { MediaJobPayload, NoopJobPayload } from "./payloads";

describe("typed job seam", () => {
  test("supports an idempotent event id payload", () => {
    const payload: NoopJobPayload = {
      eventId: "event-1",
      eventType: "DELIVERABLE_CREATED",
      payload: { deliverableId: "deliverable-1" },
    };
    expect(payload.eventId).toBe("event-1");
  });

  test("keeps media jobs tenant and object scoped", () => {
    const payload: MediaJobPayload = {
      eventId: "event-2",
      agencyId: "agency-1",
      fileVersionId: "version-1",
      sourceKey: "agency-1/deliverable-1/source.mov",
    };
    expect(payload.sourceKey.startsWith(`${payload.agencyId}/`)).toBe(true);
  });
});
