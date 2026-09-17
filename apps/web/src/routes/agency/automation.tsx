import { Button, Callout, EmptyState, Select, Skeleton, StatusChip, statusLabel } from "@rexops/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, ChevronDown, Plus, X } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { AgencyShell } from "../../components/app-shell";
import { Field } from "../../components/ui/field";
import { PageHeader } from "../../components/ui/page-header";
import { request } from "../../lib/request";

/*
 * The automation screen used to ask for a trigger enum, an action enum and a
 * JSON object, and left the user to work out which JSON keys each action reads.
 * A rule is now written as a sentence — when this happens, do that — and the
 * JSON is generated from it. The raw payload is still reachable, behind Advanced,
 * for the rules the sentence cannot express.
 */

type TriggerOption = {
  value: string;
  /** Reads as the middle of "When …". */
  when: string;
  hint: string;
};

const TRIGGERS: TriggerOption[] = [
  {
    value: "READY_FOR_INTERNAL_REVIEW",
    when: "someone marks a deliverable ready for internal review",
    hint: "The editor has finished a cut and handed it to your team.",
  },
  {
    value: "UNDER_INTERNAL_REVIEW",
    when: "internal review starts on a deliverable",
    hint: "Your own team has opened it and started leaving comments.",
  },
  {
    value: "INTERNAL_APPROVED",
    when: "your team approves a deliverable internally",
    hint: "The usual place to hand work over to the client automatically.",
  },
  {
    value: "UNDER_CLIENT_REVIEW",
    when: "a deliverable reaches the client for review",
    hint: "The client can now see it and comment on it.",
  },
  {
    value: "REVISION_REQUESTED",
    when: "someone asks for changes",
    hint: "A reviewer has sent it back rather than approving it.",
  },
  {
    value: "APPROVED",
    when: "a deliverable is approved by the client",
    hint: "The sign-off is recorded against that exact version.",
  },
  {
    value: "DELIVERED",
    when: "a deliverable is marked delivered",
    hint: "The final file has gone out.",
  },
  {
    value: "PENDING",
    when: "a deliverable is created",
    hint: "Before any work has started on it.",
  },
  {
    value: "IN_PROGRESS",
    when: "work starts on a deliverable",
    hint: "Someone has picked it up.",
  },
];

type DetailField = {
  name: string;
  label: string;
  hint: string;
  placeholder?: string;
  kind?: "text" | "status" | "url";
  required?: boolean;
};

type ActionOption = {
  value: string;
  /** Reads as the middle of "… then RexOps will …". */
  does: string;
  hint: string;
  detail: DetailField[];
  /** Builds the API payload from the answers to `detail`. */
  config: (values: Record<string, string>) => Record<string, unknown>;
  /** One line naming exactly what the rule will do, using the values entered. */
  sentence: (values: Record<string, string>) => string;
};

const STATUS_CHOICES = [
  "IN_PROGRESS",
  "READY_FOR_INTERNAL_REVIEW",
  "UNDER_INTERNAL_REVIEW",
  "INTERNAL_APPROVED",
  "UNDER_CLIENT_REVIEW",
  "REVISION_REQUESTED",
  "APPROVED",
  "DELIVERED",
  "ARCHIVED",
];

