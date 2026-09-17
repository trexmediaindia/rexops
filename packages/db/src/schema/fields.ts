import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { customFieldTypeEnum, viewTypeEnum } from "./enums";
import { idColumn, timestamps } from "./helpers";
import { agencies, users } from "./identity";

export const customFieldDefs = pgTable(
  "custom_field_def",
  {
    id: idColumn(),
    agencyId: text("agency_id")
      .notNull()
      .references(() => agencies.id),
    scope: text("scope", { enum: ["DELIVERABLE", "PROJECT"] }).notNull(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    type: customFieldTypeEnum("type").notNull(),
    options: jsonb("options").$type<unknown[]>(),
    groupable: boolean("groupable").default(false).notNull(),
    filterable: boolean("filterable").default(true).notNull(),
    sortable: boolean("sortable").default(true).notNull(),
    visibility: text("visibility", { enum: ["INTERNAL", "CLIENT"] })
      .default("INTERNAL")
      .notNull(),
    isBuiltIn: boolean("is_built_in").default(false).notNull(),
    position: integer("position").default(0).notNull(),
    ...timestamps,
  },
  (table) => [
    index("field_def_agency_idx").on(table.agencyId),
    uniqueIndex("field_def_key_unique").on(table.agencyId, table.scope, table.key),
  ],
);

export const customFieldValues = pgTable(
  "custom_field_value",
  {
    id: idColumn(),
    agencyId: text("agency_id")
      .notNull()
      .references(() => agencies.id),
    fieldDefId: text("field_def_id")
      .notNull()
      .references(() => customFieldDefs.id),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    value: jsonb("value").notNull(),
    ...timestamps,
  },
  (table) => [
    index("field_value_agency_idx").on(table.agencyId),
    uniqueIndex("field_value_unique").on(table.fieldDefId, table.entityType, table.entityId),
  ],
);

export const savedViews = pgTable(
  "saved_view",
  {
    id: idColumn(),
    agencyId: text("agency_id")
      .notNull()
      .references(() => agencies.id),
    ownerUserId: text("owner_user_id").references(() => users.id),
    scope: text("scope", { enum: ["PROJECT", "GLOBAL", "MY_WORK"] }).notNull(),
    scopeId: text("scope_id"),
    name: text("name").notNull(),
    viewType: viewTypeEnum("view_type").notNull(),
    filterJson: jsonb("filter_json").$type<Record<string, unknown>>().default({}).notNull(),
    sortJson: jsonb("sort_json").$type<Record<string, unknown>>().default({}).notNull(),
    groupBy: text("group_by"),
    visibleFieldIds: text("visible_field_ids").array().default([]).notNull(),
    isShared: boolean("is_shared").default(false).notNull(),
    position: integer("position").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("saved_view_agency_idx").on(table.agencyId)],
);
