import { DatePicker, HelpTip, Select } from "@rexops/ui";
import { X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";

export type DialogField = {
  name: string;
  label: string;
  type?: "text" | "email" | "url" | "tel" | "date" | "textarea" | "select";
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
  options?: Array<{ value: string; label: string; hint?: string }>;
  /** One sentence, always visible: what belongs in this field and what it affects. */
  hint?: string;
  /** A paragraph, behind a help tip, for fields that need more than a sentence. */
  help?: ReactNode;
  /** Returns a plain-language problem, or null. Runs on blur and before submit. */
  validate?: (value: string) => string | null;
};

function initialValue(field: DialogField) {
  if (field.defaultValue) return field.defaultValue;
  if (field.type === "select") return field.options?.[0]?.value ?? "";
  return "";
}

/**
 * Built-in checks so every dialog does not have to repeat them. The messages say
 * what a valid value looks like — "Enter an email address, like hello@client.com"
 * rather than "Invalid input".
 */
function defaultProblem(field: DialogField, value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return field.required ? `${field.label} is needed before you can save.` : null;
  }
  if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return "Enter an email address, like hello@client.com.";
  }
  if (field.type === "url" && !/^https?:\/\/\S+\.\S+/.test(trimmed)) {
    return "Enter a full web address starting with https://";
  }
  return null;
}

function problemFor(field: DialogField, value: string) {
  return field.validate?.(value) ?? defaultProblem(field, value);
}

/**
 * The create/edit dialog behind every "Add …" button.
 *
 * Three things it now does that it did not: it says which fields are optional
 * rather than only starring the required ones, it checks what you typed when you
 * leave a field and says what a valid value looks like, and when the save button
 * is unavailable it names the field that is holding it up instead of sitting
 * there greyed out with no explanation.
 */
