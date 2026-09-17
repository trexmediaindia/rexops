import { describe, expect, test } from "bun:test";
import {
  batches,
  concurrentMap,
  MULTIPART_PART_SIZE,
  partBounds,
  partNumbersForSize,
} from "./multipart-upload";

describe("multipart upload client", () => {
  test("splits large files into deterministic 10 MiB parts", () => {
    expect(partNumbersForSize(MULTIPART_PART_SIZE * 2 + 1)).toEqual([1, 2, 3]);
    expect(partBounds(3, MULTIPART_PART_SIZE * 2 + 1)).toEqual({
      start: MULTIPART_PART_SIZE * 2,
      end: MULTIPART_PART_SIZE * 2 + 1,
    });
  });

  test("batches signing requests under the API limit", () => {
    expect(
      batches(partNumbersForSize(MULTIPART_PART_SIZE * 205), 100).map((part) => part.length),
    ).toEqual([100, 100, 5]);
  });

  test("preserves input order while limiting concurrent work", async () => {
    let active = 0;
    let peak = 0;
    const output = await concurrentMap([1, 2, 3, 4], 2, async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await Bun.sleep(2);
      active -= 1;
      return value * 2;
    });
    expect(output).toEqual([2, 4, 6, 8]);
    expect(peak).toBe(2);
  });
});
