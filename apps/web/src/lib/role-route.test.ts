import { describe, expect, test } from "bun:test";
import { routeForRole } from "./role-route";

describe("role-routed shells", () => {
  test("routes every principal family to its opinionated surface", () => {
    expect(routeForRole("SUPER_ADMIN")).toBe("/admin/agencies");
    expect(routeForRole("CLIENT_OWNER")).toBe("/client/home");
    expect(routeForRole("CLIENT_MEMBER")).toBe("/client/home");
    expect(routeForRole("AGENCY_OWNER")).toBe("/agency/dashboard");
    expect(routeForRole("AGENCY_ADMIN")).toBe("/agency/dashboard");
    expect(routeForRole("AGENCY_MEMBER")).toBe("/agency/dashboard");
  });
});
