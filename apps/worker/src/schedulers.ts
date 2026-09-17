import { featureRegistry } from "@rexops/core";
import { createNotifyQueue } from "@rexops/jobs";

export async function ensureJobSchedulers() {
  const features = featureRegistry();
  if (!features["collaboration.live"]) return;
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
