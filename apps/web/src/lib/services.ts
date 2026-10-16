import { SERVICES, type ServiceType, serviceOf, serviceStepIndex } from "@rexops/config/services";

export { SERVICES, type ServiceType, serviceOf, serviceStepIndex };

/** For select fields: the three services first, "Other" last. */
export const SERVICE_OPTIONS = (["SOCIAL_MEDIA", "CREATIVES", "ADS", "OTHER"] as const).map(
  (value) => ({ value, label: SERVICES[value].label, hint: SERVICES[value].description }),
);

/** Step name for one piece of work, e.g. "Client approval" or "Scheduled". */
export function stepLabel(
  service: ServiceType,
  item: { status: string; publishedAt?: string | null; publishAt?: string | null },
) {
  const definition = SERVICES[service];
  const index = serviceStepIndex(service, item);
  if (item.status === "REVISION_REQUESTED") return "Changes requested";
  // Approved social/ads work without a date isn't "scheduled" yet.
  if (definition.publishes && index === 4 && !item.publishAt) return "Approved · needs a date";
  return definition.steps[index] ?? definition.steps[definition.steps.length - 1];
}
