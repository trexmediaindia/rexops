import {
  activityEvents,
  db,
  deliverables,
  notifications,
  pushSubscriptions,
  reviewStageApprovers,
  reviewStages,
  users,
} from "@rexops/db";
import type { NotifyJobPayload } from "@rexops/jobs";
import type { Job } from "bullmq";
import { and, eq, gt, inArray, isNull, lt, or } from "drizzle-orm";
import webpush from "web-push";
import { broadcastUserNotification } from "../lib/liveblocks";

type UserRow = typeof users.$inferSelect;
type DeliverableRow = typeof deliverables.$inferSelect;

export function eligibleInternalReviewers(
  deliverable: Pick<DeliverableRow, "contentType">,
  candidates: Array<Pick<UserRow, "id" | "role" | "specialty" | "permissions">>,
) {
  return candidates
    .filter((user) => {
      if (user.role === "AGENCY_OWNER" || user.role === "AGENCY_ADMIN") return true;
      const permissions = user.permissions as Record<string, boolean>;
      if (permissions.canApprove !== true) return false;
      if (deliverable.contentType === "MOTION") {
        return user.specialty === "MOTION" || user.specialty === "EDITOR";
      }
      if (deliverable.contentType === "STATIC") return user.specialty === "DESIGNER";
      return true;
    })
    .map((user) => user.id);
}

async function usersForAgency(agencyId: string) {
  return db
    .select()
    .from(users)
    .where(and(eq(users.agencyId, agencyId), isNull(users.deletedAt)));
}

async function resolveRecipients(event: NotifyJobPayload, deliverable: DeliverableRow | null) {
  if (!event.agencyId) return [];
  const candidates = await usersForAgency(event.agencyId);
  if (event.eventType === "INTERNAL_REVIEW_REQUESTED" && deliverable) {
    const stageId = event.payload.reviewStageId;
    if (typeof stageId === "string") {
      const configured = await db
        .select({ userId: reviewStageApprovers.userId })
        .from(reviewStageApprovers)
        .where(eq(reviewStageApprovers.reviewStageId, stageId));
      if (configured.length) return configured.map((row) => row.userId);
    }
    return eligibleInternalReviewers(deliverable, candidates);
  }
  if (event.eventType === "SUBMITTED_TO_CLIENT" && deliverable) {
    return candidates
      .filter((user) => user.clientId === deliverable.clientId && user.role.startsWith("CLIENT_"))
      .map((user) => user.id);
  }
  if (event.eventType === "COMMENT_ADDED" && deliverable) {
    const actorUserId = event.payload.actorUserId;
    const recipients = new Set<string>();
    if (deliverable.assignedToUserId) recipients.add(deliverable.assignedToUserId);
    for (const user of candidates) {
      if (user.role === "AGENCY_OWNER" || user.role === "AGENCY_ADMIN") recipients.add(user.id);
      if (
        event.payload.visibility === "CLIENT_VISIBLE" &&
        user.clientId === deliverable.clientId &&
        user.role.startsWith("CLIENT_")
      ) {
        recipients.add(user.id);
      }
    }
    if (typeof actorUserId === "string") recipients.delete(actorUserId);
    return [...recipients];
  }
  if (deliverable) {
    const recipients = new Set<string>();
    if (deliverable.assignedToUserId) recipients.add(deliverable.assignedToUserId);
    for (const user of candidates) {
      if (user.role === "AGENCY_OWNER" || user.role === "AGENCY_ADMIN") recipients.add(user.id);
    }
    return [...recipients];
  }
  return candidates
    .filter((user) => user.role === "AGENCY_OWNER" || user.role === "AGENCY_ADMIN")
    .map((user) => user.id);
}

const copyByEvent: Record<
  string,
  { type: typeof notifications.$inferInsert.type; title: string; message: string }
