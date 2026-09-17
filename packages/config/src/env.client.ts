import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export function createClientEnv(runtimeEnv: Record<string, string | boolean | undefined>) {
  return createEnv({
    clientPrefix: "VITE_",
    client: {
      VITE_API_URL: z.url(),
      VITE_LIVEBLOCKS_AUTH_URL: z.url(),
      VITE_VAPID_PUBLIC_KEY: z.string().optional(),
      VITE_SENTRY_DSN: z.url().optional(),
    },
    runtimeEnv,
    emptyStringAsUndefined: true,
  });
}
