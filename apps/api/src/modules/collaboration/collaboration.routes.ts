import { createChannelSchema, createMessageSchema } from "@rexops/validators";
import { Elysia, t } from "elysia";
import { authGuard, requirePrincipal } from "../../plugins/auth-guard";
import {
  createChannel,
  createMessage,
  listActivity,
  listChannels,
  listChatUsers,
  listMessagesPage,
  listRecentActivity,
  listVersionActivity,
  markChannelRead,
} from "./collaboration.service";

export const collaborationRoutes = new Elysia({ prefix: "/api/collaboration" })
  .use(authGuard)
  .get("/activity/recent", ({ query, principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return listRecentActivity(actor, query.limit ? Number(query.limit) : undefined);
  })
  .get("/activity/deliverable/:deliverableId", ({ params, query, principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return listActivity(actor, params.deliverableId, {
      cursor: query.cursor,
      limit: query.limit ? Number(query.limit) : undefined,
    });
  })
  .get("/activity/version/:fileVersionId", ({ params, query, principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return listVersionActivity(actor, params.fileVersionId, {
      cursor: query.cursor,
      limit: query.limit ? Number(query.limit) : undefined,
    });
  })
  .get("/channels", ({ query, principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    const scopeType =
      query.scopeType === "PROJECT" || query.scopeType === "DELIVERABLE" || query.scopeType === "DM"
        ? query.scopeType
        : undefined;
    return listChannels(actor, {
      scopeType,
      scopeId: query.scopeId,
      search: query.search,
      cursor: query.cursor,
      limit: query.limit ? Number(query.limit) : undefined,
    });
  })
  .get("/users", ({ query, principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return listChatUsers(actor, query.search);
  })
  .post(
    "/channels",
    ({ body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return createChannel(actor, createChannelSchema.parse(body));
    },
    {
      body: t.Object({
        scopeType: t.Union([t.Literal("PROJECT"), t.Literal("DELIVERABLE"), t.Literal("DM")]),
        scopeId: t.Optional(t.String({ minLength: 1 })),
        name: t.Optional(t.String({ minLength: 1, maxLength: 120 })),
      }),
    },
  )
  .get("/channels/:channelId/messages", ({ params, query, principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return listMessagesPage(actor, params.channelId, {
      cursor: query.cursor,
      limit: query.limit ? Number(query.limit) : undefined,
      search: query.search,
    });
  })
  .post(
    "/channels/:channelId/messages",
    ({ params, body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return createMessage(actor, params.channelId, createMessageSchema.parse(body));
    },
    {
      body: t.Object({
        body: t.String({ minLength: 1, maxLength: 5000 }),
        parentId: t.Optional(t.String({ minLength: 1 })),
        refVersionIds: t.Optional(t.Array(t.String({ minLength: 1 }), { maxItems: 20 })),
        attachmentIds: t.Optional(t.Array(t.String({ minLength: 1 }), { maxItems: 20 })),
        mentionUserIds: t.Optional(t.Array(t.String({ minLength: 1 }), { maxItems: 50 })),
      }),
    },
  )
  .post(
    "/channels/:channelId/read",
    ({ params, body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return markChannelRead(actor, params.channelId, body.messageId);
    },
    { body: t.Object({ messageId: t.Optional(t.String({ minLength: 1 })) }) },
  );
