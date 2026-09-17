import { pushSubscriptionSchema } from "@rexops/validators";
import { Elysia, t } from "elysia";
import { authGuard, requirePrincipal } from "../../plugins/auth-guard";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  removePushSubscription,
  savePushSubscription,
} from "./notifications.service";

export const notificationsRoutes = new Elysia({ prefix: "/api/notifications" })
  .use(authGuard)
  .get("/", ({ query, principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return listNotifications(actor, {
      unreadOnly: query.unread === "true",
      cursor: query.cursor,
      limit: query.limit ? Number(query.limit) : undefined,
    });
  })
  .post("/:id/read", ({ params, principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return markNotificationRead(actor, params.id);
  })
  .post("/read-all", ({ principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return markAllNotificationsRead(actor);
  })
  .post(
    "/push-subscriptions",
    ({ body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return savePushSubscription(actor, pushSubscriptionSchema.parse(body));
    },
    {
      body: t.Object({
        endpoint: t.String({ format: "uri" }),
        keys: t.Object({
          p256dh: t.String({ minLength: 1 }),
          auth: t.String({ minLength: 1 }),
        }),
        userAgent: t.Optional(t.String({ maxLength: 500 })),
      }),
    },
  )
  .delete(
    "/push-subscriptions",
    ({ body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return removePushSubscription(actor, body.endpoint);
    },
    { body: t.Object({ endpoint: t.String({ format: "uri" }) }) },
  );
