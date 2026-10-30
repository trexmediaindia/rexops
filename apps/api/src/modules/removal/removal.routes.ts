import { Elysia, t } from "elysia";
import { authGuard, requirePrincipal } from "../../plugins/auth-guard";
import {
  deleteAgencyPermanently,
  deleteClientPermanently,
  deleteDeliverablePermanently,
  deleteProjectPermanently,
  removeClientPerson,
  removeTeamMember,
  resetAgencyOwnerPassword,
  restoreAgency,
  restoreClient,
  restoreDeliverable,
  setClientPersonAccess,
  suspendAgency,
} from "./removal.service";

/** Permanent deletes carry the name typed back, so a stray request can't erase anything. */
const confirmBody = { body: t.Object({ confirm: t.String() }) };

export const removalRoutes = new Elysia()
  .use(authGuard)
  // Clients
  .post("/api/clients/:id/restore", ({ params, principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return restoreClient(actor, params.id);
  })
  .delete(
    "/api/clients/:id",
    ({ params, body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return deleteClientPermanently(actor, params.id, body.confirm);
    },
    confirmBody,
  )
  .patch(
    "/api/clients/:id/people/:userId",
    ({ params, body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return setClientPersonAccess(actor, params.id, params.userId, body.banned);
    },
    { body: t.Object({ banned: t.Boolean() }) },
  )
  .delete("/api/clients/:id/people/:userId", ({ params, principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return removeClientPerson(actor, params.id, params.userId);
  })
  // Team
  .delete("/api/team/:userId", ({ params, principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return removeTeamMember(actor, params.userId);
  })
  // Projects
  .delete(
    "/api/projects/:id",
    ({ params, body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return deleteProjectPermanently(actor, params.id, body.confirm);
    },
    confirmBody,
  )
  // Pieces of work
  .post("/api/deliverables/:id/restore", ({ params, principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return restoreDeliverable(actor, params.id);
  })
  .delete(
    "/api/deliverables/:id",
    ({ params, body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return deleteDeliverablePermanently(actor, params.id, body.confirm);
    },
    confirmBody,
  )
  // Agencies (platform admin)
  .post("/api/agencies/:id/suspend", ({ params, principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return suspendAgency(actor, params.id);
  })
  .post("/api/agencies/:id/restore", ({ params, principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return restoreAgency(actor, params.id);
  })
  .post("/api/agencies/:id/reset-owner-password", ({ params, principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return resetAgencyOwnerPassword(actor, params.id);
  })
  .delete(
    "/api/agencies/:id",
    ({ params, body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return deleteAgencyPermanently(actor, params.id, body.confirm);
    },
    confirmBody,
  );
