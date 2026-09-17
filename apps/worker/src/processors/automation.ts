import { DELIVERABLE_STATUSES, type DeliverableStatus } from "@rexops/config";
import { transitionDeliverable, validateFieldValue } from "@rexops/core";
import {
  customFieldDefs,
  customFieldValues,
  db,
  deliverables,
  formSubmissions,
  intakeForms,
  notifications,
  projects,
  recurringSchedules,
  rules,
  tasks,
  templatePacks,
  users,
} from "@rexops/db";
import type { AutomationJobPayload } from "@rexops/jobs";
import type { Job } from "bullmq";
import { and, eq, lte } from "drizzle-orm";

type Condition = {
  field?: string;
  operator?: "EQ" | "NEQ" | "IN" | "CONTAINS" | "GT" | "LT";
  value?: unknown;
  all?: Condition[];
  any?: Condition[];
};

function valueAt(context: Record<string, unknown>, path: string) {
  return path.split(".").reduce<unknown>((value, key) => {
    if (!value || typeof value !== "object") return undefined;
    return (value as Record<string, unknown>)[key];
  }, context);
}

export function evaluateConditions(
  condition: Condition | undefined,
  context: Record<string, unknown>,
): boolean {
  if (!condition || Object.keys(condition).length === 0) return true;
  if (condition.all) return condition.all.every((entry) => evaluateConditions(entry, context));
  if (condition.any) return condition.any.some((entry) => evaluateConditions(entry, context));
  if (!condition.field || !condition.operator) return false;
  const actual = valueAt(context, condition.field);
  switch (condition.operator) {
    case "EQ":
      return actual === condition.value;
    case "NEQ":
      return actual !== condition.value;
    case "IN":
      return Array.isArray(condition.value) && condition.value.includes(actual);
    case "CONTAINS":
      return Array.isArray(actual)
        ? actual.includes(condition.value)
        : typeof actual === "string" && actual.includes(String(condition.value));
    case "GT":
      return typeof actual === "number" && actual > Number(condition.value);
    case "LT":
      return typeof actual === "number" && actual < Number(condition.value);
  }
}

function assertSafeHttpUrl(raw: unknown) {
  if (typeof raw !== "string") throw new Error("HTTP action URL is required.");
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("HTTP actions require HTTPS.");
  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname === "::1" ||
    hostname.endsWith(".local") ||
    /^127\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
    /^169\.254\./.test(hostname)
  ) {
    throw new Error("HTTP action targets a private network.");
  }
  return url;
}

