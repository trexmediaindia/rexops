import type { PermissionFlags } from "@rexops/config";
import type { Principal } from "@rexops/core";
import { agencies, clients, db, users } from "@rexops/db";
import { app } from "../app";

const noPermissions: PermissionFlags = {
  canApprove: false,
  canInviteClients: false,
  canManageTeam: false,
  canUploadFinal: false,
  canViewAllClients: false,
  canManageAutomations: false,
};

export const principals = {
  owner: {
    userId: "user_manas",
    role: "AGENCY_OWNER",
    specialty: "GENERAL",
    agencyId: "agency_trex",
    clientId: null,
    permissions: {
      canApprove: true,
      canInviteClients: true,
      canManageTeam: true,
      canUploadFinal: true,
      canViewAllClients: true,
      canManageAutomations: true,
    },
  },
  editor: {
    userId: "user_riya",
    role: "AGENCY_MEMBER",
    specialty: "MOTION",
    agencyId: "agency_trex",
    clientId: null,
    permissions: noPermissions,
  },
  clientOwner: {
    userId: "user_sara",
    role: "CLIENT_OWNER",
    specialty: null,
    agencyId: "agency_trex",
    clientId: "client_imperial",
    permissions: { ...noPermissions, canApprove: true, canInviteClients: true },
  },
  superAdmin: {
    userId: "user_root",
    role: "SUPER_ADMIN",
    specialty: null,
    agencyId: null,
    clientId: null,
    permissions: {
      canApprove: true,
      canInviteClients: true,
      canManageTeam: true,
      canUploadFinal: true,
      canViewAllClients: true,
      canManageAutomations: true,
    },
  },
  outsider: {
    userId: "user_outsider",
    role: "AGENCY_OWNER",
    specialty: "GENERAL",
    agencyId: "agency_outsider",
    clientId: null,
    permissions: {
      canApprove: true,
      canInviteClients: true,
      canManageTeam: true,
      canUploadFinal: true,
      canViewAllClients: true,
      canManageAutomations: true,
    },
  },
} satisfies Record<string, Principal>;

export async function ensureTestFixtures() {
  await db
    .insert(agencies)
    .values({ id: "agency_outsider", name: "Outside Agency", slug: "outside-agency" })
    .onConflictDoNothing();
  await db
    .insert(users)
    .values([
      {
        id: "user_root",
        name: "Root",
        email: "root@rexops.test",
        role: "SUPER_ADMIN",
        permissions: {},
      },
      {
        id: "user_outsider",
        name: "Outsider",
        email: "owner@outside.test",
        role: "AGENCY_OWNER",
        agencyId: "agency_outsider",
        permissions: {},
      },
    ])
    .onConflictDoNothing();
  await db
    .insert(clients)
    .values({
      id: "client_outsider",
      agencyId: "agency_outsider",
      name: "Outside Client",
      createdByUserId: "user_outsider",
    })
    .onConflictDoNothing();
}

export function apiRequest(
  path: string,
  options: {
    principal?: Principal;
    method?: string;
    body?: unknown;
    rawBody?: BodyInit;
    headers?: HeadersInit;
  } = {},
) {
  const headers = new Headers(options.headers);
  if (options.principal) {
    headers.set("x-rexops-principal", JSON.stringify(options.principal));
  }
  if (options.body !== undefined) headers.set("content-type", "application/json");
  return app.handle(
    new Request(`http://localhost${path}`, {
      method: options.method ?? "GET",
      headers,
      body:
        options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
    }),
  );
}

export async function responseJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}
