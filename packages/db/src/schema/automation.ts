import { boolean, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import {
  customFieldTypeEnum,
  recurrenceModeEnum,
  ruleKindEnum,
  submissionStatusEnum,
} from "./enums";
import { idColumn, timestamps } from "./helpers";
import { agencies } from "./identity";
import { projects } from "./work";

export const rules = pgTable(
  "rule",
  {
    id: idColumn(),
    agencyId: text("agency_id")
      .notNull()
      .references(() => agencies.id),
    name: text("name").notNull(),
    kind: ruleKindEnum("kind").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    scope: text("scope", { enum: ["PROJECT", "AGENCY"] }).notNull(),
    scopeId: text("scope_id"),
    trigger: jsonb("trigger").$type<Record<string, unknown>>().notNull(),
    conditions: jsonb("conditions").$type<Record<string, unknown>>().default({}).notNull(),
    actions: jsonb("actions").$type<unknown[]>().default([]).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("rule_agency_idx").on(table.agencyId)],
);

export const intakeForms = pgTable(
  "intake_form",
  {
    id: idColumn(),
    agencyId: text("agency_id")
      .notNull()
      .references(() => agencies.id),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    targetConfig: jsonb("target_config").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("intake_form_agency_idx").on(table.agencyId)],
);

export const formFields = pgTable(
  "form_field",
  {
    id: idColumn(),
    agencyId: text("agency_id")
      .notNull()
      .references(() => agencies.id),
    formId: text("form_id")
      .notNull()
      .references(() => intakeForms.id),
    key: text("key").notNull(),
    label: text("label").notNull(),
    type: customFieldTypeEnum("type").notNull(),
    required: boolean("required").default(false).notNull(),
    branchingJson: jsonb("branching_json").$type<Record<string, unknown>>(),
    mapToField: text("map_to_field"),
    position: integer("position").default(0).notNull(),
  },
  (table) => [index("form_field_agency_idx").on(table.agencyId)],
);

export const formSubmissions = pgTable(
  "form_submission",
  {
    id: idColumn(),
    agencyId: text("agency_id")
      .notNull()
      .references(() => agencies.id),
    formId: text("form_id")
      .notNull()
      .references(() => intakeForms.id),
    answers: jsonb("answers").$type<Record<string, unknown>>().notNull(),
    status: submissionStatusEnum("status").default("QUEUED").notNull(),
    createdProjectId: text("created_project_id").references(() => projects.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("submission_agency_idx").on(table.agencyId)],
);

export const templatePacks = pgTable(
  "template_pack",
  {
    id: idColumn(),
    agencyId: text("agency_id")
      .notNull()
      .references(() => agencies.id),
    name: text("name").notNull(),
    description: text("description"),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("template_pack_agency_idx").on(table.agencyId)],
);

export const recurringSchedules = pgTable(
  "recurring_schedule",
  {
    id: idColumn(),
    agencyId: text("agency_id")
      .notNull()
      .references(() => agencies.id),
    scope: text("scope", { enum: ["PROJECT", "DELIVERABLE"] }).notNull(),
    templatePackId: text("template_pack_id").references(() => templatePacks.id),
    sourceProjectId: text("source_project_id").references(() => projects.id),
    cadence: text("cadence").notNull(),
    mode: recurrenceModeEnum("mode").default("TIME_DRIVEN").notNull(),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    enabled: boolean("enabled").default(true).notNull(),
    ...timestamps,
  },
  (table) => [index("recurring_agency_idx").on(table.agencyId)],
);