async function executeAction(
  agencyId: string,
  action: { type: string; config?: Record<string, unknown> },
  context: Record<string, unknown>,
) {
  const config = action.config ?? {};
  const deliverableId =
    typeof config.deliverableId === "string"
      ? config.deliverableId
      : typeof context.deliverableId === "string"
        ? context.deliverableId
        : null;
  if (action.type === "UPDATE_STATUS" && deliverableId && typeof config.status === "string") {
    if (!DELIVERABLE_STATUSES.includes(config.status as DeliverableStatus)) {
      throw new Error("Automation requested an invalid deliverable status.");
    }
    const [deliverable] = await db
      .select({ status: deliverables.status })
      .from(deliverables)
      .where(and(eq(deliverables.id, deliverableId), eq(deliverables.agencyId, agencyId)))
      .limit(1);
    if (!deliverable) throw new Error("Automation deliverable was not found.");
    const status = transitionDeliverable(deliverable.status, config.status as DeliverableStatus);
    await db
      .update(deliverables)
      .set({ status })
      .where(and(eq(deliverables.id, deliverableId), eq(deliverables.agencyId, agencyId)));
    return;
  }
  if (action.type === "ASSIGN" && deliverableId && typeof config.userId === "string") {
    const [assignee] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, config.userId), eq(users.agencyId, agencyId)))
      .limit(1);
    if (!assignee) throw new Error("Automation assignee was not found in the agency.");
    await db
      .update(deliverables)
      .set({ assignedToUserId: config.userId })
      .where(and(eq(deliverables.id, deliverableId), eq(deliverables.agencyId, agencyId)));
    return;
  }
  if (action.type === "NOTIFY" && typeof config.userId === "string") {
    const [recipient] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, config.userId), eq(users.agencyId, agencyId)))
      .limit(1);
    if (!recipient) throw new Error("Automation recipient was not found in the agency.");
    await db.insert(notifications).values({
      agencyId,
      recipientUserId: config.userId,
      type: "ASSIGNMENT",
      title: typeof config.title === "string" ? config.title : "Automation notification",
      message: typeof config.message === "string" ? config.message : null,
      url: deliverableId ? `/agency/deliverables/${deliverableId}` : "/agency/inbox",
      relatedDeliverableId: deliverableId,
    });
    return;
  }
  if (action.type === "SET_FIELD" && deliverableId && typeof config.fieldDefId === "string") {
    const [[deliverable], [definition]] = await Promise.all([
      db
        .select({ id: deliverables.id })
        .from(deliverables)
        .where(and(eq(deliverables.id, deliverableId), eq(deliverables.agencyId, agencyId)))
        .limit(1),
      db
        .select()
        .from(customFieldDefs)
        .where(
          and(
            eq(customFieldDefs.id, config.fieldDefId),
            eq(customFieldDefs.agencyId, agencyId),
            eq(customFieldDefs.scope, "DELIVERABLE"),
          ),
        )
        .limit(1),
    ]);
    if (!deliverable || !definition) {
      throw new Error("Automation custom field target was not found.");
    }
    const options = definition.options?.filter(
      (option): option is string => typeof option === "string",
    );
    if (!validateFieldValue({ type: definition.type, options }, config.value)) {
      throw new Error("Automation custom field value is invalid.");
    }
    await db
      .insert(customFieldValues)
      .values({
        agencyId,
        fieldDefId: config.fieldDefId,
        entityType: "DELIVERABLE",
        entityId: deliverableId,
        value: config.value,
      })
      .onConflictDoUpdate({
        target: [
          customFieldValues.fieldDefId,
          customFieldValues.entityType,
          customFieldValues.entityId,
        ],
        set: { value: config.value },
      });
    return;
  }
  if (action.type === "CREATE_TASK" && deliverableId) {
    const assignedToUserId =
      typeof config.assignedToUserId === "string" ? config.assignedToUserId : null;
    if (assignedToUserId) {
      const [assignee] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, assignedToUserId), eq(users.agencyId, agencyId)))
        .limit(1);
      if (!assignee) throw new Error("Automation task assignee was not found in the agency.");
    }
    const [deliverable] = await db
      .select()
      .from(deliverables)
      .where(and(eq(deliverables.id, deliverableId), eq(deliverables.agencyId, agencyId)))
      .limit(1);
    if (deliverable) {
      await db.insert(tasks).values({
        agencyId,
        projectId: deliverable.projectId,
        deliverableId,
        title: typeof config.title === "string" ? config.title : "Automation task",
        assignedToUserId,
        taskType: "AUTOMATION",
      });
    }
    return;
  }
  if (action.type === "HTTP_REQUEST") {
    const url = assertSafeHttpUrl(config.url);
    const method = typeof config.method === "string" ? config.method.toUpperCase() : "POST";
    const response = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify({ context, payload: config.body ?? {} }),
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    });
    if (!response.ok) throw new Error(`HTTP action failed with ${response.status}.`);
  }
}

async function processRules(job: Job<AutomationJobPayload>) {
  if (!job.data.agencyId) return { executed: 0 };
  const allRules = await db
    .select()
    .from(rules)
    .where(and(eq(rules.agencyId, job.data.agencyId), eq(rules.enabled, true)));
  const selected = allRules.filter((rule) => {
    if (job.data.eventType === "BUTTON_EXECUTED") return job.data.payload.ruleId === rule.id;
    return (rule.trigger as { event?: string }).event === job.data.eventType;
  });
  let executed = 0;
  for (const rule of selected) {
    const context = { ...job.data.payload, eventType: job.data.eventType };
    if (!evaluateConditions(rule.conditions as Condition, context)) continue;
    for (const action of rule.actions as Array<{
      type: string;
      config?: Record<string, unknown>;
    }>) {
      await executeAction(job.data.agencyId, action, context);
    }
    executed += 1;
  }
  return { executed };
}

