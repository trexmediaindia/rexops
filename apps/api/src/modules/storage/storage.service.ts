import type { Principal } from "@rexops/core";
import { assertWritablePrincipal, ForbiddenError, NotFoundError } from "@rexops/core";
import { agencies, attachments, auditLogs, db, fileVersions } from "@rexops/db";
import { and, eq, isNull, sql } from "drizzle-orm";

/** Default allowance for a tenant that has never had one set. 100 GB. */
export const DEFAULT_QUOTA_BYTES = 100 * 1024 * 1024 * 1024;

const MIN_QUOTA_BYTES = 1024 * 1024 * 1024;
const MAX_QUOTA_BYTES = 100 * 1024 * 1024 * 1024 * 1024;

/**
 * What the tenant is actually holding, summed in Postgres.
 *
 * Two tables carry bytes: promoted deliverable versions and comment/message
 * attachments. Both are `bigint`, so the sums come back as strings and are
 * narrowed to `number` here — 2^53 bytes is 9 PB, far past any real quota.
 */
export async function getStorageUsage(principal: Principal) {
  if (principal.role.startsWith("CLIENT_")) throw new ForbiddenError();
  if (!principal.agencyId) throw new ForbiddenError();
  const agencyId = principal.agencyId;

  const [agency] = await db.select().from(agencies).where(eq(agencies.id, agencyId)).limit(1);
  if (!agency || agency.deletedAt) throw new NotFoundError();

  const [versions] = await db
    .select({
      bytes: sql<string>`coalesce(sum(${fileVersions.fileSizeBytes}), 0)`,
      files: sql<string>`count(*)`,
    })
    .from(fileVersions)
    .where(and(eq(fileVersions.agencyId, agencyId), isNull(fileVersions.deletedAt)));

  const [claimed] = await db
    .select({
      bytes: sql<string>`coalesce(sum(${attachments.fileSizeBytes}), 0)`,
      files: sql<string>`count(*)`,
    })
    .from(attachments)
    .where(and(eq(attachments.agencyId, agencyId), eq(attachments.status, "CLAIMED")));

  const versionBytes = Number(versions?.bytes ?? 0);
  const attachmentBytes = Number(claimed?.bytes ?? 0);
  const quotaBytes = readQuota(agency.settings);

  return {
    usedBytes: versionBytes + attachmentBytes,
    quotaBytes,
    versionBytes,
    attachmentBytes,
    versionCount: Number(versions?.files ?? 0),
    attachmentCount: Number(claimed?.files ?? 0),
  };
}

export async function setStorageQuota(principal: Principal, quotaBytes: number) {
  if (!["AGENCY_OWNER", "AGENCY_ADMIN", "SUPER_ADMIN"].includes(principal.role)) {
    throw new ForbiddenError();
  }
  assertWritablePrincipal(principal);
  if (!principal.agencyId) throw new ForbiddenError();
  if (quotaBytes < MIN_QUOTA_BYTES || quotaBytes > MAX_QUOTA_BYTES) {
    throw new ForbiddenError("Quota must be between 1 GB and 100 TB.");
  }

  const [agency] = await db
    .select()
    .from(agencies)
    .where(eq(agencies.id, principal.agencyId))
    .limit(1);
  if (!agency || agency.deletedAt) throw new NotFoundError();

  await db
    .update(agencies)
    .set({ settings: { ...agency.settings, storageQuotaBytes: quotaBytes } })
    .where(eq(agencies.id, agency.id));
  await db.insert(auditLogs).values({
    actorUserId: principal.userId,
    agencyId: agency.id,
    action: "STORAGE_QUOTA_CHANGED",
    targetType: "agency",
    targetId: agency.id,
    meta: { quotaBytes },
  });

  return getStorageUsage(principal);
}

function readQuota(settings: Record<string, unknown>) {
  const raw = settings?.storageQuotaBytes;
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_QUOTA_BYTES;
}
