import { afterEach, describe, expect, test } from "bun:test";
import { db, sessions } from "@rexops/db";
import { eq } from "drizzle-orm";
import { apiRequest, responseJson } from "../../test/helpers";

afterEach(async () => {
  await db.delete(sessions).where(eq(sessions.userId, "user_manas"));
});

describe("Better Auth email/password integration", () => {
  test("canonical owner can sign in and receives a secure session cookie", async () => {
    const response = await apiRequest("/api/auth/sign-in/email", {
      method: "POST",
      body: { email: "manas@trex.test", password: "rexops-demo" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("better-auth.session_token=");
    const body = await responseJson(response);
    expect((body.user as { role: string }).role).toBe("AGENCY_OWNER");
  });

  test("wrong credentials are rejected", async () => {
    const response = await apiRequest("/api/auth/sign-in/email", {
      method: "POST",
      body: { email: "manas@trex.test", password: "wrong-password" },
    });
    expect(response.status).toBe(401);
  });
});
