import { db } from "@rexops/db";
import { sql } from "drizzle-orm";
import { Elysia } from "elysia";

export const healthRoutes = new Elysia()
  .get("/healthz", () => ({ status: "ok", service: "rexops-api" }))
  .get("/readyz", async ({ set }) => {
    try {
      await db.execute(sql`select 1`);
      return { status: "ready", database: "ok" };
    } catch {
      set.status = 503;
      return { status: "not-ready", database: "unavailable" };
    }
  });
