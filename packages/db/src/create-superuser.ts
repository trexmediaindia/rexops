/*
 * Creates the platform admin: the one login that sees every agency, can add, suspend,
 * restore and delete agencies, and belongs to none of them. Run it on the server:
 *
 *   SUPERUSER_EMAIL="you@example.com" SUPERUSER_NAME="Your name" \
 *   bun packages/db/src/create-superuser.ts
 *
 * Leave SUPERUSER_PASSWORD out and a strong temporary one is generated and printed once.
 *
 * Emails are unique across the whole app, so an address that already signs in to an
 * agency cannot also be the platform admin. Use a second address, or the same inbox
 * with a +tag (you+admin@gmail.com reaches the same Gmail inbox).
 */
import { randomBytes } from "node:crypto";
import { createId } from "@paralleldrive/cuid2";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { db, sql } from "./client";
import { accounts, users } from "./schema";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function createSuperuser() {
  const email = required("SUPERUSER_EMAIL").toLowerCase();
  const name = process.env.SUPERUSER_NAME?.trim() || "Platform admin";
  const given = process.env.SUPERUSER_PASSWORD?.trim();
  if (given && given.length < 12)
    throw new Error("SUPERUSER_PASSWORD must be at least 12 characters.");
  const password = given || randomBytes(12).toString("base64url");

  const [existing] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing?.role === "SUPER_ADMIN") {
    console.log(`${email} is already the platform admin; nothing to do.`);
    return;
  }
  if (existing) {
    const [local, domain] = email.split("@");
    throw new Error(
      `${email} already signs in to an agency, and one email can only be one login.\n` +
        `Use another address, for example ${local}+admin@${domain} (it arrives in the same inbox).`,
    );
  }

  const userId = createId();
  await db.transaction(async (tx) => {
    await tx.insert(users).values({
      id: userId,
      name,
      email,
      emailVerified: true,
      role: "SUPER_ADMIN",
      agencyId: null,
      permissions: {
        canApprove: true,
        canInviteClients: true,
        canManageTeam: true,
        canUploadFinal: true,
        canViewAllClients: true,
        canManageAutomations: true,
      },
    });
    await tx.insert(accounts).values({
      id: createId(),
      accountId: userId,
      providerId: "credential",
      userId,
      password: await hashPassword(password),
      updatedAt: new Date(),
    });
  });

  console.log(`Created the platform admin ${email}.`);
  if (!given) {
    console.log(`Temporary password (shown once): ${password}`);
    console.log("Keep it somewhere safe; it is not stored anywhere readable.");
  }
}

createSuperuser()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
