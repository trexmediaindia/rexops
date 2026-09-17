import { Elysia } from "elysia";

const publicRequests = new Map<string, { count: number; resetAt: number }>();

function requestAddress(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "local"
  );
}

export function consumeRateLimit(key: string, now = Date.now()) {
  const current = publicRequests.get(key);
  const entry =
    !current || current.resetAt <= now
      ? { count: 1, resetAt: now + 60_000 }
      : { count: current.count + 1, resetAt: current.resetAt };
  publicRequests.set(key, entry);
  return {
    allowed: entry.count <= 60,
    remaining: Math.max(0, 60 - entry.count),
    retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000),
  };
}

export const securityPlugin = new Elysia({ name: "security" })
  .onBeforeHandle({ as: "global" }, ({ request, set }) => {
    const path = new URL(request.url).pathname;
    if (!path.startsWith("/api/public/") && !path.startsWith("/api/auth/")) return;
    const now = Date.now();
    const key = `${requestAddress(request)}:${path.split("/").slice(0, 4).join("/")}`;
    const limit = consumeRateLimit(key, now);
    set.headers["x-ratelimit-limit"] = "60";
    set.headers["x-ratelimit-remaining"] = String(limit.remaining);
    if (!limit.allowed) {
      set.status = 429;
      set.headers["retry-after"] = String(limit.retryAfterSeconds);
      return { error: "RATE_LIMITED", message: "Too many requests. Try again shortly." };
    }
  })
  .onAfterHandle({ as: "global" }, ({ set }) => {
    set.headers["x-content-type-options"] = "nosniff";
    set.headers["referrer-policy"] = "strict-origin-when-cross-origin";
    set.headers["permissions-policy"] = "camera=(), microphone=(), geolocation=()";
    set.headers["cross-origin-resource-policy"] = "same-site";
  });

export function clearRateLimitsForTests() {
  publicRequests.clear();
}