const ACTIONS: ActionOption[] = [
  {
    value: "UPDATE_STATUS",
    does: "move the deliverable to another stage",
    hint: "The commonest rule: it pushes work along the pipeline without anyone clicking.",
    detail: [
      {
        name: "status",
        label: "Move it to",
        hint: "The stage the deliverable lands in. Everyone watching it sees the change.",
        kind: "status",
        required: true,
      },
    ],
    config: (values) => ({ status: values.status }),
    sentence: (values) => `move it to ${statusLabel(values.status ?? "")}`,
  },
  {
    value: "NOTIFY",
    does: "send a notification",
    hint: "A message in RexOps for the people following that deliverable.",
    detail: [
      {
        name: "title",
        label: "What the notification says",
        hint: "One line. Write it so it makes sense out of context, in a list of alerts.",
        placeholder: "A cut is ready for you to look at",
        required: true,
      },
    ],
    config: (values) => ({ title: values.title }),
    sentence: (values) => `send the notification "${values.title ?? ""}"`,
  },
  {
    value: "CREATE_TASK",
    does: "create a task",
    hint: "Adds a piece of work to the deliverable so it is not forgotten.",
    detail: [
      {
        name: "title",
        label: "Task name",
        hint: "What the task asks someone to do.",
        placeholder: "Address the requested changes",
        required: true,
      },
    ],
    config: (values) => ({ title: values.title }),
    sentence: (values) => `create the task "${values.title ?? ""}"`,
  },
  {
    value: "ASSIGN",
    does: "assign it to someone",
    hint: "Hands the deliverable to a specific person on your team.",
    detail: [
      {
        name: "userId",
        label: "Person's user ID",
        hint: "Copy it from the team screen. RexOps does not look people up by name here yet.",
        placeholder: "usr_8f2c…",
        required: true,
      },
    ],
    config: (values) => ({ userId: values.userId }),
    sentence: (values) => `assign it to ${values.userId ?? ""}`,
  },
  {
    value: "SET_FIELD",
    does: "set a field on the deliverable",
    hint: "Writes one value, such as priority, on the record itself.",
    detail: [
      {
        name: "field",
        label: "Field name",
        hint: "The field on the deliverable record, for example priority or dueDate.",
        placeholder: "priority",
        required: true,
      },
      {
        name: "value",
        label: "Value to write",
        hint: "Exactly what gets stored in that field.",
        placeholder: "URGENT",
        required: true,
      },
    ],
    config: (values) => ({ field: values.field, value: values.value }),
    sentence: (values) => `set ${values.field ?? "the field"} to ${values.value ?? ""}`,
  },
  {
    value: "HTTP_REQUEST",
    does: "call another system",
    hint: "Posts the event to a web address, for Slack, Zapier or your own service.",
    detail: [
      {
        name: "url",
        label: "Web address to call",
        hint: "RexOps sends a POST request with the deliverable and the event.",
        placeholder: "https://hooks.example.com/rexops",
        kind: "url",
        required: true,
      },
    ],
    config: (values) => ({ url: values.url, method: "POST" }),
    sentence: (values) => `send a POST request to ${values.url ?? ""}`,
  },
];

const FIRST_TRIGGER = TRIGGERS[0] as TriggerOption;
const FIRST_ACTION = ACTIONS[0] as ActionOption;
const FIRST_STATUS = STATUS_CHOICES[0] as string;

/** Prefills for the rule dialog. Nothing is created until the user reads it and saves. */
const RECIPES: Array<{
  name: string;
  event: string;
  action: string;
  detail: Record<string, string>;
  summary: string;
}> = [
  {
    name: "Send internally approved work to the client",
    event: "INTERNAL_APPROVED",
    action: "UPDATE_STATUS",
    detail: { status: "UNDER_CLIENT_REVIEW" },
    summary:
      "The moment your team signs off, the client sees it. No one has to remember to send it.",
  },
  {
    name: "Raise a task when changes are requested",
    event: "REVISION_REQUESTED",
    action: "CREATE_TASK",
    detail: { title: "Address the requested changes" },
    summary: "Every sent-back deliverable gets a task, so revisions do not sit unclaimed.",
  },
  {
    name: "Tell another system when work is approved",
    event: "APPROVED",
    action: "HTTP_REQUEST",
    detail: { url: "" },
    summary: "Posts the approval to a web address you choose. Add the address before saving.",
  },
];

type Rule = {
  id: string;
  name: string;
  kind: string;
  enabled: boolean;
  trigger: { event?: string };
  actions: Array<{ type: string; config?: Record<string, unknown> }>;
};

type Draft = {
  name: string;
  event: string;
  action: string;
  detail: Record<string, string>;
};

