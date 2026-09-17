import { HelpTip } from "@rexops/ui";
import { type ReactNode, useId } from "react";

/**
 * One labelled control.
 *
 * The rule this enforces: no control reaches the screen without a visible name,
 * a sentence saying what belongs in it, and — where it matters — its units and
 * range. Placeholders are examples, never labels: they vanish on focus, which is
 * the moment the user needs them most.
 */
export function Field({
  label,
  hint,
  help,
  optional = false,
  error,
  children,
  id: providedId,
}: {
  label: string;
  /** What belongs in this control and what it affects. Always visible. */
  hint?: string;
  /** Longer explanation, behind a help tip, for the ones that need a paragraph. */
  help?: ReactNode;
  optional?: boolean;
  error?: string | null;
  children: (props: {
    id: string;
    "aria-describedby": string;
    "aria-invalid": boolean;
  }) => ReactNode;
  id?: string;
}) {
  const fallback = useId();
  const id = providedId ?? fallback;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  return (
    <div className="rx-field" data-invalid={Boolean(error)}>
      <label htmlFor={id}>
        {label}
        {optional ? <span className="rx-field__optional">Optional</span> : null}
        {help ? <HelpTip label={label}>{help}</HelpTip> : null}
      </label>
      {hint ? (
        <p className="rx-field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {children({
        id,
        "aria-describedby": `${hint ? hintId : ""}${error ? ` ${errorId}` : ""}`.trim(),
        "aria-invalid": Boolean(error),
      })}
      {error ? (
        <p className="rx-field__error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** A group of related settings with its own heading and purpose line. */
export function SettingsSection({
  title,
  purpose,
  children,
  action,
}: {
  title: string;
  purpose: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="settings-section">
      <header>
        <div>
          <h2>{title}</h2>
          <p>{purpose}</p>
        </div>
        {action}
      </header>
      <div className="settings-section__body">{children}</div>
    </section>
  );
}
