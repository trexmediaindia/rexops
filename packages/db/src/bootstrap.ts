/*
 * Creates a real workspace on an empty production database: the agency, its owner login,
 * the default Internal → Client review pipeline and the built-in deliverable fields.
 *
 * Unlike seed.ts it creates no demo client, projects or users, and the password is yours,
 * not the public demo password. Run it once after the first deploy:
 *
 *   AGENCY_NAME="T-Rex Media" OWNER_NAME="Manas" OWNER_EMAIL="you@example.com" \
 *   OWNER_PASSWORD="…" bun packages/db/src/bootstrap.ts
 *
 * It refuses to run twice for the same email, so re-running it is harmless.
 */
import { createId } from "@paralleldrive/cuid2";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { db, sql } from "./client";
import {
  accounts,
  agencies,
  customFieldDefs,
  members,
  organizations,
  pipelineStages,
  pipelines,
  users,
} from "./schema";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "agency"
  );
}

async function bootstrap() {
  const agencyName = required("AGENCY_NAME");
  const ownerName = required("OWNER_NAME");
  const ownerEmail = required("OWNER_EMAIL").toLowerCase();
  const ownerPassword = required("OWNER_PASSWORD");
  if (ownerPassword.length < 12) throw new Error("OWNER_PASSWORD must be at least 12 characters.");
  if (ownerPassword === "rexops-demo")
    throw new Error("Choose a password other than the demo one.");

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, ownerEmail))
    .limit(1);
  if (existing) {
    console.log(`${ownerEmail} already exists; nothing to do.`);
    return;
  }

  const agencyId = createId();
  const ownerId = createId();
  const pipelineId = createId();
  const organizationId = createId();
  const slug = `${slugify(agencyName)}-${agencyId.slice(0, 6)}`;

  // Same shape as the super-admin "provision agency" path (agencies.service.ts), so a
  // bootstrapped agency is indistinguishable from one created in the admin screen.
  await db.transaction(async (tx) => {
    await tx.insert(organizations).values({
      id: organizationId,
      name: agencyName,
      slug,
      createdAt: new Date(),
    });
    await tx.insert(agencies).values({
      id: agencyId,
      name: agencyName,
      slug,
      brandColor: "#F2A341",
      betterAuthOrgId: organizationId,
    });
    await tx.insert(users).values({
      id: ownerId,
      name: ownerName,
      email: ownerEmail,
      emailVerified: true,
      role: "AGENCY_OWNER",
      specialty: "GENERAL",
      agencyId,
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
      accountId: ownerId,
      providerId: "credential",
      userId: ownerId,
      password: await hashPassword(ownerPassword),
      updatedAt: new Date(),
    });
    await tx.insert(members).values({
      id: createId(),
      organizationId,
      userId: ownerId,
      role: "owner",
      createdAt: new Date(),
    });
    await tx.insert(pipelines).values({
      id: pipelineId,
      agencyId,
      name: "Default internal → client",
      isDefault: true,
    });
    await tx.insert(pipelineStages).values([
      {
        id: createId(),
        agencyId,
        pipelineId,
        name: "Internal review",
        type: "INTERNAL",
        sequence: 1,
        requiresInternalApproval: true,
      },
      {
        id: createId(),
        agencyId,
        pipelineId,
        name: "Client review",
        type: "CLIENT",
        sequence: 2,
        requiresClientApproval: true,
      },
    ]);
    await tx.insert(customFieldDefs).values(
      [
        ["content_type", "Content Type", "SINGLE_SELECT"],
        ["platform", "Platform", "SINGLE_SELECT"],
        ["aspect_ratio", "Aspect Ratio", "SINGLE_SELECT"],
        ["campaign", "Campaign", "TEXT"],
      ].map(([key, label, type], position) => ({
        agencyId,
        scope: "DELIVERABLE" as const,
        key: key ?? "",
        label: label ?? "",
        type: (type ?? "TEXT") as "TEXT" | "SINGLE_SELECT",
        groupable: true,
        isBuiltIn: true,
        position,
      })),
    );
  });

  console.log(`Created ${agencyName} with owner ${ownerEmail}. Sign in with that email.`);
}

bootstrap()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