const EMPTY_DRAFT: Draft = {
  name: "",
  event: FIRST_TRIGGER.value,
  action: FIRST_ACTION.value,
  detail: {},
};

function triggerFor(event?: string) {
  return TRIGGERS.find((item) => item.value === event);
}

function actionFor(type?: string) {
  return ACTIONS.find((item) => item.value === type);
}

/** "When your team approves a deliverable internally, move it to Client review." */
function describeRule(rule: Rule) {
  const when = triggerFor(rule.trigger.event)?.when ?? "its trigger fires";
  const parts = rule.actions.map((entry) => {
    const action = actionFor(entry.type);
    if (!action) return entry.type.replaceAll("_", " ").toLowerCase();
    const values = Object.fromEntries(
      Object.entries(entry.config ?? {}).map(([key, value]) => [key, String(value ?? "")]),
    );
    return action.sentence(values);
  });
  return `When ${when}, RexOps will ${parts.join(", then ") || "do nothing"}.`;
}

export function AutomationPage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);

  const rules = useQuery({
    queryKey: ["automation-rules"],
    queryFn: () => request<Rule[]>("/api/automation/rules"),
  });

  const createRule = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      request("/api/automation/rules", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-rules"] });
      setDraft(null);
    },
  });

  const toggleRule = useMutation({
    mutationFn: (rule: Rule) =>
      request(`/api/automation/rules/${rule.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !rule.enabled }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automation-rules"] }),
  });

  const startBlank = () => {
    createRule.reset();
    setDraft({ ...EMPTY_DRAFT, detail: {} });
  };

  const startRecipe = (recipe: (typeof RECIPES)[number]) => {
    createRule.reset();
    setDraft({
      name: recipe.name,
      event: recipe.event,
      action: recipe.action,
      detail: { ...recipe.detail },
    });
  };

  const live = (rules.data ?? []).filter((rule) => rule.enabled).length;

  return (
    <AgencyShell>
      <PageHeader
        eyebrow="Work that happens without you"
        title="Automation"
        purpose="A rule watches for one thing happening to a deliverable, then does something in response — every time, without anyone remembering to."
        help={
          <>
            <p>
              Rules run on every deliverable in this workspace. They fire when a deliverable's stage
              changes, which is the same moment the status chip changes on screen.
            </p>
            <p>
              A rule that is turned off stays here and stops firing. Nothing that already happened
              is undone.
            </p>
          </>
        }
        primary={
          <Button onClick={startBlank}>
            <Plus size={16} /> Write a rule
          </Button>
        }
        status={
          rules.data?.length ? (
            <span className="page-header__status">
              {live} of {rules.data.length} rule{rules.data.length === 1 ? "" : "s"} switched on
            </span>
          ) : null
        }
      />

      <div className="automation-layout">
        <section className="panel">
          <div className="panel__heading">
            <div>
              <h2>Your rules</h2>
              <p>Each one is read as a sentence: when something happens, RexOps does something.</p>
            </div>
          </div>

          {rules.isPending ? (
            <Skeleton lines={4} label="Loading rules" />
          ) : rules.isError ? (
            <Callout tone="danger" title="Rules did not load">
              {(rules.error as Error).message}
              <div className="rx-callout__action">
                <Button variant="secondary" onClick={() => rules.refetch()}>
                  Try loading rules again
                </Button>
              </div>
            </Callout>
          ) : !rules.data?.length ? (
            <EmptyState
              tone="inset"
              icon={<Bot size={22} />}
              title="No rules yet"
              body="Nothing happens automatically in this workspace. Start from one of the ready-made rules on the right, or write your own — it takes two choices."
              action={
                <Button onClick={startBlank}>
                  <Plus size={16} /> Write your first rule
                </Button>
              }
            />
          ) : (
            <div className="rule-list">
              {rules.data.map((rule) => (
                <article key={rule.id} data-enabled={rule.enabled}>
                  <div>
                    <strong>{rule.name}</strong>
                    <p>{describeRule(rule)}</p>
                  </div>
                  <StatusChip status={rule.enabled ? "ACTIVE" : "INACTIVE"} />
                  <button
                    type="button"
                    className={`rx-action ${rule.enabled ? "" : "rx-action--accent"}`}
                    disabled={toggleRule.isPending}
                    onClick={() => toggleRule.mutate(rule)}
                  >
                    {rule.enabled ? "Turn this rule off" : "Turn this rule on"}
                  </button>
                </article>
              ))}
            </div>
          )}

          {toggleRule.isError ? (
            <Callout tone="danger" title="That rule was not changed">
              {(toggleRule.error as Error).message} It is still in the state shown above.
            </Callout>
          ) : null}
        </section>

        <section className="recipe-gallery">
          <div className="recipe-gallery__intro">
            <h2>Ready-made rules</h2>
            <p>
              Opens the rule already filled in. You read it and change it before anything saves.
            </p>
          </div>
          {RECIPES.map((recipe) => (
            <article key={recipe.name}>
              <div>
                <strong>{recipe.name}</strong>
                <span>{recipe.summary}</span>
              </div>
              <button type="button" onClick={() => startRecipe(recipe)}>
                Start from this
              </button>
            </article>
          ))}
        </section>
      </div>

      {/* These were two tabs that opened screens describing features that do not
          exist yet. A tab that leads nowhere costs more trust than a plain note. */}
      <Callout tone="info" title="Not built yet: intake forms and template packs">
        Public request forms and repeating project templates are planned but not part of this
        release. Rules above are the automation that works today.
      </Callout>

      {draft ? (
        <RuleDialog
          draft={draft}
          onChange={setDraft}
          pending={createRule.isPending}
          error={createRule.error ? (createRule.error as Error).message : null}
          onSave={(body) => createRule.mutate(body)}
          onClose={() => {
            createRule.reset();
            setDraft(null);
          }}
        />
      ) : null}
    </AgencyShell>
  );
}

function RuleDialog({
  draft,
  onChange,
  pending,
  error,
  onSave,
  onClose,
}: {
  draft: Draft;
  onChange: (next: Draft) => void;
  pending: boolean;
  error: string | null;
  onSave: (body: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const headingId = useId();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [rawConfig, setRawConfig] = useState("");
  const [rawProblem, setRawProblem] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const trigger = triggerFor(draft.event) ?? FIRST_TRIGGER;
  const action = actionFor(draft.action) ?? FIRST_ACTION;

  const missing = useMemo(() => {
    const gaps: string[] = [];
    if (!draft.name.trim()) gaps.push("Rule name");
    for (const field of action.detail) {
      if (field.required && !draft.detail[field.name]?.trim()) gaps.push(field.label);
    }
    return gaps;
  }, [draft, action]);

  const preview = `When ${trigger.when}, RexOps will ${action.sentence(draft.detail)}.`;

  const submit = () => {
    setSubmitted(true);
    if (missing.length || pending) return;
    let config: Record<string, unknown> = action.config(draft.detail);
    if (rawConfig.trim()) {
      try {
        const parsed = JSON.parse(rawConfig);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          setRawProblem(
            'The advanced payload has to be a JSON object, like {"status":"APPROVED"}.',
          );
          return;
        }
        config = parsed as Record<string, unknown>;
      } catch {
        setRawProblem("That is not valid JSON. Check for a missing quote, comma or brace.");
        return;
      }
    }
    setRawProblem(null);
    onSave({
      name: draft.name.trim(),
      kind: "RULE",
      scope: "AGENCY",
      trigger: { event: draft.event },
      conditions: {},
      actions: [{ type: draft.action, config }],
    });
  };

  const setDetail = (name: string, value: string) =>
    onChange({ ...draft, detail: { ...draft.detail, [name]: value } });

  return (
    <div className="review-dialog form-dialog rule-dialog">
      <button
        type="button"
        className="review-dialog__backdrop"
        onClick={onClose}
        aria-label="Close the rule editor"
      />
      <section role="dialog" aria-modal="true" aria-labelledby={headingId}>
        <div>
          <strong id={headingId}>Write a rule</strong>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <small>
          Two choices make a rule: what RexOps watches for, and what it does about it. The sentence
          at the bottom is exactly what will run.
        </small>

        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Field
            label="Rule name"
            hint="What your team will see in the list. Name it after what it does."
            error={submitted && !draft.name.trim() ? "Give the rule a name before saving." : null}
          >
            {(props) => (
              <input
                {...props}
                value={draft.name}
                placeholder="Send approved cuts to the client"
                onChange={(event) => onChange({ ...draft, name: event.target.value })}
              />
            )}
          </Field>

          <Field label="When this happens" hint={trigger.hint}>
            {(props) => (
              <Select
                id={props.id}
                value={draft.event}
                onChange={(value) => onChange({ ...draft, event: value })}
                options={TRIGGERS.map((item) => ({
                  value: item.value,
                  label: item.when.charAt(0).toUpperCase() + item.when.slice(1),
                  hint: item.hint,
                }))}
              />
            )}
          </Field>

          <Field label="RexOps will" hint={action.hint}>
            {(props) => (
              <Select
                id={props.id}
                value={draft.action}
                onChange={(value) => onChange({ ...draft, action: value, detail: {} })}
                options={ACTIONS.map((item) => ({
                  value: item.value,
                  label: item.does.charAt(0).toUpperCase() + item.does.slice(1),
                  hint: item.hint,
                }))}
              />
            )}
          </Field>

          {action.detail.map((field) => {
            const value = draft.detail[field.name] ?? "";
            const gap = submitted && field.required && !value.trim();
            return (
              <Field
                key={field.name}
                label={field.label}
                hint={field.hint}
                optional={!field.required}
                error={gap ? `${field.label} is needed before this rule can be saved.` : null}
              >
                {(props) =>
                  field.kind === "status" ? (
                    <Select
                      id={props.id}
                      value={value || FIRST_STATUS}
                      onChange={(next) => setDetail(field.name, next)}
                      options={STATUS_CHOICES.map((status) => ({
                        value: status,
                        label: statusLabel(status),
                      }))}
                    />
                  ) : (
                    <input
                      {...props}
                      type={field.kind === "url" ? "url" : "text"}
                      value={value}
                      placeholder={field.placeholder}
                      onChange={(event) => setDetail(field.name, event.target.value)}
                    />
                  )
                }
              </Field>
            );
          })}

          <p className="rule-preview">
            <span>This rule will run as</span>
            <strong>{preview}</strong>
          </p>

          {/* The JSON that used to be the only way in is still here for the rules
              the sentence cannot express — just no longer the front door. */}
          <div className="rule-advanced">
            <button
              type="button"
              aria-expanded={showAdvanced}
              onClick={() => setShowAdvanced((open) => !open)}
            >
              <ChevronDown size={15} aria-hidden="true" /> Advanced: write the payload yourself
            </button>
            {showAdvanced ? (
              <Field
                label="Action payload"
                optional
                hint="A JSON object sent to the action instead of the fields above. Leave it empty unless you know the action reads keys the form does not offer."
                error={rawProblem}
              >
                {(props) => (
                  <textarea
                    {...props}
                    rows={3}
                    value={rawConfig}
                    placeholder={JSON.stringify(action.config(draft.detail))}
                    onChange={(event) => {
                      setRawConfig(event.target.value);
                      setRawProblem(null);
                    }}
                  />
                )}
              </Field>
            ) : null}
          </div>

          {error ? (
            <p className="form-dialog__error" role="alert">
              {error}
            </p>
          ) : null}

          <footer className="form-dialog__foot">
            {missing.length ? (
              <p className="form-dialog__blocked">Still needed: {missing.join(", ")}</p>
            ) : null}
            <button type="button" className="form-dialog__cancel" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="form-dialog__submit"
              disabled={missing.length > 0 || pending}
            >
              {pending ? "Saving the rule…" : "Save and switch this rule on"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
