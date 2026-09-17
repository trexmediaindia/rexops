const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

/** Carries the status so callers (and the query client's retry rule) can tell a
 *  refused request from a flaky one. */
export class RequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "RequestError";
    this.status = status;
  }
}

/**
 * Single fetch helper for the authenticated JSON API.
 *
 * Routes used to each define a private copy of this; the copies swallowed the
 * server's error body and surfaced a bare status code, so a failed create looked
 * identical to a network blip. This one lifts `message`/`error` off the response
 * so the UI can show what actually went wrong.
 */
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new RequestError(await errorMessage(response), response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function errorMessage(response: Response) {
  try {
    const body = (await response.json()) as { message?: string; error?: string };
    if (body.message) return body.message;
    if (body.error) {
      if (body.error === "UNAUTHORIZED") return "Your session expired. Sign in again.";
      if (body.error === "FORBIDDEN") return "Your role does not have access to this.";
      if (body.error === "NOT_FOUND") return "That item no longer exists.";
      if (body.error === "RATE_LIMITED") return "Too many requests. Try again shortly.";
      // Sentence case, not lowercase: this string is shown as prose, and
      // "forbidden" mid-sentence read like a typo rather than a message.
      const words = body.error.replaceAll("_", " ").toLowerCase();
      return words.charAt(0).toUpperCase() + words.slice(1);
    }
  } catch {
    // Non-JSON body — fall through to the status line.
  }
  return `Request failed (${response.status})`;
}
