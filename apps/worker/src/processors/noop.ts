import type { NoopJobPayload } from "@rexops/jobs";
import type { Job } from "bullmq";

export async function processNoop(job: Job<NoopJobPayload>) {
  return {
    consumed: true,
    eventId: job.data.eventId,
    eventType: job.data.eventType,
  };
}
