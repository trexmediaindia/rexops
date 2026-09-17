/*
 * Creates, migrates and seeds the database the API suite runs against.
 *
 * The suite deliberately points at its own database (see .env.test) rather than
 * the one `bun run dev` is using, so that database has to be brought into
 * existence somewhere. Doing it here keeps `bun run test` from being a trap for
 * anyone who has only ever run the dev setup.
 */
// Bun's built-in client, so this script needs no dependency of its own — the
// root workspace has none, and reaching into packages/db for one would make a
// setup script depend on the thing it is setting up.
import { SQL } from "bun";

const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Run this through `bun run db:test:prepare`.");
}

const url = new URL(connectionString);
const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
if (!databaseName) {
  throw new Error(`No database name in ${url.host}${url.pathname}`);
}

// CREATE DATABASE cannot run inside the database it creates, so connect to the
// server's default one first.
const adminUrl = new URL(url);
adminUrl.pathname = "/postgres";
const admin = new SQL({ url: adminUrl.toString(), max: 1 });

try {
  const [existing] = await admin`select 1 from pg_database where datname = ${databaseName}`;
  if (existing) {
    console.log(`Test database ${databaseName} already exists.`);
  } else {
    // Identifiers cannot be parameterised; the name comes from our own env file
    // and is quoted, so this is not a user-supplied string.
    await admin.unsafe(`create database "${databaseName.replace(/"/g, '""')}"`);
    console.log(`Created test database ${databaseName}.`);
  }
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  throw new Error(
    `Could not reach Postgres at ${url.host}: ${reason}\n` +
      "Start it with `docker compose up -d postgres`, or set POSTGRES_PORT and\n" +
      "DATABASE_URL in .env.test.local if something else already owns that port.",
  );
} finally {
  await admin.end();
}

for (const step of ["db:migrate", "db:seed"]) {
  const child = Bun.spawn(["bun", "run", step], {
    stdio: ["inherit", "inherit", "inherit"],
    env: {
      ...process.env,
      DATABASE_URL: connectionString,
      DATABASE_URL_UNPOOLED: connectionString,
    },
  });
  const code = await child.exited;
  if (code !== 0) throw new Error(`\`bun run ${step}\` failed against ${databaseName}.`);
}

console.log(`Test database ${databaseName} is ready.`);
