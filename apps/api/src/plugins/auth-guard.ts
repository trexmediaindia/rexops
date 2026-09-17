import { auth } from "@rexops/auth";
import { DEFAULT_PERMISSION_FLAGS, type PermissionFlags } from "@rexops/config";
import type { Principal } from "@rexops/core";
import { db, users } from "@rexops/db";
import { eq } from "drizzle-orm";
import { Elysia } from "elysia";

function parseDevelopmentPrincipal(request: Request): Principal | null {
  if (process.env.NODE_ENV === "production") return null;
  const raw = request.headers.get("x-rexops-principal");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Principal;
  } catch {
    return null;
  }
}

export async function principalFromRequest(request: Request): Promise<Principal | null> {
  const developmentPrincipal = parseDevelopmentPrincipal(request);
  if (developmentPrincipal) return developmentPrincipal;

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return null;

  const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!user) return null;

  return {
    userId: user.id,
    role: user.role,
    specialty: user.specialty,
    agencyId: user.agencyId,
    clientId: user.clientId,
    permissions: {
      ...DEFAULT_PERMISSION_FLAGS,
      ...(user.permissions as Partial<PermissionFlags>),
    },
    impersonating: Boolean((session.session as { impersonatedBy?: string | null }).impersonatedBy),
  };
}

export const authGuard = new Elysia({ name: "auth-guard" }).derive(
  { as: "global" },
  async ({ request }) => ({
    principal: await principalFromRequest(request),
  }),
);

export function requirePrincipal(principal: Principal | null, set: { status?: number | string }) {
  if (!principal) {
    set.status = 401;
    return null;
  }
  return principal;
}
