import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://rexops:rexops@localhost:5433/rexops";

export const sql = postgres(connectionString, {
  max: process.env.NODE_ENV === "test" ? 2 : 10,
  prepare: false,
});

export const db = drizzle(sql, { schema });

export type Database = typeof db;
