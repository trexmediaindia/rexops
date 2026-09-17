export type NoopJobPayload = {
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
};

export type MediaJobPayload = {
  eventId: string;
  agencyId: string;
  fileVersionId: string;
  sourceKey: string;
};

export type NotifyJobPayload = {
  eventId: string;
  agencyId: string | null;
  eventType: string;
  payload: Record<string, unknown>;
};

export type AutomationJobPayload = {
  eventId: string;
  agencyId: string | null;
  eventType: string;
  payload: Record<string, unknown>;
};
