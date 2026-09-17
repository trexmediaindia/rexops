import { useQuery } from "@tanstack/react-query";
import type React from "react";
import { request } from "./request";

export type FeatureKey =
  | "files.versioning"
  | "review.wedge"
  | "collaboration.live"
  | "work.views"
  | "automation"
  | "analytics";

export function useFeatures() {
  return useQuery({
    // The shared helper, not a bare fetch: it throws a `RequestError` carrying the
    // status, which is what stops the query client retrying a 401 three times over
    // while every gated screen sits on a spinner.
    queryKey: ["features"],
    queryFn: () => request<Record<FeatureKey, boolean>>("/api/features"),
    staleTime: 60_000,
  });
}

export function FeatureGate({
  feature,
  children,
}: {
  feature: FeatureKey;
  children: React.ReactNode;
}) {
  const features = useFeatures();
  if (features.isPending) {
    return (
      <main className="not-found">
        <p className="not-found__body">Checking what this workspace has enabled…</p>
      </main>
    );
  }
  /*
   * A failed flag lookup is not the same as a flag that is off. When the session
   * expired, `/api/features` 401'd and every gated screen claimed the feature "is
   * not in this release" — which sent people looking for a plan upgrade instead of
   * signing back in.
   */
  if (features.isError) {
    return (
      <main className="not-found">
        <span className="rx-eyebrow">Error / unavailable</span>
        <h1>Could not check this workspace.</h1>
        <p className="not-found__body">
          The feature list did not load, so this screen is being held back rather than shown in an
          unknown state. Your session may have expired.
        </p>
        <div className="not-found__actions">
          <button
            type="button"
            className="rx-button rx-button--primary"
            onClick={() => features.refetch()}
          >
            Try again
          </button>
          <a className="not-found__link" href="/login">
            Sign in again
          </a>
        </div>
      </main>
    );
  }
  if (!features.data?.[feature]) {
    return (
      <main className="not-found">
        <span className="rx-eyebrow">404 / unreleased</span>
        <h1>That feature is not in this release.</h1>
        <p className="not-found__body">This workspace does not have it switched on yet.</p>
        <a className="not-found__link" href="/">
          Return to RexOps
        </a>
      </main>
    );
  }
  return children;
}
