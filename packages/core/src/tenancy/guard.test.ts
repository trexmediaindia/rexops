import { describe, expect, test } from "bun:test";
import type { PermissionFlags } from "@rexops/config";
import {
  assertClientRecordAccess,
  assertTenantAccess,
  assertWritablePrincipal,
  can,
  clientRecordPredicate,
  visibleComments,
  visibleVersions,
} from "../index";
import type { Principal } from "./types";

const noPermissions: PermissionFlags = {
  canApprove: false,
  canInviteClients: false,
  canManageTeam: false,
  canUploadFinal: false,
  canViewAllClients: false,
  canManageAutomations: false,
};

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    userId: "user-a",
    role: "AGENCY_MEMBER",
    specialty: "EDITOR",
    agencyId: "agency-a",
    clientId: null,
    permissions: noPermissions,
    ...overrides,
  };
}

describe("tenant guard", () => {
  test("allows the same agency and hides cross-tenant ids as 404", () => {
    expect(() => assertTenantAccess(principal(), { agencyId: "agency-a" })).not.toThrow();
    expect(() => assertTenantAccess(principal(), { agencyId: "agency-b" })).toThrow(
      "Resource not found.",
    );
  });

  test("super admin crosses tenants", () => {
    expect(() =>
      assertTenantAccess(principal({ role: "SUPER_ADMIN", agencyId: null }), {
        agencyId: "agency-b",
      }),
    ).not.toThrow();
  });

  test("client record rule requires both agency and client", () => {
    const client = principal({
      role: "CLIENT_OWNER",
      clientId: "client-a",
    });
    expect(() =>
      assertClientRecordAccess(client, { agencyId: "agency-a", clientId: "client-a" }),
    ).not.toThrow();
    expect(() =>
      assertClientRecordAccess(client, { agencyId: "agency-a", clientId: "client-b" }),
    ).toThrow("Resource not found.");
    expect(
      [
        { agencyId: "agency-a", clientId: "client-a" },
        { agencyId: "agency-a", clientId: "client-b" },
      ].filter(clientRecordPredicate(client)),
    ).toHaveLength(1);
  });

  test("impersonation blocks writes", () => {
    expect(() => assertWritablePrincipal(principal({ impersonating: true }))).toThrow(
      "Impersonation is read-only.",
    );
  });
});

describe("visibility and RBAC", () => {
  test("client only receives promoted versions and client-visible comments", () => {
    const client = principal({ role: "CLIENT_OWNER", clientId: "client-a" });
    expect(
      visibleVersions(client, [
        { id: "v1", visibility: "INTERNAL" },
        { id: "v2", visibility: "CLIENT" },
      ]),
    ).toEqual([{ id: "v2", visibility: "CLIENT" }]);
    expect(
      visibleComments(client, [
        { id: "c1", visibility: "INTERNAL" },
        { id: "c2", visibility: "CLIENT_VISIBLE" },
      ]),
    ).toEqual([{ id: "c2", visibility: "CLIENT_VISIBLE" }]);
  });

  test("permission flags extend granular actions", () => {
    const member = principal({ permissions: { ...noPermissions, canApprove: true } });
    expect(can(member, "approve", "deliverable")).toBe(true);
    expect(can(principal(), "approve", "deliverable")).toBe(false);
  });
});
