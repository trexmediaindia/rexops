import { z } from "zod";

export const savedViewSchema = z.object({
  scope: z.enum(["PROJECT", "GLOBAL", "MY_WORK"]),
  scopeId: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(120),
  viewType: z.enum(["BOARD", "LIST", "CALENDAR", "TIMELINE"]),
  filterJson: z.record(z.string(), z.unknown()).default({}),
  sortJson: z.record(z.string(), z.unknown()).default({}),
  groupBy: z.string().max(120).optional(),
  visibleFieldIds: z.array(z.string().min(1)).max(100).default([]),
  isShared: z.boolean().default(false),
});

export const customFieldDefinitionSchema = z.object({
  scope: z.enum(["DELIVERABLE", "PROJECT"]),
  key: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]*$/)
    .max(80),
  label: z.string().trim().min(1).max(120),
  type: z.enum(["TEXT", "NUMBER", "SINGLE_SELECT", "MULTI_SELECT", "DATE", "BOOLEAN", "RATING"]),
  options: z.array(z.string().trim().min(1).max(100)).max(100).optional(),
  groupable: z.boolean().default(false),
  filterable: z.boolean().default(true),
  sortable: z.boolean().default(true),
  visibility: z.enum(["INTERNAL", "CLIENT"]).default("INTERNAL"),
});

export const dependencySchema = z.object({
  fromDeliverableId: z.string().min(1),
  toDeliverableId: z.string().min(1),
  type: z.enum(["FS", "SS", "FF", "SF"]).default("FS"),
});

export const checklistSchema = z.object({
  title: z.string().trim().min(1).max(200),
});

export const checklistItemSchema = z.object({
  text: z.string().trim().min(1).max(500),
  assignedToUserId: z.string().min(1).optional(),
  dueDate: z.coerce.date().optional(),
});

export const taskSchema = z.object({
  title: z.string().trim().min(1).max(240),
  assignedToUserId: z.string().min(1).optional(),
  dueDate: z.coerce.date().optional(),
  parentTaskId: z.string().min(1).optional(),
});

export type SavedViewInput = z.infer<typeof savedViewSchema>;
export type FieldDefinitionInput = z.infer<typeof customFieldDefinitionSchema>;
export type DependencyInput = z.infer<typeof dependencySchema>;
export type ChecklistInput = z.infer<typeof checklistSchema>;
export type ChecklistItemInput = z.infer<typeof checklistItemSchema>;
export type TaskInput = z.infer<typeof taskSchema>;
