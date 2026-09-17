import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

describe("service worker push handling", () => {
  test("displays push payloads and routes notification clicks", async () => {
    const source = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
    expect(source).toContain('addEventListener("push"');
    expect(source).toContain("showNotification");
    expect(source).toContain('addEventListener("notificationclick"');
    expect(source).toContain("openWindow");
  });
});
