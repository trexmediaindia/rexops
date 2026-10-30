import { db } from "@rexops/db";
import { sql } from "drizzle-orm";
import { objectStorage } from "../file-versions/storage";

/**
 * Permanent deletion.
 *
 * Rows are linked by foreign keys, and almost none of them cascade, so deleting a project
 * means first deleting its pieces of work, their versions, comments, approvals, review
 * runs and so on, in an order the database accepts. Rather than keep a hand-written list
 * that goes stale with every new table, the purge reads the real links from Postgres and
 * walks them:
 *
 * - a row that cannot exist without the deleted one (a NOT NULL link) is deleted too,
 *   and so on down the tree;
 * - a row that merely mentions it (a nullable link: "created by", "related to") keeps its
 *   place and the link is cleared;
 * - a few nullable links mean "belongs to" and are followed like NOT NULL ones (a
 *   sub-project, a reply, the tasks raised from feedback on a piece of work).
 *
 * Everything runs in one transaction, so a failure deletes nothing. Stored files (the
 * uploaded versions, their previews and comment attachments) are removed from storage
 * after the transaction commits.
 */

type Edge = { child: string; column: string; parent: string; cascades: boolean; notNull: boolean };
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Nullable links that still mean "this row belongs to that one". */
const BELONGS_TO = new Set([
  "project.parent_project_id",
  "comment.parent_id",
  "message.parent_id",
  "task.parent_task_id",
  "task.deliverable_id",
  "task.project_id",
  "notification.related_deliverable_id",
  "notification.related_project_id",
]);

/** Polymorphic attachment parents: no foreign key, so they are cleaned up by name. */
const ATTACHMENT_PARENTS: Record<string, string> = {
  comment: "COMMENT",
  message: "MESSAGE",
  ad_report: "AD_REPORT",
};

let graph: Edge[] | null = null;

async function loadGraph(tx: Tx) {
  if (graph) return graph;
  const rows = (await tx.execute(sql`
    select
      c.conrelid::regclass::text as child,
      a.attname as column,
      c.confrelid::regclass::text as parent,
      c.confdeltype = 'c' as cascades,
      a.attnotnull as not_null
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and array_length(c.conkey, 1) = 1
  `)) as unknown as Array<{
    child: string;
    column: string;
    parent: string;
    cascades: boolean;
    not_null: boolean;
  }>;
  graph = rows.map((row) => ({
    child: row.child.replaceAll('"', ""),
    column: row.column,
    parent: row.parent.replaceAll('"', ""),
    cascades: row.cascades,
    notNull: row.not_null,
  }));
  return graph;
}

const table = (name: string) => sql.identifier(name);

function chunks<T>(items: T[], size = 500) {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size)
    out.push(items.slice(index, index + size));
  return out;
}

function isStorageKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !value.includes("://") &&
    !value.startsWith("/")
  );
}

export class Purge {
  readonly deleted = new Map<string, Set<string>>();
  readonly storageKeys = new Set<string>();

  constructor(
    private readonly tx: Tx,
    /** Extra links to follow as "belongs to" for this purge (an agency's own rows). */
    private readonly alsoFollow: (edge: Edge) => boolean = () => false,
  ) {}

  /** Deletes the rows with these ids from `name`, and everything that depends on them. */
  async remove(name: string, ids: string[]) {
    const seen = this.deleted.get(name) ?? new Set<string>();
    this.deleted.set(name, seen);
    const fresh = [...new Set(ids)].filter((id) => !seen.has(id));
    if (!fresh.length) return;
    for (const id of fresh) seen.add(id);

    const edges = (await loadGraph(this.tx)).filter((edge) => edge.parent === name);
    for (const part of chunks(fresh)) {
      for (const edge of edges) {
        if (edge.cascades) continue; // the database removes these itself
        const follow =
          edge.notNull || BELONGS_TO.has(`${edge.child}.${edge.column}`) || this.alsoFollow(edge);
        if (follow) {
          const children = (await this.tx.execute(
            sql`select id from ${table(edge.child)} where ${sql.identifier(edge.column)} in ${part}`,
          )) as unknown as Array<{ id: string }>;
          await this.remove(
            edge.child,
            children.map((row) => row.id),
          );
        } else {
          await this.tx.execute(
            sql`update ${table(edge.child)} set ${sql.identifier(edge.column)} = null where ${sql.identifier(edge.column)} in ${part}`,
          );
        }
      }

      const parentType = ATTACHMENT_PARENTS[name];
      if (parentType) {
        const attached = (await this.tx.execute(
          sql`select id from attachment where parent_type = ${parentType} and parent_id in ${part}`,
        )) as unknown as Array<{ id: string }>;
        await this.remove(
          "attachment",
          attached.map((row) => row.id),
        );
      }

      if (name === "file_version") {
        const files = (await this.tx.execute(
          sql`select file_url, preview_url, poster_frame_url, thumbnail_sprite_url from file_version where id in ${part}`,
        )) as unknown as Array<Record<string, unknown>>;
        for (const row of files)
          for (const value of Object.values(row))
            if (isStorageKey(value)) this.storageKeys.add(value);
      }
      if (name === "attachment") {
        const files = (await this.tx.execute(
          sql`select object_key from attachment where id in ${part}`,
        )) as unknown as Array<{ object_key: unknown }>;
        for (const row of files)
          if (isStorageKey(row.object_key)) this.storageKeys.add(row.object_key);
      }

      await this.tx.execute(sql`delete from ${table(name)} where id in ${part}`);
    }
  }

  /** How many rows went, by table — returned to the caller for the audit record. */
  summary() {
    return Object.fromEntries(
      [...this.deleted].filter(([, ids]) => ids.size).map(([name, ids]) => [name, ids.size]),
    );
  }
}

/**
 * Runs `work` in one transaction with approval records unlocked (they are immutable in
 * normal use; the trigger allows a deliberate, transaction-local purge), then deletes the
 * stored files the purge collected.
 */
export async function purge(
  work: (purge: Purge) => Promise<void>,
  options: { alsoFollow?: (edge: Edge) => boolean } = {},
) {
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('rexops.allow_approval_mutation', 'on', true)`);
    const run = new Purge(tx, options.alsoFollow);
    await work(run);
    return { summary: run.summary(), storageKeys: [...run.storageKeys] };
  });
  // Files go after the rows are gone for good. A file that fails to delete is only
  // wasted space, never a broken link, so this is best effort.
  await Promise.allSettled(result.storageKeys.map((key) => objectStorage.deleteObject(key)));
  return result.summary;
}

export function resetPurgeGraphForTests() {
  graph = null;
}
