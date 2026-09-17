import { describe, expect, test } from "bun:test";
import { evaluateConditions } from "./automation";

describe("automation conditions", () => {
  const context = {
    status: "INTERNAL_APPROVED",
    deliverable: { priority: "HIGH", tags: ["social", "launch"] },
  };

  test("supports nested and/or conditions", () => {
    expect(
      evaluateConditions(
        {
          all: [
            { field: "status", operator: "EQ", value: "INTERNAL_APPROVED" },
            {
              any: [
                { field: "deliverable.priority", operator: "EQ", value: "URGENT" },
                { field: "deliverable.tags", operator: "CONTAINS", value: "launch" },
              ],
            },
          ],
        },
        context,
      ),
    ).toBe(true);
  });

  test("fails closed for malformed conditions", () => {
    expect(evaluateConditions({ field: "status" }, context)).toBe(false);
  });
});
