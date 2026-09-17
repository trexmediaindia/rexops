export const featureKeys = [
  "files.versioning",
  "review.wedge",
  "collaboration.live",
  "work.views",
  "automation",
  "analytics",
] as const;

export type FeatureKey = (typeof featureKeys)[number];
export type FeatureRegistry = Record<FeatureKey, boolean>;

const envKeys: Record<FeatureKey, string> = {
  "files.versioning": "FEATURE_FILES_VERSIONING",
  "review.wedge": "FEATURE_REVIEW_WEDGE",
  "collaboration.live": "FEATURE_COLLABORATION_LIVE",
  "work.views": "FEATURE_WORK_VIEWS",
  automation: "FEATURE_AUTOMATION",
  analytics: "FEATURE_ANALYTICS",
};

function configuredBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined || value === "") return fallback;
  return value === "1" || value.toLowerCase() === "true";
}

export function featureRegistry(
  env: Record<string, string | undefined> = process.env,
): FeatureRegistry {
  const testDefaults = env.NODE_ENV === "test";
  const collaborationRequested = configuredBoolean(
    env[envKeys["collaboration.live"]],
    testDefaults && Boolean(env.LIVEBLOCKS_SECRET_KEY),
  );
  return {
    "files.versioning": configuredBoolean(env[envKeys["files.versioning"]], testDefaults),
    "review.wedge": configuredBoolean(env[envKeys["review.wedge"]], testDefaults),
    "collaboration.live":
      collaborationRequested &&
      (env.NODE_ENV !== "production" || Boolean(env.LIVEBLOCKS_SECRET_KEY)),
    "work.views": configuredBoolean(env[envKeys["work.views"]], false),
    automation: configuredBoolean(env[envKeys.automation], false),
    analytics: configuredBoolean(env[envKeys.analytics], false),
  };
}

export function isFeatureEnabled(key: FeatureKey, env = process.env) {
  return featureRegistry(env)[key];
}
