import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  checklistItems,
  checklists,
  customFieldDefs,
  customFieldValues,
  db,
  deliverablePlacements,
  deliverables,
  dependencies,
  savedViews,
  tasks,
} from "@rexops/db";
import { eq, inArray } from "drizzle-orm";
import { apiRequest, ensureTestFixtures, principals, responseJson } from "../../test/helpers";

const firstId = "deliverable_work_first";
const secondId = "deliverable_work_second";
const ids = [firstId, secondId];

beforeAll(async () => {
  await ensureTestFixtures();
  await db
    .insert(deliverables)
    .values([
      {
        id: firstId,
        agencyId: "agency_trex",
        clientId: "client_imperial",
        projectId: "project_reels",
        title: "Work First",
        status: "IN_PROGRESS",
        dueDate: new Date("2026-07-01T00:00:00.000Z"),
        assignedToUserId: "user_riya",
        createdByUserId: "user_manas",
      },
      {
        id: secondId,
        agencyId: "agency_trex",
        clientId: "client_imperial",
        projectId: "project_reels",
        title: "Work Second",
        status: "PENDING",
        dueDate: new Date("2026-07-03T00:00:00.000Z"),
        assignedToUserId: "user_riya",
        createdByUserId: "user_manas",
      },
    ])
    .onConflictDoNothing();
});

afterAll(async () => {
  await db.delete(checklistItems).where(eq(checklistItems.agencyId, "agency_trex"));
  await db.delete(checklists).where(inArray(checklists.deliverableId, ids));
  await db.delete(tasks).where(inArray(tasks.deliverableId, ids));
  await db.delete(deliverablePlacements).where(inArray(deliverablePlacements.deliverableId, ids));
  await db.delete(dependencies).where(inArray(dependencies.fromDeliverableId, ids));
  const definitions = await db
    .select({ id: customFieldDefs.id })
    .from(customFieldDefs)
    .where(eq(customFieldDefs.key, "distribution_channel_test"));
  if (definitions.length) {
    await db.delete(customFieldValues).where(
      inArray(
        customFieldValues.fieldDefId,
        definitions.map((row) => row.id),
      ),
    );
  }
  await db.delete(customFieldDefs).where(eq(customFieldDefs.key, "distribution_channel_test"));
  await db.delete(savedViews).where(eq(savedViews.name, "Motion calendar test"));
  await db.delete(deliverables).where(inArray(deliverables.id, ids));
});

describe("work management", () => {
  test("persists saved views and typed custom-field values on one dataset", async () => {
    const view = await apiRequest("/api/work/views", {
      method: "POST",
      principal: principals.owner,
      body: {
        scope: "PROJECT",
        scopeId: "project_reels",
        name: "Motion calendar test",
        viewType: "CALENDAR",
        filterJson: { contentType: "MOTION" },
        groupBy: "status",
      },
    });
    expect(view.status).toBe(200);

    const definition = await apiRequest("/api/work/fields", {
      method: "POST",
      principal: principals.owner,
      body: {
        scope: "DELIVERABLE",
        key: "distribution_channel_test",
        label: "Distribution channel",
        type: "SINGLE_SELECT",
        options: ["Instagram", "YouTube"],
        groupable: true,
        visibility: "CLIENT",
      },
    });
    const field = await responseJson(definition);
    const value = await apiRequest(`/api/work/fields/${field.id}/entities/${firstId}`, {
      method: "PUT",
      principal: principals.owner,
      body: { value: "Instagram" },
    });
    expect(value.status).toBe(200);

    const work = await apiRequest("/api/work?projectId=project_reels", {
      principal: principals.owner,
    });
    const rows = (await work.json()) as Array<{
      id: string;
      customFields: Record<string, unknown>;
    }>;
    expect(rows.find((row) => row.id === firstId)?.customFields[String(field.id)]).toBe(
      "Instagram",
    );
  });

  test("prevents dependency cycles and shifts downstream due dates", async () => {
    const dependency = await apiRequest("/api/work/dependencies", {
      method: "POST",
      principal: principals.owner,
      body: { fromDeliverableId: firstId, toDeliverableId: secondId, type: "FS" },
    });
    expect(dependency.status).toBe(200);

    const cycle = await apiRequest("/api/work/dependencies", {
      method: "POST",
      principal: principals.owner,
      body: { fromDeliverableId: secondId, toDeliverableId: firstId, type: "FS" },
    });
    expect(cycle.status).toBe(403);

    const shifted = await apiRequest(`/api/work/deliverables/${firstId}/reschedule`, {
      method: "POST",
      principal: principals.owner,
      body: { dueDate: new Date("2026-07-04T00:00:00.000Z") },
    });
    expect((await responseJson(shifted)).shifted).toEqual([firstId, secondId]);
    const [second] = await db
      .select({ dueDate: deliverables.dueDate })
      .from(deliverables)
      .where(eq(deliverables.id, secondId));
    expect(second?.dueDate?.toISOString()).toBe("2026-07-06T00:00:00.000Z");
  });

  test("supports multi-homing, checklists, and subtasks", async () => {
    const placement = await apiRequest(`/api/work/deliverables/${firstId}/placements`, {
      method: "POST",
      principal: principals.owner,
      body: { projectId: "project_june_retainer" },
    });
    expect(placement.status).toBe(200);

    const checklist = await apiRequest(`/api/work/deliverables/${firstId}/checklists`, {
      method: "POST",
      principal: principals.owner,
      body: { title: "Release gate" },
    });
    const checklistBody = await responseJson(checklist);
    const item = await apiRequest(`/api/work/checklists/${checklistBody.id}/items`, {
      method: "POST",
      principal: principals.owner,
      body: { text: "Captions attached", assignedToUserId: "user_riya" },
    });
    expect(item.status).toBe(200);

    const task = await apiRequest(`/api/work/deliverables/${firstId}/tasks`, {
      method: "POST",
      principal: principals.owner,
      body: { title: "Export vertical cut", assignedToUserId: "user_riya" },
    });
    expect(task.status).toBe(200);

    const details = await apiRequest(`/api/work/deliverables/${firstId}/details`, {
      principal: principals.owner,
    });
    const detailsBody = await responseJson(details);
    expect(detailsBody.checklists as unknown[]).toHaveLength(1);
    expect(detailsBody.tasks as unknown[]).toHaveLength(1);
  });

  test("hides cross-tenant work and rejects invalid field values", async () => {
    const guessed = await apiRequest(`/api/work/deliverables/${firstId}/details`, {
      principal: principals.outsider,
    });
    expect(guessed.status).toBe(404);

    const definitions = await apiRequest("/api/work/fields/DELIVERABLE", {
      principal: principals.owner,
    });
    const field = ((await definitions.json()) as Array<{ id: string; key: string }>).find(
      (row) => row.key === "distribution_channel_test",
    );
    expect(field).toBeDefined();
    const invalid = await apiRequest(`/api/work/fields/${field?.id}/entities/${firstId}`, {
      method: "PUT",
      principal: principals.owner,
      body: { value: "Television" },
    });
    expect(invalid.status).toBe(403);
  });
});
