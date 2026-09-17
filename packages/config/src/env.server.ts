import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().optional(),
);
const optionalUrl = z.preprocess((value) => (value === "" ? undefined : value), z.url().optional());

export const serverEnv = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_PORT: z.coerce.number().int().positive().default(3000),
    API_URL: z.url(),
    WEB_URL: z.url(),
    DATABASE_URL: z.string().min(1),
    DATABASE_URL_UNPOOLED: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    GOOGLE_CLIENT_ID: optionalString,
    GOOGLE_CLIENT_SECRET: optionalString,
    RESEND_API_KEY: optionalString,
    EMAIL_FROM: optionalString,
    R2_ACCOUNT_ID: optionalString,
    R2_ACCESS_KEY_ID: optionalString,
    R2_SECRET_ACCESS_KEY: optionalString,
    R2_BUCKET: z.string().default("rexops-media"),
    R2_ENDPOINT: optionalUrl,
    R2_PUBLIC_BASE_URL: optionalUrl,
    LOCAL_STORAGE_DIRECTORY: z.string().default(".data/object-storage"),
    LOCAL_STORAGE_SIGNING_SECRET: optionalString,
    LIVEBLOCKS_SECRET_KEY: optionalString,
    REDIS_URL: z.string().min(1),
    VAPID_PUBLIC_KEY: optionalString,
    VAPID_PRIVATE_KEY: optionalString,
    VAPID_SUBJECT: optionalString,
    OPENFEATURE_PROVIDER: z.enum(["memory", "posthog", "unleash"]).default("memory"),
    POSTHOG_KEY: optionalString,
    SENTRY_DSN: optionalUrl,
    MEDIA_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
    NOTIFY_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(8),
    AUTOMATION_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(4),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