> = {
  INTERNAL_REVIEW_REQUESTED: {
    type: "INTERNAL_REVIEW_REQUESTED",
    title: "A cut needs internal review",
    message: "Open the review room and record a decision.",
  },
  SUBMITTED_TO_CLIENT: {
    type: "SUBMITTED_TO_CLIENT",
    title: "A new cut is ready for you",
    message: "Review the latest version and leave precise feedback.",
  },
  REVISION_REQUESTED: {
    type: "REVISION_REQUESTED",
    title: "Changes were requested",
    message: "Open the review thread for the requested revision.",
  },
  APPROVED: {
    type: "APPROVED",
    title: "The cut was approved",
    message: "The approval and signature are recorded.",
  },
  DELIVERED: {
    type: "DELIVERED",
    title: "Work was delivered",
    message: "The deliverable has completed its review path.",
  },
  COMMENT_ADDED: {
    type: "COMMENT_ADDED",
    title: "New review comment",
    message: "A new note was added to the review thread.",
  },
  MENTION: {
    type: "MENTION",
    title: "You were mentioned",
    message: "Open the conversation to view the mention.",
  },
  SHARE_VIEWED: {
    type: "SHARE_VIEWED",
    title: "A review link was opened",
    message: "A guest viewed the shared cut.",
  },
  ASSIGNMENT: {
    type: "ASSIGNMENT",
    title: "Work was assigned to you",
    message: "Open the deliverable to see the next action.",
  },
};

const activityCopy: Record<
  string,
  { type: typeof activityEvents.$inferInsert.type; summary: string; clientVisible?: boolean }
> = {
  DELIVERABLE_CREATED: { type: "STATUS_CHANGE", summary: "Deliverable created" },
  DELIVERABLE_STATUS_CHANGED: { type: "STATUS_CHANGE", summary: "Deliverable status changed" },
  VERSION_UPLOADED: { type: "UPLOAD", summary: "Version uploaded" },
  COMPANION_PREVIEW_ATTACHED: { type: "UPLOAD", summary: "Companion preview attached" },
  INTERNAL_REVIEW_REQUESTED: { type: "STAGE_CHANGE", summary: "Internal review started" },
  REVIEW_STAGE_ACTIVATED: { type: "STAGE_CHANGE", summary: "Review stage activated" },
  REVIEW_DECISION_RECORDED: { type: "APPROVAL", summary: "Review decision recorded" },
  SUBMITTED_TO_CLIENT: {
    type: "STAGE_CHANGE",
    summary: "Submitted to client",
    clientVisible: true,
  },
  REVISION_REQUESTED: {
    type: "APPROVAL",
    summary: "Changes requested",
    clientVisible: true,
  },
  APPROVED: { type: "APPROVAL", summary: "Approved", clientVisible: true },
  DELIVERED: { type: "STATUS_CHANGE", summary: "Delivered", clientVisible: true },
  COMMENT_ADDED: { type: "COMMENT", summary: "Comment added" },
  MENTION: { type: "COMMENT", summary: "Mention added" },
  SHARE_VIEWED: { type: "SHARE", summary: "Share viewed" },
  ASSIGNMENT: { type: "ASSIGNMENT", summary: "Assignment changed" },
};

async function projectActivity(event: NotifyJobPayload, deliverable: DeliverableRow | null) {
  const copy = activityCopy[event.eventType];
  if (!copy || !deliverable) return 0;
  const visibility =
    copy.clientVisible || event.payload.visibility === "CLIENT_VISIBLE"
      ? ("CLIENT_VISIBLE" as const)
      : ("INTERNAL" as const);
  const values: Array<typeof activityEvents.$inferInsert> = [
    {
      agencyId: deliverable.agencyId,
      subjectType: "DELIVERABLE",
      subjectId: deliverable.id,
      type: copy.type,
      actorUserId: typeof event.payload.actorUserId === "string" ? event.payload.actorUserId : null,
      summary: copy.summary,
      visibility,
      sourceEventId: event.eventId,
      meta: event.payload,
    },
  ];
  if (typeof event.payload.fileVersionId === "string") {
    values.push({
      agencyId: deliverable.agencyId,
      subjectType: "FILE_VERSION",
      subjectId: event.payload.fileVersionId,
      type: copy.type,
      actorUserId: typeof event.payload.actorUserId === "string" ? event.payload.actorUserId : null,
      summary: copy.summary,
      visibility,
      sourceEventId: event.eventId,
      meta: event.payload,
    });
  }
  await db.insert(activityEvents).values(values).onConflictDoNothing();
  return values.length;
}

