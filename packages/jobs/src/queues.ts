import { Queue } from "bullmq";
import type {
  AutomationJobPayload,
  MediaJobPayload,
  NoopJobPayload,
  NotifyJobPayload,
} from "./payloads";

export const QUEUE_NAMES = {
  noop: "rexops-noop",
  notify: "rexops-notify",
  media: "rexops-media",
  automation: "rexops-automation",
} as const;

function connectionFromUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    tls: parsed.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

export function createNoopQueue(redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379") {
  return new Queue<NoopJobPayload>(QUEUE_NAMES.noop, {
    connection: connectionFromUrl(redisUrl),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  });
}

export function createNotifyQueue(redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379") {
  return new Queue<NotifyJobPayload>(QUEUE_NAMES.notify, {
    connection: connectionFromUrl(redisUrl),
    defaultJobOptions: {
      attempts: 4,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 500,
      removeOnFail: 1000,
    },
  });
}

export function createMediaQueue(redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379") {
  return new Queue<MediaJobPayload>(QUEUE_NAMES.media, {
    connection: connectionFromUrl(redisUrl),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  });
}

export function createAutomationQueue(
  redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379",
) {
  return new Queue<AutomationJobPayload>(QUEUE_NAMES.automation, {
    connection: connectionFromUrl(redisUrl),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 500,
      removeOnFail: 1000,
    },
  });
}

export { connectionFromUrl };
