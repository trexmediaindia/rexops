import { createNotifyQueue } from "@rexops/jobs";

export async function ensureJobSchedulers() {
  // Due-date reminders and "stalled review" nudges are in-app notifications, so they run in
  // every deployment, with or without live collaboration.
  const queue = createNotifyQueue();
  await Promise.all([
    queue.upsertJobScheduler(
      "due-date-reminders",
      { pattern: "0 0 * * * *" },
      {
        name: "scan-due-reminders",
        data: {
          eventId: "scheduler:due-date-reminders",
          agencyId: null,
          eventType: "SCAN_DUE_REMINDERS",
          payload: {},
        },
      },
    ),
    queue.upsertJobScheduler(
      "stalled-review-stages",
      { pattern: "0 */15 * * * *" },
      {
        name: "scan-stalled-stages",
        data: {
          eventId: "scheduler:stalled-review-stages",
          agencyId: null,
          eventType: "SCAN_STALLED_STAGES",
          payload: {},
        },
      },
    ),
  ]);
  await queue.close();
}
