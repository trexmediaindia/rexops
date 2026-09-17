import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { request } from "./request";

export type WorkspacePreferences = {
  defaultLanding: "dashboard" | "work" | "review";
  autoSendToClientOnInternalApproval: boolean;
  confirmBeforeArchiving: boolean;
  dueSoonWindowDays: number;
  showSetupGuide: boolean;
  shareLinkExpiryDays: number;
};

export type Workspace = {
  user: {
    id: string;
    name: string | null;
    email: string | null;
    role: string;
    permissions: Record<string, boolean>;
    impersonating: boolean;
  };
  agency: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    brandColor: string | null;
    preferences: WorkspacePreferences;
  } | null;
  client: { id: string; name: string; companyName: string | null } | null;
};

/**
 * Who is signed in and which workspace they are in.
 *
 * Every shell used to state this from literals — the sidebar said "T-Rex Media"
 * to every agency on the platform, and no screen could tell whether the signed-in
 * user was allowed to do the thing it was offering.
 */
export function useWorkspace() {
  return useQuery({
    queryKey: ["workspace"],
    queryFn: () => request<Workspace>("/api/workspace"),
    staleTime: 300_000,
    retry: false,
  });
}

export function useUpdatePreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<WorkspacePreferences>) =>
      request<WorkspacePreferences>("/api/workspace/preferences", {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workspace"] }),
  });
}

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Platform admin",
  AGENCY_OWNER: "Agency owner",
  AGENCY_ADMIN: "Agency admin",
  AGENCY_MEMBER: "Team member",
  CLIENT_OWNER: "Client lead",
  CLIENT_MEMBER: "Client reviewer",
};

/** What the role means, for the account menu and the team screen. */
const ROLE_BLURB: Record<string, string> = {
  SUPER_ADMIN: "You can see and provision every agency on this install.",
  AGENCY_OWNER: "Full control of this workspace, including billing and other owners.",
  AGENCY_ADMIN: "Can manage clients, projects, the team and workspace settings.",
  AGENCY_MEMBER: "Can work on deliverables you are assigned to and run internal reviews.",
  CLIENT_OWNER: "Can approve work and invite colleagues from your company.",
  CLIENT_MEMBER: "Can review and comment on work shared with your company.",
};

export function roleLabel(role: string | undefined) {
  if (!role) return "Signed out";
  return ROLE_LABEL[role] ?? role.replaceAll("_", " ").toLowerCase();
}

export function roleBlurb(role: string | undefined) {
  if (!role) return "You are not signed in.";
  return ROLE_BLURB[role] ?? "";
}

/** Two letters for an avatar, from whatever name we actually have. */
export function initialsFor(name: string | null | undefined) {
  const source = (name ?? "").trim();
  if (!source) return "RX";
  return (
    source
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "RX"
  );
}

/** Whether this role may change workspace settings. */
export function canManageWorkspace(role: string | undefined) {
  return role === "AGENCY_OWNER" || role === "AGENCY_ADMIN" || role === "SUPER_ADMIN";
}
