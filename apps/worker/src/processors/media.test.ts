import { describe, expect, test } from "bun:test";
import { mediaPlanForType, spriteGeometry } from "./media";

describe("media processor planning", () => {
  test("builds bounded video, image, and waveform previews", () => {
    expect(mediaPlanForType("video/quicktime")?.extension).toBe(".mp4");
    expect(mediaPlanForType("image/png")?.extension).toBe(".jpg");
    expect(mediaPlanForType("audio/wav")?.extension).toBe(".png");
  });

  test("does not send unsupported source formats to ffmpeg", () => {
    expect(mediaPlanForType("application/x-photoshop")).toBeNull();
  });

  test("passes paths as arguments rather than interpolating a shell command", () => {
    const plan = mediaPlanForType("video/mp4");
    expect(plan?.arguments("/tmp/source with spaces.mov", "/tmp/output.mp4")).toContain(
      "/tmp/source with spaces.mov",
    );
  });

  test("caps sprite generation near sixty cells with bounded intervals", () => {
    expect(spriteGeometry(3_000)).toEqual({
      intervalMs: 1000,
      columns: 3,
      rows: 1,
      cellWidth: 240,
      cellHeight: 135,
    });
    const long = spriteGeometry(10 * 60 * 1000);
    expect(long.intervalMs).toBe(5000);
    expect(long.columns).toBe(10);
    expect(long.rows).toBe(12);
  });
});
