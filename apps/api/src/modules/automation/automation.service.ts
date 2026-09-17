import type { Principal } from "@rexops/core";
import {
  assertWritablePrincipal,
  ForbiddenError,
  NotFoundError,
  validateFieldValue,
} from "@rexops/core";
import {
  clients,
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
import type {
  AutomationRuleInput,
  IntakeFormInput,
  RecurringScheduleInput,
  TemplatePackInput,
} from "@rexops/validators";
import { and, asc, count, eq } from "drizzle-orm";
import { getProject } from "../projects/projects.service";

function requireAutomationAdmin(principal: Principal) {
  if (
    !principal.agencyId ||
    (!["AGENCY_OWNER", "AGENCY_ADMIN"].includes(principal.role) &&
      !principal.permissions.canManageAutomations)
  ) {
    throw new ForbiddenError();
  }
  assertWritablePrincipal(principal);
  return principal.agencyId;
}

export async function listRules(principal: Principal) {
  const agencyId = requireAutomationAdmin(principal);
  return db.select().from(rules).where(eq(rules.agencyId, agencyId)).orderBy(asc(rules.createdAt));
}

export async function createRule(principal: Principal, input: AutomationRuleInput) {
  const agencyId = requireAutomationAdmin(principal);
  if (input.scope === "PROJECT" && input.scopeId) await getProject(principal, input.scopeId);
  const [usage] = await db
    .select({ value: count() })
    .from(rules)
    .where(
      and(
        eq(rules.agencyId, agencyId),
        eq(rules.scope, input.scope),
        ...(input.scopeId ? [eq(rules.scopeId, input.scopeId)] : []),
      ),
    );
  if ((usage?.value ?? 0) >= 25) {
    throw new ForbiddenError("This automation scope has reached its 25-rule cap.");
  }
  const [rule] = await db
    .insert(rules)
    .values({ ...input, agencyId })
    .returning();
  return rule;
}

export async function updateRule(
  principal: Principal,
  id: string,
  input: Partial<AutomationRuleInput>,
) {
  const agencyId = requireAutomationAdmin(principal);
  const [rule] = await db
    .update(rules)
    .set(input)
    .where(and(eq(rules.id, id), eq(rules.agencyId, agencyId)))
    .returning();
  if (!rule) throw new NotFoundError();
  return rule;
}

export async function executeButtonRule(
  principal: Principal,
  id: string,
  context: Record<string, unknown>,
) {
  const agencyId = requireAutomationAdmin(principal);
  const [rule] = await db
    .select()
    .from(rules)
    .where(and(eq(rules.id, id), eq(rules.agencyId, agencyId), eq(rules.enabled, true)))
    .limit(1);
  if (!rule || !["CARD_BUTTON", "BOARD_BUTTON"].includes(rule.kind)) throw new NotFoundError();
  const [event] = await db
    .insert(outbox)
    .values({
      agencyId,
      eventType: "BUTTON_EXECUTED",
      payload: { ruleId: rule.id, actorUserId: principal.userId, ...context },
    })
    .returning({ id: outbox.id });
  return { queued: true, eventId: event?.id };
}

export async function createIntakeForm(principal: Principal, input: IntakeFormInput) {
  const agencyId = requireAutomationAdmin(principal);
  const [existing] = await db
    .select({ id: intakeForms.id })
    .from(intakeForms)
    .where(and(eq(intakeForms.agencyId, agencyId), eq(intakeForms.slug, input.slug)))
    .limit(1);
  if (existing) throw new ForbiddenError("This intake slug is already in use.");
  return db.transaction(async (tx) => {
    const [form] = await tx
      .insert(intakeForms)
      .values({
        agencyId,
        name: input.name,
        slug: input.slug,
        targetConfig: input.targetConfig,
      })
      .returning();
    if (!form) throw new Error("Intake form insert failed.");
    await tx.insert(formFields).values(
      input.fields.map((field, position) => ({
        ...field,
        agencyId,
        formId: form.id,
        position,
      })),
    );
    return form;
  });
}

export async function getPublicIntakeForm(slug: string) {
  const [form] = await db.select().from(intakeForms).where(eq(intakeForms.slug, slug)).limit(1);
  if (!form) throw new NotFoundError();
  const fields = await db
    .select()
    .from(formFields)
    .where(eq(formFields.formId, form.id))
    .orderBy(asc(formFields.position));
  return {
    id: form.id,
    name: form.name,
    slug: form.slug,
    fields: fields.map(({ agencyId: _agencyId, ...field }) => field),
  };
}

export async function submitIntake(slug: string, answers: Record<string, unknown>) {
  const [form] = await db.select().from(intakeForms).where(eq(intakeForms.slug, slug)).limit(1);
  if (!form) throw new NotFoundError();
  const fields = await db.select().from(formFields).where(eq(formFields.formId, form.id));
  for (const field of fields) {
    const value = answers[field.key];
    if (field.required && (value === undefined || value === null || value === "")) {
      throw new ForbiddenError(`${field.label} is required.`);
    }
    if (value !== undefined && !validateFieldValue({ type: field.type, options: [] }, value)) {
      throw new ForbiddenError(`${field.label} has an invalid value.`);
    }
  }
  return db.transaction(async (tx) => {
    const [submission] = await tx
      .insert(formSubmissions)
      .values({ agencyId: form.agencyId, formId: form.id, answers })
      .returning();
    if (!submission) throw new Error("Intake submission insert failed.");
    await tx.insert(outbox).values({
      agencyId: form.agencyId,
      eventType: "INTAKE_SUBMITTED",
      payload: { submissionId: submission.id, formId: form.id },
    });
    return { id: submission.id, status: submission.status };
  });
}

export async function listIntakeSubmissions(principal: Principal) {
  const agencyId = requireAutomationAdmin(principal);
  return db
    .select()
    .from(formSubmissions)
    .where(eq(formSubmissions.agencyId, agencyId))
    .orderBy(asc(formSubmissions.createdAt));
}

export async function createTemplatePack(principal: Principal, input: TemplatePackInput) {
  const agencyId = requireAutomationAdmin(principal);
  const [pack] = await db
    .insert(templatePacks)
    .values({ ...input, agencyId })
    .returning();
  return pack;
}

export async function applyTemplatePack(
  principal: Principal,
  packId: string,
  input: { clientId: string; startDate?: Date },
) {
  const agencyId = requireAutomationAdmin(principal);
  const [pack] = await db
    .select()
    .from(templatePacks)
    .where(and(eq(templatePacks.id, packId), eq(templatePacks.agencyId, agencyId)))
    .limit(1);
  if (!pack) throw new NotFoundError();
  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, input.clientId), eq(clients.agencyId, agencyId)))
    .limit(1);
  if (!client) throw new NotFoundError();
  const payload = pack.payload as TemplatePackInput["payload"];
  return db.transaction(async (tx) => {
    const [project] = await tx
      .insert(projects)
      .values({
        agencyId,
        clientId: input.clientId,
        name: payload.project.name,
        type: payload.project.type,
        startDate: input.startDate,
        createdByUserId: principal.userId,
      })
      .returning();
    if (!project) throw new Error("Template project insert failed.");
    const createdDeliverables = payload.deliverables.length
      ? await tx
          .insert(deliverables)
          .values(
            payload.deliverables.map((deliverable) => ({
              ...deliverable,
              agencyId,
              clientId: input.clientId,
              projectId: project.id,
              createdByUserId: principal.userId,
            })),
          )
          .returning()
      : [];
    return { project, deliverables: createdDeliverables };
  });
}

export async function createRecurringSchedule(principal: Principal, input: RecurringScheduleInput) {
  const agencyId = requireAutomationAdmin(principal);
  const [pack] = await db
    .select({ id: templatePacks.id })
    .from(templatePacks)
    .where(and(eq(templatePacks.id, input.templatePackId), eq(templatePacks.agencyId, agencyId)))
    .limit(1);
  if (!pack) throw new NotFoundError();
  if (input.sourceProjectId) {
    const source = await getProject(principal, input.sourceProjectId);
    if ((source as { agencyId: string }).agencyId !== agencyId) throw new NotFoundError();
  }
  const [schedule] = await db
    .insert(recurringSchedules)
    .values({
      ...input,
      agencyId,
      nextRunAt: input.nextRunAt ?? new Date(),
    })
    .returning();
  return schedule;
}
