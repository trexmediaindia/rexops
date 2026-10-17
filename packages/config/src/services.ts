/**
 * The three ways T-Rex-style agencies work with a client, and the steps each one moves
 * through. Every piece of work still runs on the same underlying status machine (and the
 * same internal → client review); a service decides what the steps are *called*, which
 * extra fields a piece of work has (post date and caption for social, go-live date for
 * ads) and which extras the project shows (reports for ads).
 */
export const SERVICE_TYPES = ["SOCIAL_MEDIA", "CREATIVES", "ADS", "OTHER"] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

export const SOCIAL_PLATFORMS = [
  "Instagram",
  "Facebook",
  "LinkedIn",
  "YouTube",
  "X",
  "Pinterest",
] as const;
export const AD_PLATFORMS = ["Meta", "Google"] as const;

type ServiceDefinition = {
  label: string;
  /** One line for the "new project" picker. */
  description: string;
  /** What a single piece of work is called inside this service. */
  itemLabel: string;
  steps: readonly string[];
  /** Does a piece of work go out on a date (post / go live)? */
  publishes: boolean;
  publishVerb: string;
  publishedLabel: string;
  platforms: readonly string[];
  hasReports: boolean;
};

export const SERVICES: Record<ServiceType, ServiceDefinition> = {
  SOCIAL_MEDIA: {
    label: "Social media management",
    description:
      "Plan, create and approve posts, then track them on the calendar until they're live.",
    itemLabel: "Post",
    steps: ["Planned", "Creating", "Team review", "Client approval", "Scheduled", "Posted"],
    publishes: true,
    publishVerb: "Post date",
    publishedLabel: "Posted",
    platforms: SOCIAL_PLATFORMS,
    hasReports: false,
  },
  CREATIVES: {
    label: "Creatives delivery",
    description:
      "Designs, videos and other files that go through rounds of feedback until approved.",
    itemLabel: "Creative",
    steps: ["Brief", "Creating", "Team review", "Client review", "Delivered"],
    publishes: false,
    publishVerb: "Due date",
    publishedLabel: "Delivered",
    platforms: [],
    hasReports: false,
  },
  ADS: {
    label: "Ads management",
    description: "Ad creatives approved by the client, go-live dates, and monthly results reports.",
    itemLabel: "Ad",
    steps: ["Planned", "Creating", "Team review", "Client approval", "Ready to launch", "Live"],
    publishes: true,
    publishVerb: "Go-live date",
    publishedLabel: "Live",
    platforms: AD_PLATFORMS,
    hasReports: true,
  },
  OTHER: {
    label: "Other work",
    description: "Anything else. Simple steps: create, review, approve.",
    itemLabel: "Item",
    steps: ["To do", "Creating", "Team review", "Client review", "Done"],
    publishes: false,
    publishVerb: "Due date",
    publishedLabel: "Done",
    platforms: [],
    hasReports: false,
  },
};

export function serviceOf(value: string | null | undefined): ServiceType {
  return SERVICE_TYPES.includes(value as ServiceType) ? (value as ServiceType) : "OTHER";
}

/**
 * Where a piece of work is in its service's steps (0-based). Published work is always the
 * last step; approved work that still has to go out sits on the step before it.
 */
export function serviceStepIndex(
  service: ServiceType,
  item: { status: string; publishedAt?: string | Date | null },
) {
  const steps = SERVICES[service].steps;
  const last = steps.length - 1;
  if (item.publishedAt) return last;
  switch (item.status) {
    case "PENDING":
      return 0;
    case "IN_PROGRESS":
    case "REVISION_REQUESTED":
      return 1;
    case "READY_FOR_INTERNAL_REVIEW":
    case "UNDER_INTERNAL_REVIEW":
    case "INTERNAL_APPROVED":
      return 2;
    case "UNDER_CLIENT_REVIEW":
      return 3;
    case "APPROVED":
      return SERVICES[service].publishes ? 4 : last;
    default:
      return last;
  }
}
