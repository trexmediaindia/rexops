import { Liveblocks } from "@liveblocks/node";
import type { Principal } from "@rexops/core";
import { db, users } from "@rexops/db";
import { eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { authGuard, requirePrincipal } from "../../plugins/auth-guard";
import { assertChannelAccess } from "../collaboration/collaboration.service";
import { getDeliverable } from "../deliverables/deliverables.service";
import { getProject } from "../projects/projects.service";

export function colorForUser(userId: string) {
  let hash = 0;
  for (const character of userId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  const palette = ["#f2a341", "#5b8def", "#8b7cf0", "#2fb6a8", "#e5733b", "#3fb66b"];
  return palette[hash % palette.length] ?? "#f2a341";
}

function audienceFor(role: Principal["role"]) {
  if (role.startsWith("CLIENT_")) return "CLIENT" as const;
  return "AGENCY" as const;
}

export async function permittedRoom(principal: Principal, room: string) {
  const [kind, resourceId, ...rest] = room.split(":");
  if (!resourceId) return false;
  try {
    if (kind === "user") {
      return rest.length === 0 && resourceId === principal.userId;
    }
    if (kind === "review") {
      if (rest.length > 1 || (rest.length === 1 && rest[0] !== "client")) return false;
      if (principal.role.startsWith("CLIENT_") && rest[0] !== "client") return false;
      await getDeliverable(principal, resourceId);
    } else if (kind === "board") {
      if (rest.length) return false;
      await getProject(principal, resourceId);
    } else if (kind === "chat") {
      if (rest.length) return false;
      await assertChannelAccess(principal, resourceId);
    } else return false;
    return true;
  } catch {
    return false;
  }
}

export const liveblocksRoutes = new Elysia().use(authGuard).post(
  "/api/liveblocks-auth",
  async ({ body, principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    if (!(await permittedRoom(actor, body.room))) {
      set.status = 404;
      return { error: "NOT_FOUND" };
    }

    const [identity] = await db
      .select({ name: users.name, image: users.image })
      .from(users)
      .where(eq(users.id, actor.userId))
      .limit(1);
    const userInfo = {
      name: identity?.name ?? "RexOps user",
      color: colorForUser(actor.userId),
      avatarUrl: identity?.image ?? null,
      role: actor.role,
      agencyId: actor.agencyId ?? "",
      audience: audienceFor(actor.role),
    };

    const secret = process.env.LIVEBLOCKS_SECRET_KEY;
    if (!secret) {
      if (process.env.NODE_ENV === "production") {
        set.status = 503;
        return { error: "REALTIME_NOT_CONFIGURED" };
      }
      return {
        token: `dev:${actor.userId}:${body.room}`,
        room: body.room,
        development: true,
        userInfo,
      };
    }

    const liveblocks = new Liveblocks({ secret });
    const session = liveblocks.prepareSession(actor.userId, {
      userInfo,
    });
    session.allow(body.room, session.FULL_ACCESS);
    const { status, body: tokenBody } = await session.authorize();
    set.status = status;
    return new Response(tokenBody, { status });
  },
  {
    body: t.Object({ room: t.String({ minLength: 3 }) }),
  },
);
