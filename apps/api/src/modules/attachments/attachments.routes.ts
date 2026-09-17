import { Elysia, t } from "elysia";
import { authGuard, requirePrincipal } from "../../plugins/auth-guard";
import {
  attachmentDownload,
  completeAttachment,
  initiateAttachment,
  signAttachmentParts,
} from "./attachments.service";

export const attachmentsRoutes = new Elysia({ prefix: "/api/attachments" })
  .use(authGuard)
  .post(
    "/initiate",
    ({ body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return initiateAttachment(actor, body);
    },
    {
      body: t.Object({
        fileName: t.String({ minLength: 1, maxLength: 255 }),
        fileType: t.String({ minLength: 1, maxLength: 160 }),
        fileSizeBytes: t.Integer({ minimum: 1, maximum: 250 * 1024 * 1024 }),
      }),
    },
  )
  .post(
    "/:id/parts",
    ({ params, body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return signAttachmentParts(actor, params.id, body.partNumbers);
    },
    {
      body: t.Object({
        partNumbers: t.Array(t.Integer({ minimum: 1, maximum: 10_000 }), {
          minItems: 1,
          maxItems: 100,
        }),
      }),
    },
  )
  .post(
    "/:id/complete",
    ({ params, body, principal, set }) => {
      const actor = requirePrincipal(principal, set);
      if (!actor) return { error: "UNAUTHORIZED" };
      return completeAttachment(actor, params.id, body.parts);
    },
    {
      body: t.Object({
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
  .get("/:id/download", ({ params, principal, set }) => {
    const actor = requirePrincipal(principal, set);
    if (!actor) return { error: "UNAUTHORIZED" };
    return attachmentDownload(actor, params.id);
  });
