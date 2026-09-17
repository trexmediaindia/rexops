import { inviteTeamMemberSchema, updateTeamMemberSchema } from "@rexops/validators";
import { Elysia, t } from "elysia";
import { authGuard, requirePrincipal } from "../../plugins/auth-guard";
import { inviteTeamMember, listTeam, updateTeamMember } from "./team.service";

const permissionFlags = t.Partial(
  t.Object({
    canApprove: t.Boolean(),
    canInviteClients: t.Boolean(),
    canManageTeam: t.Boolean(),
    canUploadFinal: t.Boolean(),
    canViewAllClients: t.Boolean(),
    canManageAutomations: t.Boolean(),
  }),
);

const agencyRole = t.Union([
  t.Literal("AGENCY_OWNER"),
  t.Literal("AGENCY_ADMIN"),
  t.Literal("AGENCY_MEMBER"),
]);

const specialty = t.Union([
  t.Literal("EDITOR"),
  t.Literal("MOTION"),
  t.Literal("DESIGNER"),
  t.Literal("PHOTOGRAPHER"),
  t.Literal("PM"),
  t.Literal("ACCOUNT"),
  t.Literal("GENERAL"),
]);

export const teamRoutes = new Elysia({ prefix: "/api/team" })
  .use(authGuard)
  .get("/", ({ principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return listTeam(actor);
  })
  .post(
    "/",
    ({ body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return inviteTeamMember(actor, inviteTeamMemberSchema.parse(body));
    },
    {
      body: t.Object({
        name: t.String({ minLength: 2 }),
        email: t.String({ format: "email" }),
        role: t.Optional(agencyRole),
        specialty: t.Optional(specialty),
        permissions: t.Optional(permissionFlags),
      }),
    },
  )
  .patch(
    "/:userId",
    ({ params, body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return updateTeamMember(actor, params.userId, updateTeamMemberSchema.parse(body));
    },
    {
      body: t.Object({
        name: t.Optional(t.String({ minLength: 2 })),
        role: t.Optional(agencyRole),
        specialty: t.Optional(specialty),
        permissions: t.Optional(permissionFlags),
        banned: t.Optional(t.Boolean()),
      }),
    },
  );
