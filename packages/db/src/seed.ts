import { createId } from "@paralleldrive/cuid2";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { db, sql } from "./client";
import {
  accounts,
  agencies,
  clients,
  customFieldDefs,
  deliverables,
  pipelineStages,
  pipelines,
  projectMembers,
  projects,
  users,
} from "./schema";

const ids = {
  agency: "agency_trex",
  owner: "user_manas",
  editor: "user_riya",
  clientOwner: "user_sara",
  client: "client_imperial",
  project: "project_june_retainer",
  subProject: "project_reels",
  deliverable: "deliverable_beach_vibe",
  pipeline: "pipeline_default",
};

async function seed() {
  const existing = await db
    .select({ id: agencies.id })
    .from(agencies)
    .where(eq(agencies.id, ids.agency));
  if (existing.length > 0) {
    await ensureCredentialAccounts();
    console.log("Canonical seed already exists.");
    return;
  }

  await db.transaction(async (tx) => {
    await tx.insert(agencies).values({
      id: ids.agency,
      name: "T-Rex Media",
      slug: "t-rex-media",
      brandColor: "#F2A341",
    });
    await tx.insert(users).values([
      {
        id: ids.owner,
        name: "Manas",
        email: "manas@trex.test",
        emailVerified: true,
        role: "AGENCY_OWNER",
        specialty: "GENERAL",
        agencyId: ids.agency,
        permissions: {
          canApprove: true,
          canInviteClients: true,
          canManageTeam: true,
          canUploadFinal: true,
          canViewAllClients: true,
          canManageAutomations: true,
        },
      },
      {
        id: ids.editor,
        name: "Riya",
        email: "riya@trex.test",
        emailVerified: true,
        role: "AGENCY_MEMBER",
        specialty: "MOTION",
        agencyId: ids.agency,
        permissions: {
          canApprove: false,
          canInviteClients: false,
          canManageTeam: false,
          canUploadFinal: false,
          canViewAllClients: false,
          canManageAutomations: false,
        },
      },
    ]);
    await tx.insert(clients).values({
      id: ids.client,
      agencyId: ids.agency,
      name: "Imperial Living",
      companyName: "Imperial Living",
      email: "sara@imperial.test",
      portalSlug: "imperial-living",
      createdByUserId: ids.owner,
    });
    await tx.insert(users).values({
      id: ids.clientOwner,
      name: "Sara",
      email: "sara@imperial.test",
      emailVerified: true,
      role: "CLIENT_OWNER",
      agencyId: ids.agency,
      clientId: ids.client,
      permissions: {
        canApprove: true,
        canInviteClients: true,
        canManageTeam: false,
        canUploadFinal: false,
        canViewAllClients: false,
        canManageAutomations: false,
      },
    });
    await tx.insert(projects).values([
      {
        id: ids.project,
        agencyId: ids.agency,
        clientId: ids.client,
        name: "June Content Retainer",
        type: "Social Media Retainer",
        status: "IN_PROGRESS",
        priority: "HIGH",
        createdByUserId: ids.owner,
      },
      {
        id: ids.subProject,
        agencyId: ids.agency,
        clientId: ids.client,
        parentProjectId: ids.project,
        name: "Reels",
        status: "IN_PROGRESS",
        createdByUserId: ids.owner,
      },
    ]);
    await tx.insert(projectMembers).values([
      {
        agencyId: ids.agency,
        projectId: ids.project,
        userId: ids.owner,
        roleOnProject: "lead",
      },
      {
        agencyId: ids.agency,
        projectId: ids.subProject,
        userId: ids.editor,
        roleOnProject: "editor",
      },
    ]);
    await tx.insert(deliverables).values({
      id: ids.deliverable,
      agencyId: ids.agency,
      clientId: ids.client,
      projectId: ids.subProject,
      title: "Beach Vibe Reel",
      contentType: "MOTION",
      status: "IN_PROGRESS",
      priority: "HIGH",
      assignedToUserId: ids.editor,
      createdByUserId: ids.owner,
    });
    await tx.insert(pipelines).values({
      id: ids.pipeline,
      agencyId: ids.agency,
      name: "Default internal → client",
      isDefault: true,
    });
    await tx.insert(pipelineStages).values([
      {
        id: createId(),
        agencyId: ids.agency,
        pipelineId: ids.pipeline,
        name: "Internal review",
        type: "INTERNAL",
        sequence: 1,
        requiresInternalApproval: true,
      },
      {
        id: createId(),
        agencyId: ids.agency,
        pipelineId: ids.pipeline,
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
        agencyId: ids.agency,
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

  await ensureCredentialAccounts();
  console.log("Seeded T-Rex Media canonical dataset.");
}

async function ensureCredentialAccounts() {
  const credentials = [
    ["account_manas", ids.owner],
    ["account_riya", ids.editor],
    ["account_sara", ids.clientOwner],
  ] as const;

  for (const [id, userId] of credentials) {
    await db
      .insert(accounts)
      .values({
        id,
        accountId: userId,
        providerId: "credential",
        userId,
        password: await hashPassword("rexops-demo"),
        updatedAt: new Date(),
      })
      .onConflictDoNothing();
  }
}

seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
