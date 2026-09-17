import { describe, expect, test } from "bun:test";
import { spriteCellIndex } from "./scrub-preview";

describe("sprite hover preview", () => {
  test("maps time to a bounded sprite cell", () => {
    expect(spriteCellIndex(0, 2000, 10, 6)).toBe(0);
    expect(spriteCellIndex(4.1, 2000, 10, 6)).toBe(2);
    expect(spriteCellIndex(999, 2000, 10, 6)).toBe(59);
  });
});
