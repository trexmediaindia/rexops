import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import {
  contentTypeEnum,
  deliverableStatusEnum,
  dependencyTypeEnum,
  priorityEnum,
  projectStatusEnum,
  taskStatusEnum,
} from "./enums";
import { idColumn, softDelete, timestamps } from "./helpers";
import { agencies, clients, users } from "./identity";

export const projects = pgTable(
  "project",
  {
    id: idColumn(),
    agencyId: text("agency_id")
      .notNull()
      .references(() => agencies.id),
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id),
    parentProjectId: text("parent_project_id").references((): AnyPgColumn => projects.id),
    name: text("name").notNull(),
    description: text("description"),
    brief: text("brief"),
    type: text("type"),
    status: projectStatusEnum("status").default("ACTIVE").notNull(),
    priority: priorityEnum("priority").default("MEDIUM").notNull(),
    startDate: timestamp("start_date", { withTimezone: true }),
    dueDate: timestamp("due_date", { withTimezone: true }),
    createdByUserId: text("created_by_user_id").references(() => users.id),
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index("project_agency_idx").on(table.agencyId),
    index("project_agency_client_status_idx").on(table.agencyId, table.clientId, table.status),
    index("project_parent_idx").on(table.parentProjectId),
  ],
);

export const projectMembers = pgTable(
  "project_member",
  {
    id: idColumn(),
    agencyId: text("agency_id")
      .notNull()
      .references(() => agencies.id),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    roleOnProject: text("role_on_project"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("project_member_agency_idx").on(table.agencyId),
    uniqueIndex("project_member_unique").on(table.projectId, table.userId),
  ],
);

export const deliverables = pgTable(
  "deliverable",
  {
    id: idColumn(),
    agencyId: text("agency_id")
      .notNull()
      .references(() => agencies.id),
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    contentType: contentTypeEnum("content_type").default("OTHER").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    status: deliverableStatusEnum("status").default("PENDING").notNull(),
    priority: priorityEnum("priority").default("MEDIUM").notNull(),
    assignedToUserId: text("assigned_to_user_id").references(() => users.id),
    dueDate: timestamp("due_date", { withTimezone: true }),
    agencyNote: text("agency_note"),
    clientNote: text("client_note"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdByUserId: text("created_by_user_id").references(() => users.id),
    ...timestamps,
    ...softDelete,
  },
  (table) => [
    index("deliverable_agency_idx").on(table.agencyId),
    index("deliverable_agency_project_status_idx").on(
      table.agencyId,
      table.projectId,
      table.status,
    ),
    index("deliverable_assignee_idx").on(table.assignedToUserId),
  ],
);

export const tasks = pgTable(
  "task",
  {
    id: idColumn(),
    agencyId: text("agency_id")
      .notNull()
      .references(() => agencies.id),
    projectId: text("project_id").references(() => projects.id),
    deliverableId: text("deliverable_id").references(() => deliverables.id),
    parentTaskId: text("parent_task_id").references((): AnyPgColumn => tasks.id),
    title: text("title").notNull(),
    status: taskStatusEnum("status").default("TODO").notNull(),
    assignedToUserId: text("assigned_to_user_id").references(() => users.id),
    dueDate: timestamp("due_date", { withTimezone: true }),
    position: integer("position").default(0).notNull(),
    taskType: text("task_type"),
    createdByUserId: text("created_by_user_id").references(() => users.id),
    ...timestamps,
    ...softDelete,
  },
  (table) => [index("task_agency_idx").on(table.agencyId)],
);

export const deliverablePlacements = pgTable(
  "deliverable_placement",
  {
    id: idColumn(),
    agencyId: text("agency_id")
      .notNull()
      .references(() => agencies.id),
    deliverableId: text("deliverable_id")
      .notNull()
      .references(() => deliverables.id),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("placement_agency_idx").on(table.agencyId),
    uniqueIndex("placement_unique").on(table.deliverableId, table.projectId),
  ],
);

export const milestones = pgTable(
  "milestone",
  {
    id: idColumn(),
    agencyId: text("agency_id")
      .notNull()
      .references(() => agencies.id),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    name: text("name").notNull(),
    dueDate: timestamp("due_date", { withTimezone: true }),
    reachedAt: timestamp("reached_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index("milestone_agency_idx").on(table.agencyId)],
);

export const dependencies = pgTable(
  "dependency",
  {
    id: idColumn(),
    agencyId: text("agency_id")
      .notNull()
      .references(() => agencies.id),
    fromDeliverableId: text("from_deliverable_id")
      .notNull()
      .references(() => deliverables.id),
    toDeliverableId: text("to_deliverable_id")
      .notNull()
      .references(() => deliverables.id),
    type: dependencyTypeEnum("type").default("FS").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("dependency_agency_idx").on(table.agencyId),
    uniqueIndex("dependency_unique").on(table.fromDeliverableId, table.toDeliverableId, table.type),
  ],
);

export const checklists = pgTable(
  "checklist",
  {
    id: idColumn(),
    agencyId: text("agency_id")
      .notNull()
      .references(() => agencies.id),
    deliverableId: text("deliverable_id")
      .notNull()
      .references(() => deliverables.id),
    title: text("title").notNull(),
    position: integer("position").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("checklist_agency_idx").on(table.agencyId)],
);

export const checklistItems = pgTable(
  "checklist_item",
  {
    id: idColumn(),
    agencyId: text("agency_id")
      .notNull()
      .references(() => agencies.id),
    checklistId: text("checklist_id")
      .notNull()
      .references(() => checklists.id),
    text: text("text").notNull(),
    done: boolean("done").default(false).notNull(),
    assignedToUserId: text("assigned_to_user_id").references(() => users.id),
    dueDate: timestamp("due_date", { withTimezone: true }),
    position: integer("position").default(0).notNull(),
  },
  (table) => [index("checklist_item_agency_idx").on(table.agencyId)],
);
