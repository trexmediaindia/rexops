import { accessShareSchema, createShareSchema, guestCommentSchema } from "@rexops/validators";
import { Elysia, t } from "elysia";
import { authGuard, requirePrincipal } from "../../plugins/auth-guard";
import {
  accessShare,
  completeGuestAttachment,
  createGuestComment,
  createShare,
  downloadGuestAttachment,
  initiateGuestAttachment,
  listShares,
  reactToGuestComment,
  resolveGuestComment,
  revokeShare,
  signGuestAttachmentParts,
} from "./shares.service";

export const sharesRoutes = new Elysia({ prefix: "/api/shares" })
  .use(authGuard)
  .post(
    "/",
    ({ body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return createShare(actor, createShareSchema.parse(body));
    },
    {
      body: t.Object({
        resourceType: t.Union([t.Literal("DELIVERABLE"), t.Literal("FILE_VERSION")]),
        resourceId: t.String({ minLength: 1 }),
        passphrase: t.Optional(t.String({ minLength: 6, maxLength: 128 })),
        expiresAt: t.Optional(t.Date()),
        allowComment: t.Optional(t.Boolean()),
        allowDownload: t.Optional(t.Boolean()),
        watermark: t.Optional(t.Union([t.Literal("NONE"), t.Literal("STANDARD")])),
        audience: t.Optional(
          t.Union([t.Literal("INTERNAL"), t.Literal("CLIENT"), t.Literal("GUEST")]),
        ),
      }),
    },
  )
  .get("/deliverable/:deliverableId", ({ params, principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return listShares(actor, params.deliverableId);
  })
  .delete("/:shareId", ({ params, principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return revokeShare(actor, params.shareId);
  });

export const publicShareRoutes = new Elysia({ prefix: "/api/public/shares" })
  .post(
    "/:token/access",
    ({ params, body }) => {
      const input = accessShareSchema.parse(body);
      return accessShare(params.token, input.passphrase);
    },
    {
      body: t.Object({
        passphrase: t.Optional(t.String({ maxLength: 128 })),
      }),
    },
  )
  .post(
    "/:token/comments",
    ({ params, body }) => createGuestComment(params.token, guestCommentSchema.parse(body)),
    {
      body: t.Object({
        passphrase: t.Optional(t.String({ maxLength: 128 })),
        guestName: t.String({ minLength: 2, maxLength: 100 }),
        message: t.String({ minLength: 1, maxLength: 5000 }),
        fileVersionId: t.Optional(t.String({ minLength: 1 })),
        anchorType: t.Optional(
          t.Union([
            t.Literal("NONE"),
            t.Literal("TIMECODE"),
            t.Literal("REGION"),
            t.Literal("WAVEFORM_RANGE"),
          ]),
        ),
        anchor: t.Optional(t.Record(t.String(), t.Unknown())),
        parentId: t.Optional(t.String({ minLength: 1 })),
        attachmentIds: t.Optional(t.Array(t.String({ minLength: 1 }), { maxItems: 20 })),
      }),
    },
  )
  .post(
    "/:token/comments/:commentId/reactions",
    ({ params, body }) =>
      reactToGuestComment(params.token, params.commentId, {
        passphrase: body.passphrase,
        guestName: body.guestName,
        emoji: body.emoji,
        remove: body.remove ?? false,
      }),
    {
      body: t.Object({
        passphrase: t.Optional(t.String({ maxLength: 128 })),
        guestName: t.String({ minLength: 2, maxLength: 100 }),
        emoji: t.String({ minLength: 1, maxLength: 16 }),
        remove: t.Optional(t.Boolean()),
      }),
    },
  )
  .post(
    "/:token/comments/:commentId/resolve",
    ({ params, body }) =>
      resolveGuestComment(
        params.token,
        params.commentId,
        body.passphrase,
        body.guestName,
        body.reopen ?? false,
      ),
    {
      body: t.Object({
        passphrase: t.Optional(t.String({ maxLength: 128 })),
        guestName: t.String({ minLength: 2, maxLength: 100 }),
        reopen: t.Optional(t.Boolean()),
      }),
    },
  )
  .post("/:token/attachments", ({ params, body }) => initiateGuestAttachment(params.token, body), {
    body: t.Object({
      passphrase: t.Optional(t.String({ maxLength: 128 })),
      guestName: t.String({ minLength: 2, maxLength: 100 }),
      fileName: t.String({ minLength: 1, maxLength: 255 }),
      fileType: t.String({ minLength: 1, maxLength: 160 }),
      fileSizeBytes: t.Integer({ minimum: 1, maximum: 250 * 1024 * 1024 }),
    }),
  })
  .post(
    "/:token/attachments/:attachmentId/parts",
    ({ params, body }) =>
      signGuestAttachmentParts(
        params.token,
        params.attachmentId,
        body.passphrase,
        body.guestName,
        body.partNumbers,
      ),
    {
      body: t.Object({
        passphrase: t.Optional(t.String({ maxLength: 128 })),
        guestName: t.String({ minLength: 2, maxLength: 100 }),
        partNumbers: t.Array(t.Integer({ minimum: 1, maximum: 10_000 }), {
          minItems: 1,
          maxItems: 100,
        }),
      }),
    },
  )
  .post(
    "/:token/attachments/:attachmentId/complete",
    ({ params, body }) =>
      completeGuestAttachment(
        params.token,
        params.attachmentId,
        body.passphrase,
        body.guestName,
        body.parts,
      ),
    {
      body: t.Object({
        passphrase: t.Optional(t.String({ maxLength: 128 })),
        guestName: t.String({ minLength: 2, maxLength: 100 }),
        parts: t.Array(
          t.Object({
            partNumber: t.Integer({ minimum: 1 }),
            eTag: t.String({ minLength: 1 }),
          }),
          { minItems: 1 },
        ),
      }),
    },
  )
  .post(
    "/:token/attachments/:attachmentId/download",
    ({ params, body }) =>
      downloadGuestAttachment(params.token, params.attachmentId, body.passphrase),
    {
      body: t.Object({ passphrase: t.Optional(t.String({ maxLength: 128 })) }),
    },
  );
