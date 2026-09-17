import { ConflictError, ForbiddenError, InvalidTransitionError, NotFoundError } from "@rexops/core";
import { Elysia } from "elysia";
import pino from "pino";

const logger = pino({ name: "rexops-api" });

export const errorPlugin = new Elysia({ name: "error-handler" }).onError(
  { as: "global" },
  ({ code, error, request, set }) => {
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
    if (error instanceof NotFoundError) {
      set.status = 404;
      return { error: "NOT_FOUND", message: error.message, requestId };
    }
    if (error instanceof ForbiddenError) {
      set.status = 403;
      return { error: "FORBIDDEN", message: error.message, requestId };
    }
    if (error instanceof InvalidTransitionError) {
      set.status = 409;
      return { error: "INVALID_TRANSITION", message: error.message, requestId };
    }
    if (error instanceof ConflictError) {
      set.status = 409;
      return { error: error.message, message: error.message, requestId };
    }
    // Zod rejections from `schema.parse(body)` in the services. Elysia only
    // classifies its own `t.Object` failures as VALIDATION, so without this a
    // bad payload that clears the Elysia schema surfaced as a 500.
    const zodMessage = zodIssueMessage(error);
    if (zodMessage) {
      set.status = 422;
      return { error: "VALIDATION_ERROR", message: zodMessage, requestId };
    }
    if (code === "VALIDATION") {
      set.status = 422;
      return { error: "VALIDATION_ERROR", message: error.message, requestId };
    }

    logger.error({ code, error, requestId }, "request failed");
    set.status = 500;
    return {
      error: "INTERNAL_ERROR",
      message: "The request could not be completed.",
      requestId,
    };
  },
);

type ZodIssue = { path?: Array<string | number>; message?: string };

/** Reads the first issue off a Zod error without making the API depend on zod. */
function zodIssueMessage(error: unknown): string | null {
  if (!(error instanceof Error) || error.name !== "ZodError") return null;
  const issues = (error as Error & { issues?: ZodIssue[] }).issues;
  const first = issues?.[0];
  if (!first?.message) return "The request body is not valid.";
  const field = first.path?.filter((part) => part !== "").join(".");
  return field ? `${field}: ${first.message}` : first.message;
}
