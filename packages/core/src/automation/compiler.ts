export type AutomationRule = {
  trigger: { event: string };
  conditions: unknown;
  actions: readonly { type: string; config?: Record<string, unknown> }[];
};

export type CompiledRule = {
  eventType: string;
  evaluate: (context: Record<string, unknown>) => boolean;
  actions: AutomationRule["actions"];
};

export function compileRule(rule: AutomationRule): CompiledRule {
  return {
    eventType: rule.trigger.event,
    evaluate: () => true,
    actions: rule.actions,
  };
}
