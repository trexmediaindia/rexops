import { afterAll, describe, expect, test } from "bun:test";
import {
  db,
  deliverables,
  formFields,
  formSubmissions,
  intakeForms,
  outbox,
  projects,
  recurringSchedules,
  rules,
  templatePacks,
} from "@rexops/db";
import { eq, like } from "drizzle-orm";
import { apiRequest, ensureTestFixtures, principals, responseJson } from "../../test/helpers";

const slug = "campaign-request-test";
let ruleId = "";
let formId = "";
let packId = "";
let generatedProjectId = "";

afterAll(async () => {
  await ensureTestFixtures();
  await db.delete(recurringSchedules).where(eq(recurringSchedules.templatePackId, packId));
  await db.delete(deliverables).where(like(deliverables.title, "Template test%"));
  if (generatedProjectId) await db.delete(projects).where(eq(projects.id, generatedProjectId));
  if (packId) await db.delete(templatePacks).where(eq(templatePacks.id, packId));
  if (formId) {
    await db.delete(formSubmissions).where(eq(formSubmissions.formId, formId));
    await db.delete(formFields).where(eq(formFields.formId, formId));
    await db.delete(intakeForms).where(eq(intakeForms.id, formId));
  }
  if (ruleId) await db.delete(rules).where(eq(rules.id, ruleId));
  await db.delete(outbox).where(eq(outbox.eventType, "BUTTON_EXECUTED"));
});

describe("automation, intake, and templates", () => {
  test("creates and queues a card-button rule", async () => {
    await ensureTestFixtures();
    const created = await apiRequest("/api/automation/rules", {
      method: "POST",
      principal: principals.owner,
      body: {
        name: "Send to client",
        kind: "CARD_BUTTON",
        scope: "PROJECT",
        scopeId: "project_reels",
        trigger: { event: "BUTTON_EXECUTED" },
        conditions: {
          all: [{ field: "deliverableId", operator: "NEQ", value: null }],
        },
        actions: [
          {
            type: "UPDATE_STATUS",
            config: { status: "UNDER_CLIENT_REVIEW" },
          },
          {
            type: "NOTIFY",
            config: { userId: "user_sara", title: "A cut is ready" },
          },
        ],
      },
    });
    expect(created.status).toBe(200);
    ruleId = String((await responseJson(created)).id);

    const executed = await apiRequest(`/api/automation/rules/${ruleId}/execute`, {
      method: "POST",
      principal: principals.owner,
      body: { context: { deliverableId: "deliverable_beach_vibe" } },
    });
    expect((await responseJson(executed)).queued).toBe(true);
  });

  test("publishes a validated public intake form into the request queue", async () => {
    const created = await apiRequest("/api/automation/intake-forms", {
      method: "POST",
      principal: principals.owner,
      body: {
        name: "Campaign request",
        slug,
        targetConfig: {
          projectId: "project_reels",
          titleField: "title",
          contentType: "MOTION",
        },
        fields: [
          { key: "title", label: "Deliverable title", type: "TEXT", required: true },
          { key: "launch_date", label: "Launch date", type: "DATE" },
        ],
      },
    });
    expect(created.status).toBe(200);
    formId = String((await responseJson(created)).id);

    const publicForm = await apiRequest(`/api/public/intake/${slug}`);
    expect(publicForm.status).toBe(200);

    const missing = await apiRequest(`/api/public/intake/${slug}`, {
      method: "POST",
      body: { answers: {} },
    });
    expect(missing.status).toBe(403);

    const submitted = await apiRequest(`/api/public/intake/${slug}`, {
      method: "POST",
      body: {
        answers: {
          title: "Launch teaser",
          launch_date: "2026-07-20",
        },
      },
    });
    expect((await responseJson(submitted)).status).toBe("QUEUED");
  });

  test("applies template bundles and creates recurring generation schedules", async () => {
    const created = await apiRequest("/api/automation/template-packs", {
      method: "POST",
      principal: principals.owner,
      body: {
        name: "Monthly social bundle",
        payload: {
          project: { name: "Template test July", type: "Retainer" },
          deliverables: [
            { title: "Template test Reel 01", contentType: "MOTION", priority: "HIGH" },
            { title: "Template test Static 01", contentType: "STATIC" },
          ],
        },
      },
    });
    packId = String((await responseJson(created)).id);

    const applied = await apiRequest(`/api/automation/template-packs/${packId}/apply`, {
      method: "POST",
      principal: principals.owner,
      body: { clientId: "client_imperial", startDate: new Date("2026-07-01") },
    });
    const appliedBody = await responseJson(applied);
    generatedProjectId = String((appliedBody.project as { id: string }).id);
    expect(appliedBody.deliverables as unknown[]).toHaveLength(2);

    const recurring = await apiRequest("/api/automation/recurring-schedules", {
      method: "POST",
      principal: principals.owner,
      body: {
        scope: "PROJECT",
        templatePackId: packId,
        sourceProjectId: "project_reels",
        cadence: "MONTHLY",
        nextRunAt: new Date(Date.now() + 60_000),
      },
    });
    expect(recurring.status).toBe(200);
  });

  test("hides automation from cross-tenant users", async () => {
    const guessed = await apiRequest(`/api/automation/rules/${ruleId}/execute`, {
      method: "POST",
      principal: principals.outsider,
      body: { context: {} },
    });
    expect(guessed.status).toBe(404);
  });
});
