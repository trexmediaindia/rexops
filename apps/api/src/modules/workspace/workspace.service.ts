import type { Principal } from "@rexops/core";
import { assertWritablePrincipal, ForbiddenError, NotFoundError } from "@rexops/core";
import { agencies, clients, db, users } from "@rexops/db";
import { eq } from "drizzle-orm";

/**
 * Workspace preferences.
 *
 * These are the settings the agency's own screens read — defaults that stop a
 * first-time owner having to configure anything before the product works, and
 * which they can change later from Settings. They live in `agencies.settings`
 * under one key so they never collide with the appearance fields.
 */
export type WorkspacePreferences = {
  /** Where an agency user lands after signing in. */
  defaultLanding: "dashboard" | "work" | "review";
  /** Deliverables move straight to client review once internal review passes. */
  autoSendToClientOnInternalApproval: boolean;
  /** Ask before archiving a client or project. Off only for power users. */
  confirmBeforeArchiving: boolean;
  /** Days before a due date that a deliverable starts reading as "due soon". */
  dueSoonWindowDays: number;
  /** Show the setup guide on the dashboard until the workspace is set up. */
  showSetupGuide: boolean;
  /** Default number of days a share link stays live. */
  shareLinkExpiryDays: number;
};

export const DEFAULT_WORKSPACE_PREFERENCES: WorkspacePreferences = {
  defaultLanding: "dashboard",
  autoSendToClientOnInternalApproval: false,
  confirmBeforeArchiving: true,
  dueSoonWindowDays: 7,
  showSetupGuide: true,
  shareLinkExpiryDays: 14,
};

function readPreferences(settings: Record<string, unknown>): WorkspacePreferences {
  const stored = (settings.preferences ?? {}) as Partial<WorkspacePreferences>;
  return { ...DEFAULT_WORKSPACE_PREFERENCES, ...stored };
}

/**
 * Who is signed in, and which workspace they are in.
 *
 * The shells previously hardcoded the workspace name, so every agency saw the
 * same fictional one. This is the single call that tells the frontend what to
 * put in the sidebar, what the user's role allows, and — for a client — which
 * account they are looking at.
 */
export async function getWorkspace(principal: Principal) {
  const [user] = await db.select().from(users).where(eq(users.id, principal.userId)).limit(1);

  const agency = principal.agencyId
    ? (
        await db
          .select({
            id: agencies.id,
            name: agencies.name,
            slug: agencies.slug,
            logoUrl: agencies.logoUrl,
            brandColor: agencies.brandColor,
            settings: agencies.settings,
          })
          .from(agencies)
          .where(eq(agencies.id, principal.agencyId))
          .limit(1)
      )[0]
    : undefined;

  const client = principal.clientId
    ? (
        await db
          .select({ id: clients.id, name: clients.name, companyName: clients.companyName })
          .from(clients)
          .where(eq(clients.id, principal.clientId))
          .limit(1)
      )[0]
    : undefined;

  return {
    user: {
      id: principal.userId,
      name: user?.name ?? null,
      email: user?.email ?? null,
      role: principal.role,
      permissions: principal.permissions,
      impersonating: principal.impersonating ?? false,
    },
    agency: agency
      ? {
          id: agency.id,
          name: agency.name,
          slug: agency.slug,
          logoUrl: agency.logoUrl,
          brandColor: agency.brandColor,
          preferences: readPreferences(agency.settings),
        }
      : null,
    client: client ? { id: client.id, name: client.name, companyName: client.companyName } : null,
  };
}

export async function updateWorkspacePreferences(
  principal: Principal,
  input: Partial<WorkspacePreferences>,
) {
  if (!["AGENCY_OWNER", "AGENCY_ADMIN"].includes(principal.role)) throw new ForbiddenError();
  assertWritablePrincipal(principal);
  if (!principal.agencyId) throw new NotFoundError();

  const [agency] = await db
    .select({ id: agencies.id, settings: agencies.settings })
    .from(agencies)
    .where(eq(agencies.id, principal.agencyId))
    .limit(1);
  if (!agency) throw new NotFoundError();

  const preferences = { ...readPreferences(agency.settings), ...input };
  await db
    .update(agencies)
    .set({ settings: { ...agency.settings, preferences } })
    .where(eq(agencies.id, agency.id));
  return preferences;
}
