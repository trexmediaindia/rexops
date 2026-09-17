import { z } from "zod";

const conditionSchema: z.ZodType<Record<string, unknown>> = z.record(z.string(), z.unknown());
const actionSchema = z.object({
  type: z.enum(["UPDATE_STATUS", "ASSIGN", "NOTIFY", "SET_FIELD", "CREATE_TASK", "HTTP_REQUEST"]),
  config: z.record(z.string(), z.unknown()).default({}),
});

export const automationRuleSchema = z.object({
  name: z.string().trim().min(1).max(160),
  kind: z.enum(["RULE", "CARD_BUTTON", "BOARD_BUTTON", "SCHEDULED", "DUE_DATE"]),
  enabled: z.boolean().default(true),
  scope: z.enum(["PROJECT", "AGENCY"]),
  scopeId: z.string().min(1).optional(),
  trigger: z.object({ event: z.string().trim().min(1).max(120) }),
  conditions: conditionSchema.default({}),
  actions: z.array(actionSchema).min(1).max(20),
});

export const intakeFormSchema = z.object({
  name: z.string().trim().min(1).max(160),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(100),
  targetConfig: z.record(z.string(), z.unknown()).default({}),
  fields: z
    .array(
      z.object({
        key: z
          .string()
          .trim()
          .regex(/^[a-z][a-z0-9_]*$/)
          .max(80),
        label: z.string().trim().min(1).max(160),
        type: z.enum([
          "TEXT",
          "NUMBER",
          "SINGLE_SELECT",
          "MULTI_SELECT",
          "DATE",
          "BOOLEAN",
          "RATING",
        ]),
        required: z.boolean().default(false),
        branchingJson: z.record(z.string(), z.unknown()).optional(),
        mapToField: z.string().max(100).optional(),
      }),
    )
    .min(1)
    .max(100),
});

export const intakeSubmissionSchema = z.object({
  answers: z.record(z.string(), z.unknown()),
});

export const templatePackSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  payload: z.object({
    project: z.object({
      name: z.string().min(1),
      type: z.string().optional(),
    }),
    deliverables: z
      .array(
        z.object({
          title: z.string().min(1),
          contentType: z.enum(["MOTION", "STATIC", "OTHER"]).default("OTHER"),
          priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
        }),
      )
      .max(100)
      .default([]),
  }),
});

export const recurringScheduleSchema = z.object({
  scope: z.enum(["PROJECT", "DELIVERABLE"]),
  templatePackId: z.string().min(1),
  sourceProjectId: z.string().min(1).optional(),
  cadence: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
  mode: z.enum(["TIME_DRIVEN", "COMPLETION_DRIVEN"]).default("TIME_DRIVEN"),
  nextRunAt: z.coerce.date().optional(),
  enabled: z.boolean().default(true),
});

export type AutomationRuleInput = z.infer<typeof automationRuleSchema>;
export type IntakeFormInput = z.infer<typeof intakeFormSchema>;
export type TemplatePackInput = z.infer<typeof templatePackSchema>;
export type RecurringScheduleInput = z.infer<typeof recurringScheduleSchema>;
