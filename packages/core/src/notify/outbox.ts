export type DomainEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> = {
  eventType: string;
  agencyId: string | null;
  payload: TPayload;
  availableAt?: Date;
};

export type OutboxWriter = (event: DomainEvent) => Promise<void>;

export function createOutboxPublisher(write: OutboxWriter) {
  return {
    publish<TPayload extends Record<string, unknown>>(event: DomainEvent<TPayload>) {
      return write(event);
    },
  };
}
