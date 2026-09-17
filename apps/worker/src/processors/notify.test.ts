import { describe, expect, test } from "bun:test";
import { eligibleInternalReviewers } from "./notify";

const permissions = (canApprove: boolean) => ({ canApprove });

describe("notification routing", () => {
  test("routes motion review to leads and motion-capable approvers", () => {
    const recipients = eligibleInternalReviewers({ contentType: "MOTION" }, [
      { id: "owner", role: "AGENCY_OWNER", specialty: "GENERAL", permissions: permissions(true) },
      { id: "motion", role: "AGENCY_MEMBER", specialty: "MOTION", permissions: permissions(true) },
      { id: "editor", role: "AGENCY_MEMBER", specialty: "EDITOR", permissions: permissions(true) },
      {
        id: "designer",
        role: "AGENCY_MEMBER",
        specialty: "DESIGNER",
        permissions: permissions(true),
      },
      { id: "viewer", role: "AGENCY_MEMBER", specialty: "MOTION", permissions: permissions(false) },
    ] as never);
    expect(recipients).toEqual(["owner", "motion", "editor"]);
  });

  test("routes static review to design approvers", () => {
    const recipients = eligibleInternalReviewers({ contentType: "STATIC" }, [
      {
        id: "designer",
        role: "AGENCY_MEMBER",
        specialty: "DESIGNER",
        permissions: permissions(true),
      },
      { id: "motion", role: "AGENCY_MEMBER", specialty: "MOTION", permissions: permissions(true) },
    ] as never);
    expect(recipients).toEqual(["designer"]);
  });
});