async function processIntake(job: Job<AutomationJobPayload>) {
  const submissionId = job.data.payload.submissionId;
  if (typeof submissionId !== "string") return { provisioned: false };
  const [row] = await db
    .select({ submission: formSubmissions, form: intakeForms })
    .from(formSubmissions)
    .innerJoin(
      intakeForms,
      and(
        eq(intakeForms.id, formSubmissions.formId),
        eq(intakeForms.agencyId, formSubmissions.agencyId),
      ),
    )
    .where(eq(formSubmissions.id, submissionId))
    .limit(1);
  if (row?.submission.status !== "QUEUED") return { provisioned: false };
  const config = row.form.targetConfig;
  const projectId = typeof config.projectId === "string" ? config.projectId : null;
  if (!projectId) return { provisioned: false };
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.agencyId, row.form.agencyId)))
    .limit(1);
  if (!project) return { provisioned: false };
  const titleField = typeof config.titleField === "string" ? config.titleField : "title";
  const answerTitle = row.submission.answers[titleField];
  const title = typeof answerTitle === "string" ? answerTitle : `Request ${submissionId.slice(-6)}`;
  const [deliverable] = await db
    .insert(deliverables)
    .values({
      agencyId: project.agencyId,
      clientId: project.clientId,
      projectId: project.id,
      title,
      contentType:
        config.contentType === "MOTION" || config.contentType === "STATIC"
          ? config.contentType
          : "OTHER",
      status: "PENDING",
    })
    .returning();
  await db
    .update(formSubmissions)
    .set({ status: "PROVISIONED", createdProjectId: project.id })
    .where(eq(formSubmissions.id, submissionId));
  return { provisioned: true, deliverableId: deliverable?.id };
}

function nextRun(cadence: string, current: Date) {
  const next = new Date(current);
  if (cadence === "DAILY") next.setUTCDate(next.getUTCDate() + 1);
  else if (cadence === "WEEKLY") next.setUTCDate(next.getUTCDate() + 7);
  else next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

export async function scanRecurringSchedules(now = new Date()) {
  const due = await db
    .select({ schedule: recurringSchedules, pack: templatePacks })
    .from(recurringSchedules)
    .innerJoin(
      templatePacks,
      and(
        eq(templatePacks.id, recurringSchedules.templatePackId),
        eq(templatePacks.agencyId, recurringSchedules.agencyId),
      ),
    )
    .where(and(eq(recurringSchedules.enabled, true), lte(recurringSchedules.nextRunAt, now)));
  let generated = 0;
  for (const { schedule, pack } of due) {
    if (!schedule.sourceProjectId) continue;
    const [source] = await db
      .select()
      .from(projects)
      .where(
        and(eq(projects.id, schedule.sourceProjectId), eq(projects.agencyId, schedule.agencyId)),
      )
      .limit(1);
    if (!source) continue;
    const payload = pack.payload as {
      project?: { name?: string; type?: string };
      deliverables?: Array<{
        title: string;
        contentType?: "MOTION" | "STATIC" | "OTHER";
        priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
      }>;
    };
    const month = now.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    const [project] = await db
      .insert(projects)
      .values({
        agencyId: source.agencyId,
        clientId: source.clientId,
        name: (payload.project?.name ?? pack.name).replace("{{month}}", month),
        type: payload.project?.type,
        createdByUserId: source.createdByUserId,
      })
      .returning();
    if (project && payload.deliverables?.length) {
      await db.insert(deliverables).values(
        payload.deliverables.map((deliverable) => ({
          agencyId: source.agencyId,
          clientId: source.clientId,
          projectId: project.id,
          title: deliverable.title.replace("{{month}}", month),
          contentType: deliverable.contentType ?? "OTHER",
          priority: deliverable.priority ?? "MEDIUM",
          createdByUserId: source.createdByUserId,
        })),
      );
    }
    await db
      .update(recurringSchedules)
      .set({
        lastRunAt: now,
        nextRunAt: nextRun(schedule.cadence, now),
      })
      .where(eq(recurringSchedules.id, schedule.id));
    generated += 1;
  }
  return generated;
}

export async function processAutomation(job: Job<AutomationJobPayload>) {
  if (job.data.eventType === "INTAKE_SUBMITTED") return processIntake(job);
  if (job.data.eventType === "SCAN_RECURRING") {
    return { generated: await scanRecurringSchedules() };
  }
  return processRules(job);
}
