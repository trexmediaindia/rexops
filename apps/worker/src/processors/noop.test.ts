import { describe, expect, test } from "bun:test";
import { processNoop } from "./noop";

describe("noop processor", () => {
  test("round-trips the outbox event id", async () => {
    const result = await processNoop({
      data: {
        eventId: "evt-1",
        eventType: "NOOP",
        payload: {},
      },
    } as never);
    expect(result).toEqual({ consumed: true, eventId: "evt-1", eventType: "NOOP" });
  });
});
