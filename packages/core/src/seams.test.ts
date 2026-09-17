import { describe, expect, test } from "bun:test";
import type { PermissionFlags } from "@rexops/config";
import { featureRegistry } from "./features";
import {
  allowedTransitions,
  assertShareActive,
  can,
  compileRule,
  createOutboxPublisher,
  flag,
  isShareActive,
  setFlagProvider,
  stripInternalDeliverableFields,
  validateFieldValue,
  visibleComments,
  visibleVersions,
} from "./index";
import type { Principal } from "./tenancy/types";

const noPermissions: PermissionFlags = {
  canApprove: false,
  canInviteClients: false,
  canManageTeam: false,
  canUploadFinal: false,
  canViewAllClients: false,
  canManageAutomations: false,
};

function member(permissions: Partial<PermissionFlags> = {}): Principal {
  return {
    userId: "member",
    role: "AGENCY_MEMBER",
    specialty: "GENERAL",
    agencyId: "agency",
    clientId: null,
    permissions: { ...noPermissions, ...permissions },
  };
}

describe("custom-field seam", () => {
  test("validates every canonical field family", () => {
    expect(validateFieldValue({ type: "TEXT" }, "campaign")).toBe(true);
    expect(validateFieldValue({ type: "NUMBER" }, 42)).toBe(true);
    expect(validateFieldValue({ type: "RATING" }, Number.NaN)).toBe(false);
    expect(validateFieldValue({ type: "BOOLEAN" }, false)).toBe(true);
    expect(validateFieldValue({ type: "DATE" }, "2026-06-22")).toBe(true);
    expect(validateFieldValue({ type: "SINGLE_SELECT", options: ["Instagram"] }, "Instagram")).toBe(
      true,
    );
    expect(
      validateFieldValue({ type: "MULTI_SELECT", options: ["9:16", "1:1"] }, ["9:16", "1:1"]),
    ).toBe(true);
    expect(validateFieldValue({ type: "SINGLE_SELECT", options: ["A"] }, "B")).toBe(false);
  });
});

describe("automation, flags, and outbox seams", () => {
  test("keeps unreleased blocks closed and requires Liveblocks credentials in production", () => {
    expect(featureRegistry({ NODE_ENV: "production" })).toEqual({
      "files.versioning": false,
      "review.wedge": false,
      "collaboration.live": false,
      "work.views": false,
      automation: false,
      analytics: false,
    });
    expect(
      featureRegistry({
        NODE_ENV: "production",
        FEATURE_COLLABORATION_LIVE: "true",
      })["collaboration.live"],
    ).toBe(false);
    expect(
      featureRegistry({
        NODE_ENV: "production",
        FEATURE_COLLABORATION_LIVE: "true",
        LIVEBLOCKS_SECRET_KEY: "sk_live_test",
      })["collaboration.live"],
    ).toBe(true);
  });
  test("compiles a rule to its event and actions", () => {
    const compiled = compileRule({
      trigger: { event: "DELIVERABLE_CREATED" },
      conditions: {},
      actions: [{ type: "ASSIGN", config: { specialty: "MOTION" } }],
    });
    expect(compiled.eventType).toBe("DELIVERABLE_CREATED");
    expect(compiled.evaluate({})).toBe(true);
    expect(compiled.actions).toHaveLength(1);
  });

  test("delegates feature flags to the configured provider", async () => {
    setFlagProvider({
      getBooleanValue(key, fallback) {
        return key === "review.room" ? true : fallback;
      },
    });
    expect(await flag("review.room")).toBe(true);
    expect(await flag("unknown", false)).toBe(false);
  });

  test("publishes a typed event through the outbox writer", async () => {
    const events: string[] = [];
    const publisher = createOutboxPublisher(async (event) => {
      events.push(event.eventType);
    });
    await publisher.publish({
      agencyId: "agency",
      eventType: "APPROVED",
      payload: { deliverableId: "deliverable" },
    });
    expect(events).toEqual(["APPROVED"]);
  });
});

describe("share, visibility, and RBAC seams", () => {
  test("rejects expired shares", () => {
    const active = {
      expiresAt: new Date("2030-01-01"),
      passphraseHash: null,
      allowComment: true,
      allowDownload: false,
    };
    const expired = { ...active, expiresAt: new Date("2020-01-01") };
    expect(isShareActive(active, new Date("2026-01-01"))).toBe(true);
    expect(isShareActive(expired, new Date("2026-01-01"))).toBe(false);
    expect(() => assertShareActive(expired, new Date("2026-01-01"))).toThrow(
      "This review link has expired.",
    );
  });

  test("agency users retain internal rows while client fields are stripped", () => {
    const agencyMember = member();
    expect(
      visibleVersions(agencyMember, [
        { id: "v1", visibility: "INTERNAL" },
        { id: "v2", visibility: "CLIENT" },
      ]),
    ).toHaveLength(2);
    expect(
      visibleComments(agencyMember, [
        { id: "c1", visibility: "INTERNAL" },
        { id: "c2", visibility: "CLIENT_VISIBLE" },
      ]),
    ).toHaveLength(2);

    const client: Principal = {
      ...agencyMember,
      role: "CLIENT_OWNER",
      clientId: "client",
    };
    expect(stripInternalDeliverableFields(client, { title: "Cut", agencyNote: "private" })).toEqual(
      {
        title: "Cut",
      },
    );
    expect(
      stripInternalDeliverableFields(agencyMember, { title: "Cut", agencyNote: "private" }),
    ).toEqual({ title: "Cut", agencyNote: "private" });
  });

  test("permission flags unlock only their intended actions", () => {
    expect(can(member({ canManageTeam: true }), "invite", "member")).toBe(true);
    expect(can(member({ canInviteClients: true }), "invite", "client")).toBe(true);
    expect(can(member({ canManageAutomations: true }), "create", "automation")).toBe(true);
    expect(can(member({ canViewAllClients: true }), "create", "client")).toBe(true);
    expect(can(member(), "delete", "agency")).toBe(false);
  });

  test("exposes allowed transitions for UI action rendering", () => {
    expect(allowedTransitions("APPROVED")).toEqual(["REVISION_REQUESTED", "DELIVERED", "ARCHIVED"]);
  });
});
