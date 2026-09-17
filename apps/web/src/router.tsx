import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  useParams,
} from "@tanstack/react-router";
import { FeatureGate } from "./lib/features";
import { RealtimeRoom } from "./lib/realtime";
import { AdminAgencies } from "./routes/admin/agencies";
import { AdminAudit } from "./routes/admin/audit";
import { AutomationPage } from "./routes/agency/automation";
import { ClientsPage } from "./routes/agency/clients";
import { AgencyDashboard } from "./routes/agency/dashboard";
import { DeliverableDetailPage } from "./routes/agency/deliverable-detail";
import { InboxPage } from "./routes/agency/inbox";
import { PipelineEditorPage } from "./routes/agency/pipeline-editor";
import { ProjectDetailPage } from "./routes/agency/project-detail";
import { ProjectsPage } from "./routes/agency/projects";
import { ReviewQueuePage } from "./routes/agency/review-queue";
import { AgencySettingsPage } from "./routes/agency/settings";
import { TeamPage } from "./routes/agency/team";
import { WorkPage } from "./routes/agency/work";
import { ClientApproved } from "./routes/client/approved";
import { ClientHome } from "./routes/client/home";
import { ClientProjects } from "./routes/client/projects";
import { ClientReview } from "./routes/client/review";
import { IntakePage } from "./routes/intake";
import { LoginPage } from "./routes/login";
import { ReviewRoom } from "./routes/review-room";
import { ShareReviewPage } from "./routes/share-review";

/**
 * Without this the router falls back to its own bare "Something went wrong! /
 * Show Error" markup — unstyled system chrome on a black page, which reads as a
 * dead site rather than a recoverable error.
 */
function RouteError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="not-found">
      <span className="rx-eyebrow">Error / off slate</span>
      <h1>That screen did not load.</h1>
      <p className="not-found__body">
        Something went wrong rendering this page. Try again — if it keeps happening, the message
        below is what to report.
      </p>
      <pre className="not-found__detail">{error.message}</pre>
      <div className="not-found__actions">
        <button type="button" className="rx-button rx-button--primary" onClick={reset}>
          Try again
        </button>
        <a className="not-found__link" href="/">
          Return to RexOps
        </a>
      </div>
    </main>
  );
}

const rootRoute = createRootRoute({
  component: () => <Outlet />,
  errorComponent: RouteError,
  notFoundComponent: () => (
    <main className="not-found">
      <span className="rx-eyebrow">404 / off slate</span>
      <h1>That route is not in this cut.</h1>
      <p className="not-found__body">
        The link may be stale, or the record it pointed at has been archived.
      </p>
      <a className="not-found__link" href="/">
        Return to RexOps
      </a>
    </main>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/login" });
  },
});

const routes = [
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/login",
    component: LoginPage,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/agency/dashboard",
    component: AgencyDashboard,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/agency/clients",
    component: ClientsPage,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/agency/projects",
    component: ProjectsPage,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/agency/projects/$projectId",
    component: ProjectDetailPage,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/agency/deliverables/$deliverableId",
    component: () => (
      <FeatureGate feature="files.versioning">
        <DeliverableDetailPage />
      </FeatureGate>
    ),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/agency/work",
    component: () => (
      <FeatureGate feature="work.views">
        <WorkPage />
      </FeatureGate>
    ),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/agency/review",
    component: () => (
      <FeatureGate feature="review.wedge">
        <ReviewQueuePage />
      </FeatureGate>
    ),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/agency/review/$deliverableId",
    component: () => {
      const { deliverableId } = useParams({ strict: false }) as { deliverableId: string };
      return (
        <FeatureGate feature="review.wedge">
          <RealtimeRoom id={`review:${deliverableId}`}>
            <ReviewRoom />
          </RealtimeRoom>
        </FeatureGate>
      );
    },
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/agency/inbox",
    component: () => (
      <FeatureGate feature="collaboration.live">
        <InboxPage />
      </FeatureGate>
    ),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/agency/team",
    component: TeamPage,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/agency/settings",
    component: AgencySettingsPage,
  }),
  /*
   * Automation used to live at `/agency/settings`, so the one link in the sidebar
   * labelled "Settings" opened a rule builder and the workspace's own name,
   * branding and defaults were unreachable. It has its own address now.
   */
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/agency/automation",
    component: () => (
      <FeatureGate feature="automation">
        <AutomationPage />
      </FeatureGate>
    ),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/agency/settings/pipelines",
    component: () => (
      <FeatureGate feature="review.wedge">
        <PipelineEditorPage />
      </FeatureGate>
    ),
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/client/home",
    component: ClientHome,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/client/projects",
    component: ClientProjects,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/client/review",
    component: ClientReview,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/client/review/$deliverableId",
    component: () => {
      const { deliverableId } = useParams({ strict: false }) as { deliverableId: string };
      return (
        <FeatureGate feature="review.wedge">
          <RealtimeRoom id={`review:${deliverableId}:client`}>
            <ReviewRoom clientMode />
          </RealtimeRoom>
        </FeatureGate>
      );
    },
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/client/approved",
    component: ClientApproved,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/admin/agencies",
    component: AdminAgencies,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/share/$token",
    component: ShareReviewPage,
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/intake/$slug",
    component: IntakePage,
  }),
  /* `/admin/users` rendered the agencies list, so the address and the screen
   * disagreed. There is no user-level admin screen, so the link is gone from the
   * rail and the address now lands where the content actually is. */
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/admin/users",
    beforeLoad: () => {
      throw redirect({ to: "/admin/agencies" });
    },
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/admin/audit",
    component: () => (
      <FeatureGate feature="analytics">
        <AdminAudit />
      </FeatureGate>
    ),
  }),
];

const routeTree = rootRoute.addChildren([indexRoute, ...routes]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  /*
   * `errorComponent` on the root route only covers the root's own component. Every
   * other route fell through to the router's built-in "Something went wrong! /
   * Show Error" markup — unstyled system chrome on a black page. This is the
   * fallback for all of them.
   */
  defaultErrorComponent: RouteError,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