async function sendPush(recipientIds: string[], payload: Record<string, unknown>) {
  if (
    !process.env.VAPID_PUBLIC_KEY ||
    !process.env.VAPID_PRIVATE_KEY ||
    !process.env.VAPID_SUBJECT
  ) {
    return;
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
  const subscriptions = await db
    .select()
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, recipientIds));
  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify(payload),
          { TTL: 3600, urgency: "normal" },
        );
        await db
          .update(pushSubscriptions)
          .set({ lastUsedAt: new Date() })
          .where(eq(pushSubscriptions.id, subscription.id));
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscription.id));
        }
      }
    }),
  );
}

async function processEventNotification(job: Job<NotifyJobPayload>) {
  const deliverableId = job.data.payload.deliverableId;
  const [deliverable] =
    typeof deliverableId === "string"
      ? await db.select().from(deliverables).where(eq(deliverables.id, deliverableId)).limit(1)
      : [null];
  const projected = await projectActivity(job.data, deliverable ?? null);
  const copy = copyByEvent[job.data.eventType];
  if (!copy) return { notified: 0, projected };
  const recipientIds = await resolveRecipients(job.data, deliverable ?? null);
  if (job.data.eventType === "MENTION" && typeof job.data.payload.mentionedUserId === "string") {
    recipientIds.splice(0, recipientIds.length, job.data.payload.mentionedUserId);
  }
  if (!recipientIds.length) return { notified: 0, projected };
  const recipientRows = await db.select().from(users).where(inArray(users.id, recipientIds));
  const candidatesById = new Map(recipientRows.map((recipient) => [recipient.id, recipient]));
  const inserted = await db.transaction(async (tx) => {
    return tx
      .insert(notifications)
      .values(
        recipientIds.map((recipientUserId) => {
          const recipient = candidatesById.get(recipientUserId);
          const client = recipient?.role.startsWith("CLIENT_");
          const url = deliverable
            ? client
              ? `/client/review/${deliverable.id}`
              : `/agency/review/${deliverable.id}`
            : client
              ? "/client/home"
              : "/agency/inbox";
          return {
            agencyId: job.data.agencyId,
            recipientUserId,
            sourceEventId: job.data.eventId,
            type: copy.type,
            title: copy.title,
            message: copy.message,
            url,
            contentType: deliverable?.contentType,
            relatedProjectId: deliverable?.projectId,
            relatedDeliverableId: deliverable?.id,
          };
        }),
      )
      .onConflictDoNothing()
      .returning({
        recipientUserId: notifications.recipientUserId,
        title: notifications.title,
        url: notifications.url,
      });
  });
  const insertedRecipients = inserted.flatMap((row) =>
    row.recipientUserId ? [row.recipientUserId] : [],
  );
  await Promise.all(
    inserted.map((row) =>
      row.recipientUserId
        ? broadcastUserNotification(row.recipientUserId, {
            title: row.title,
            url: row.url,
          }).catch(() => false)
        : false,
    ),
  );
  const byUrl = new Map<string, string[]>();
  for (const row of inserted) {
    if (!row.recipientUserId) continue;
    const url = row.url ?? "/agency/inbox";
    byUrl.set(url, [...(byUrl.get(url) ?? []), row.recipientUserId]);
  }
  await Promise.all(
    [...byUrl].map(([url, ids]) =>
      sendPush(ids, {
        title: copy.title,
        body: copy.message,
        icon: "/icons/icon-192.png",
        badge: "/icons/badge-96.png",
        data: { url },
      }),
    ),
  );
  return { notified: insertedRecipients.length, projected };
}

