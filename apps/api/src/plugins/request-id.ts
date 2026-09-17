import { Elysia } from "elysia";

export const requestIdPlugin = new Elysia({ name: "request-id" })
  .derive(({ request }) => ({
    requestId: request.headers.get("x-request-id") ?? crypto.randomUUID(),
  }))
  .onAfterHandle(({ requestId, set }) => {
    set.headers["x-request-id"] = requestId;
  });
