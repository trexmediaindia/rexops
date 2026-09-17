/*
 * Fails the suite once, legibly, when its database is not ready.
 *
 * Every test file calls `ensureTestFixtures()`, so an unreachable or unseeded
 * database used to surface as one raw Drizzle/Postgres stack trace per test —
 * thirty of them, none of which said what to actually do. Bun runs this before
 * any test file, so the run stops here with a single instruction instead.
 */
import { agencies, db } from "@rexops/db";
import { eq } from "drizzle-orm";

const connectionString = process.env.DATABASE_URL ?? "(DATABASE_URL is unset)";
const target = (() => {
  try {
    const url = new URL(connectionString);
    return `${url.host}${url.pathname}`;
  } catch {
    return connectionString;
  }
})();

function abort(detail: string): never {
  /*
   * Not `throw`: a preload that throws is reported and then every test file runs
   * anyway, which is the wall of stack traces this exists to prevent. Exiting is
   * what actually stops the run at the one message worth reading.
   */
  console.error(
    [
      "",
      `Test database not ready at ${target}.`,
      `  ${detail}`,
      "",
      "  docker compose up -d postgres",
      "  bun run db:test:prepare",
      "",
      "If something else already owns that port, set POSTGRES_PORT and DATABASE_URL",
      "in .env.test.local — gitignored, and loaded after .env.test.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

try {
  const [seeded] = await db
    .select({ id: agencies.id })
    .from(agencies)
    .where(eq(agencies.id, "agency_trex"))
    .limit(1);
  // The schema is there but the canonical fixtures are not, and every principal
  // in ./helpers.ts is defined in terms of them.
  if (!seeded) abort("The schema exists but has not been seeded.");
} catch (error) {
  // Drizzle wraps driver failures in a DrizzleQueryError whose message is the
  // SQL it tried to run. The useful part — "database does not exist", "connection
  // refused" — is further down the cause chain.
  let root = error;
  while (root instanceof Error && root.cause) root = root.cause;
  // A refused connection arrives with an empty message and everything useful on
  // `code` (ECONNREFUSED, 3D000 for a missing database), so fall back to that.
  const code =
    typeof (root as { code?: unknown })?.code === "string"
      ? (root as { code: string }).code
      : undefined;
  const message = root instanceof Error ? root.message : String(root);
  abort(message || code || "The connection failed without a reason.");
}