export async function scanDueReminders(now = new Date()) {
  const until = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ stage: reviewStages, deliverable: deliverables })
    .from(reviewStages)
    .innerJoin(deliverables, eq(deliverables.id, reviewStages.deliverableId))
    .where(
      and(
        eq(reviewStages.status, "ACTIVE"),
        gt(reviewStages.dueAt, now),
        lt(reviewStages.dueAt, until),
      ),
    );
  for (const { stage, deliverable } of rows) {
    const approvers = await db
      .select({ userId: reviewStageApprovers.userId })
      .from(reviewStageApprovers)
      .where(eq(reviewStageApprovers.reviewStageId, stage.id));
    const recipientIds = approvers.length
      ? approvers.map((approver) => approver.userId)
      : deliverable.assignedToUserId
        ? [deliverable.assignedToUserId]
        : [];
    for (const recipientUserId of recipientIds) {
      await db
        .insert(notifications)
        .values({
          agencyId: deliverable.agencyId,
          recipientUserId,
          sourceEventId: `stage-reminder:${stage.id}`,
          type: "DUE_DATE_REMINDER",
          title: `${stage.name} is due within 24 hours`,
          message: deliverable.title,
          url: `/agency/deliverables/${deliverable.id}`,
          contentType: deliverable.contentType,
          relatedProjectId: deliverable.projectId,
          relatedDeliverableId: deliverable.id,
        })
        .onConflictDoNothing();
    }
  }
  return rows.length;
}

export async function scanStalledStages(now = new Date()) {
  const stages = await db
    .select({ stage: reviewStages, deliverable: deliverables })
    .from(reviewStages)
    .innerJoin(deliverables, eq(deliverables.id, reviewStages.deliverableId))
    .where(
      and(
        eq(reviewStages.status, "ACTIVE"),
        or(
          eq(deliverables.status, "UNDER_INTERNAL_REVIEW"),
          eq(deliverables.status, "UNDER_CLIENT_REVIEW"),
        ),
      ),
    );
  let created = 0;
  for (const { stage, deliverable } of stages) {
    if (!stage.dueAt || stage.dueAt > now) continue;
    const recipientIds = stage.escalateToUserId
      ? [stage.escalateToUserId]
      : (await usersForAgency(deliverable.agencyId))
          .filter((user) => user.role === "AGENCY_OWNER" || user.role === "AGENCY_ADMIN")
          .map((user) => user.id);
    for (const recipientUserId of recipientIds) {
      await db
        .insert(notifications)
        .values({
          agencyId: deliverable.agencyId,
          recipientUserId,
          sourceEventId: `stage-stalled:${stage.id}`,
          type: "STAGE_STALLED",
          title: `${stage.name} is stalled`,
          message: deliverable.title,
          url: `/agency/review/${deliverable.id}`,
          contentType: deliverable.contentType,
          relatedProjectId: deliverable.projectId,
          relatedDeliverableId: deliverable.id,
        })
        .onConflictDoNothing();
      created += 1;
    }
    if (stage.escalateToUserId && deliverable.assignedToUserId !== stage.escalateToUserId) {
      await db
        .update(deliverables)
        .set({ assignedToUserId: stage.escalateToUserId })
        .where(eq(deliverables.id, deliverable.id));
    }
  }
  return created;
}

export async function processNotify(job: Job<NotifyJobPayload>) {
  if (job.data.eventType === "SCAN_DUE_REMINDERS") {
    return { scanned: await scanDueReminders() };
  }
  if (job.data.eventType === "SCAN_STALLED_STAGES") {
    return { scanned: await scanStalledStages() };
  }
  return processEventNotification(job);
}
