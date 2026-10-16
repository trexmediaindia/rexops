import { describe, expect, test } from "bun:test";
import {
  createDeliverableSchema,
  createProjectSchema,
  updateDeliverableSchema,
  updateProjectSchema,
} from "./index";

describe("update schemas never inject defaults", () => {
  test("editing a project's name leaves its service and priority alone", () => {
    expect(updateProjectSchema.parse({ name: "Renamed" })).toEqual({ name: "Renamed" });
  });

  test("editing a deliverable's title leaves content type and priority alone", () => {
    expect(updateDeliverableSchema.parse({ title: "New title" })).toEqual({ title: "New title" });
  });

  test("a post date can be cleared", () => {
    expect(updateDeliverableSchema.parse({ publishAt: null })).toEqual({ publishAt: null });
  });

  test("creating still fills the defaults", () => {
    expect(createProjectSchema.parse({ clientId: "c", name: "Retainer" })).toMatchObject({
      service: "OTHER",
      priority: "MEDIUM",
      memberIds: [],
    });
    expect(createDeliverableSchema.parse({ projectId: "p", title: "Post 1" })).toMatchObject({
      contentType: "OTHER",
      priority: "MEDIUM",
    });
  });
});
