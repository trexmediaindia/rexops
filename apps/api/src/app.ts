import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { featureRegistry } from "@rexops/core";
import { Elysia } from "elysia";
import { agenciesRoutes } from "./modules/agencies/agencies.routes";
import { analyticsRoutes } from "./modules/analytics/analytics.routes";
import { attachmentsRoutes } from "./modules/attachments/attachments.routes";
import { authRoutes } from "./modules/auth/auth.routes";
import { automationRoutes, publicIntakeRoutes } from "./modules/automation/automation.routes";
import { clientsRoutes } from "./modules/clients/clients.routes";
import { collaborationRoutes } from "./modules/collaboration/collaboration.routes";
import { deliverablesRoutes } from "./modules/deliverables/deliverables.routes";
import { featuresRoutes } from "./modules/features/features.routes";
import {
  developmentUploadRoutes,
  fileVersionsRoutes,
} from "./modules/file-versions/file-versions.routes";
import { healthRoutes } from "./modules/health/health.routes";
import { liveblocksRoutes } from "./modules/liveblocks/liveblocks.routes";
import { notificationsRoutes } from "./modules/notifications/notifications.routes";
import { projectsRoutes } from "./modules/projects/projects.routes";
import { reviewTaskRoutes } from "./modules/reviews/review-task.routes";
import { reviewsRoutes } from "./modules/reviews/reviews.routes";
import { publicShareRoutes, sharesRoutes } from "./modules/shares/shares.routes";
import { storageRoutes } from "./modules/storage/storage.routes";
import { teamRoutes } from "./modules/team/team.routes";
import { workManagementRoutes } from "./modules/work-management/work-management.routes";
import { workspaceRoutes } from "./modules/workspace/workspace.routes";
// generator-imports
import { errorPlugin } from "./plugins/error";
import { requestIdPlugin } from "./plugins/request-id";
import { securityPlugin } from "./plugins/security";

const features = featureRegistry();
const notFoundHandler = ({ set }: { set: { status?: number | string } }) => {
  set.status = 404;
  return { error: "NOT_FOUND" };
};
const notFound = (prefix: string) =>
  new Elysia({ prefix }).all("", notFoundHandler).all("/*", ({ set }) => {
    set.status = 404;
    return { error: "NOT_FOUND" };
  });

export const app = new Elysia({ name: "rexops-api" })
  .use(requestIdPlugin)
  .use(securityPlugin)
  .use(errorPlugin)
  .use(
    cors({
      origin: process.env.WEB_URL ?? "http://localhost:5173",
      credentials: true,
      exposeHeaders: ["etag", "x-request-id"],
    }),
  )
  .use(
    openapi({
      documentation: {
        info: {
          title: "RexOps API",
          version: "0.1.0",
          description: "Tenant-isolated creative operations API.",
        },
      },
    }),
  )
  .use(healthRoutes)
  .use(authRoutes)
  .use(featuresRoutes)
  .use(workspaceRoutes)
  .use(features.automation ? automationRoutes : notFound("/api/automation"))
  .use(features.automation ? publicIntakeRoutes : notFound("/api/public/intake"))
  .use(features["collaboration.live"] ? liveblocksRoutes : notFound("/api/liveblocks-auth"))
  .use(features["collaboration.live"] ? notificationsRoutes : notFound("/api/notifications"))
  .use(features["review.wedge"] ? attachmentsRoutes : notFound("/api/attachments"))
  .use(agenciesRoutes)
  .use(features.analytics ? analyticsRoutes : notFound("/api/analytics"))
  .use(clientsRoutes)
  .use(teamRoutes)
  .use(storageRoutes)
  .use(features["collaboration.live"] ? collaborationRoutes : notFound("/api/collaboration"))
  .use(projectsRoutes)
  .use(deliverablesRoutes)
  .use(features["files.versioning"] ? fileVersionsRoutes : notFound("/api/file-versions"))
  .use(features["review.wedge"] ? reviewsRoutes : notFound("/api/reviews"))
  .use(features["review.wedge"] ? reviewTaskRoutes : new Elysia())
  .use(features["review.wedge"] ? sharesRoutes : notFound("/api/shares"))
  .use(features["review.wedge"] ? publicShareRoutes : notFound("/api/public/shares"))
  .use(
    features["work.views"]
      ? workManagementRoutes
      : features["review.wedge"]
        ? new Elysia()
        : notFound("/api/work"),
  )
  .use(features["files.versioning"] ? developmentUploadRoutes : notFound("/api/dev-uploads"));

export type App = typeof app;
