import { serverEnv } from "@rexops/config/env/server";
import { featureRegistry } from "@rexops/core";
import { connectionFromUrl, QUEUE_NAMES } from "@rexops/jobs";
import { Worker } from "bullmq";
import pino from "pino";
import { processAutomation } from "./processors/automation";
import { processMedia } from "./processors/media";
import { processNoop } from "./processors/noop";
import { processNotify } from "./processors/notify";
import { closeRelayQueues, relayPendingOutbox } from "./relay";
import { ensureJobSchedulers } from "./schedulers";

const logger = pino({ name: "rexops-worker" });
const redisUrl = serverEnv.REDIS_URL;
const features = featureRegistry();

const noopWorker = new Worker(QUEUE_NAMES.noop, processNoop, {
  connection: connectionFromUrl(redisUrl),
});
const mediaWorker = new Worker(QUEUE_NAMES.media, processMedia, {
  connection: connectionFromUrl(redisUrl),
  concurrency: serverEnv.MEDIA_WORKER_CONCURRENCY,
});
const notifyWorker = new Worker(QUEUE_NAMES.notify, processNotify, {
  connection: connectionFromUrl(redisUrl),
  concurrency: serverEnv.NOTIFY_WORKER_CONCURRENCY,
});
const automationWorker = features.automation
  ? new Worker(QUEUE_NAMES.automation, processAutomation, {
      connection: connectionFromUrl(redisUrl),
      concurrency: serverEnv.AUTOMATION_WORKER_CONCURRENCY,
    })
  : null;

const workers = [noopWorker, mediaWorker, notifyWorker, automationWorker].filter(
  (worker): worker is Worker => worker !== null,
);
for (const worker of workers) {
  worker.on("completed", (job) =>
    logger.info({ jobId: job.id, queue: worker.name }, "job completed"),
  );
  worker.on("failed", (job, error) =>
    logger.error({ jobId: job?.id, queue: worker.name, error }, "job failed"),
  );
}

let relayInFlight = false;
const relayTimer = setInterval(async () => {
  if (relayInFlight) return;
  relayInFlight = true;
  try {
    await relayPendingOutbox();
  } catch (error) {
    logger.error({ error }, "outbox relay failed");
  } finally {
    relayInFlight = false;
  }
}, 2000);
void ensureJobSchedulers().catch((error) => logger.error({ error }, "job scheduler setup failed"));

async function shutdown() {
  clearInterval(relayTimer);
  await Promise.all([
    noopWorker.close(),
    mediaWorker.close(),
    notifyWorker.close(),
    automationWorker?.close(),
    closeRelayQueues(),
  ]);
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

logger.info("worker started");