export function FormDialog({
  title,
  description,
  fields,
  submitLabel = "Save",
  pendingLabel,
  pending = false,
  error,
  footnote,
  onSubmit,
  onClose,
}: {
  title: string;
  description?: string;
  fields: DialogField[];
  /** Names the action and its result: "Add client", not "Submit". */
  submitLabel?: string;
  /** Shown while the request is in flight. Defaults to the submit label plus an ellipsis. */
  pendingLabel?: string;
  pending?: boolean;
  error?: string | null;
  /** Anything the user should know before saving — what happens next, who sees it. */
  footnote?: ReactNode;
  onSubmit: (values: Record<string, string>) => void;
  onClose: () => void;
}) {
  const headingId = useId();
  const firstField = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((field) => [field.name, initialValue(field)])),
  );
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    firstField.current?.focus();
  }, []);

  // Select options usually arrive from a query, so a dialog opened on a cold page
  // load starts with none. The control then showed the first option while the form
  // still held "", which left the submit button disabled with a filled-in field on
  // screen. Adopt the first option as soon as the list lands.
  const optionSignature = fields
    .map((field) => `${field.name}:${field.options?.map((option) => option.value).join(",") ?? ""}`)
    .join("|");
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the serialized option lists.
  useEffect(() => {
    setValues((current) => {
      let next = current;
      for (const field of fields) {
        if (field.type !== "select" || !field.options?.length) continue;
        const held = current[field.name];
        if (held && field.options.some((option) => option.value === held)) continue;
        if (next === current) next = { ...current };
        next[field.name] = field.options[0]?.value ?? "";
      }
      return next;
    });
  }, [optionSignature]);

  const problems = fields
    .map((field) => ({ field, problem: problemFor(field, values[field.name] ?? "") }))
    .filter((entry): entry is { field: DialogField; problem: string } => Boolean(entry.problem));
  const missing = fields.filter((field) => field.required && !values[field.name]?.trim());

  const submit = () => {
    setSubmitted(true);
    if (problems.length || pending) return;
    const cleaned: Record<string, string> = {};
    for (const [key, value] of Object.entries(values)) {
      const trimmed = value.trim();
      if (trimmed) cleaned[key] = trimmed;
    }
    onSubmit(cleaned);
  };

  return (
    <div className="review-dialog form-dialog">
      <button
        type="button"
        className="review-dialog__backdrop"
        onClick={onClose}
        aria-label={`Close ${title}`}
      />
      <section role="dialog" aria-modal="true" aria-labelledby={headingId}>
        <div>
          <strong id={headingId}>{title}</strong>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        {description ? <small>{description}</small> : null}

        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          {fields.map((field, index) => {
            const value = values[field.name] ?? "";
            const setValue = (next: string) =>
              setValues((current) => ({ ...current, [field.name]: next }));
            const controlId = `${headingId}-${field.name}`;
            const hintId = `${controlId}-hint`;
            const errorId = `${controlId}-error`;
            const problem = problemFor(field, value);
            // Nobody wants to be told the field is empty before they have typed in
            // it: a problem only surfaces once the field has been left, or once
            // the user has tried to save.
            const shown = (touched[field.name] || submitted) && problem ? problem : null;
            const describedBy = `${field.hint ? hintId : ""}${shown ? ` ${errorId}` : ""}`.trim();
            const markTouched = () => setTouched((current) => ({ ...current, [field.name]: true }));

            const control =
              field.type === "select" ? (
                <Select
                  id={controlId}
                  value={value}
                  options={field.options ?? []}
                  required={field.required}
                  onChange={setValue}
                />
              ) : field.type === "date" ? (
                <DatePicker id={controlId} value={value} onChange={setValue} />
              ) : field.type === "textarea" ? (
                <textarea
                  id={controlId}
                  ref={index === 0 ? (firstField as React.Ref<HTMLTextAreaElement>) : undefined}
                  value={value}
                  rows={3}
                  placeholder={field.placeholder}
                  aria-describedby={describedBy || undefined}
                  aria-invalid={Boolean(shown)}
                  onBlur={markTouched}
                  onChange={(event) => setValue(event.target.value)}
                />
              ) : (
                <input
                  id={controlId}
                  ref={index === 0 ? (firstField as React.Ref<HTMLInputElement>) : undefined}
                  type={field.type === "url" ? "url" : (field.type ?? "text")}
                  value={value}
                  placeholder={field.placeholder}
                  aria-describedby={describedBy || undefined}
                  aria-invalid={Boolean(shown)}
                  onBlur={markTouched}
                  onChange={(event) => setValue(event.target.value)}
                />
              );

            return (
              <div className="form-dialog__field" key={field.name} data-invalid={Boolean(shown)}>
                <label htmlFor={controlId}>
                  {field.label}
                  {field.required ? (
                    <b className="form-dialog__required">Required</b>
                  ) : (
                    <span className="form-dialog__optional">Optional</span>
                  )}
                  {field.help ? <HelpTip label={field.label}>{field.help}</HelpTip> : null}
                </label>
                {field.hint ? (
                  <em className="form-dialog__hint" id={hintId}>
                    {field.hint}
                  </em>
                ) : null}
                {control}
                {shown ? (
                  <p className="form-dialog__field-error" id={errorId} role="alert">
                    {shown}
                  </p>
                ) : null}
              </div>
            );
          })}

          {footnote ? <p className="form-dialog__footnote">{footnote}</p> : null}

          {error ? (
            <p className="form-dialog__error" role="alert">
              {error}
            </p>
          ) : null}

          <footer className="form-dialog__foot">
            {/* A greyed-out button with no reason is the commonest dead end in this
                app. This says which field is holding it up. */}
            {missing.length ? (
              <p className="form-dialog__blocked">
                Still needed: {missing.map((field) => field.label).join(", ")}
              </p>
            ) : null}
            <button type="button" className="form-dialog__cancel" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="form-dialog__submit"
              disabled={missing.length > 0 || pending}
            >
              {pending ? (pendingLabel ?? `${submitLabel}…`) : submitLabel}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
