import { CircleHelp, Info, Loader2, TriangleAlert, X } from "lucide-react";
import {
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Popover, useAnchorRect } from "./popover";

export function Button({
  className = "",
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return <button className={`rx-button rx-button--${variant} ${className}`} {...props} />;
}

export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rx-card ${className}`} {...props} />;
}

const statusLabels: Record<string, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In progress",
  READY_FOR_INTERNAL_REVIEW: "Ready for internal review",
  UNDER_INTERNAL_REVIEW: "Internal review",
  INTERNAL_APPROVED: "Internal approved",
  UNDER_CLIENT_REVIEW: "Waiting on client",
  REVISION_REQUESTED: "Changes requested",
  APPROVED: "Approved",
  DELIVERED: "Delivered",
  ARCHIVED: "Archived",
  ACTIVE: "Active",
  DRAFT: "Draft",
  WAITING_FOR_CLIENT: "Waiting on client",
  COMPLETED: "Completed",
  // Client health, from the portfolio roll-up.
  HEALTHY: "Healthy",
  WATCH: "Watch",
  AT_RISK: "At risk",
  // Team roster roles.
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
  VIEWER: "Viewer",
  SUSPENDED: "Suspended",
};

/**
 * Anything not in the table above still gets sentence case rather than the raw
 * enum — `AT_RISK` shouted out of a chip and read as a rendering bug. Exported
 * because chips were not the only place raw enums reached the screen: work lists
 * printed `URGENT`, automation printed `INTERNAL_APPROVED`.
 */
export function humanize(status: string) {
  const words = status.replaceAll("_", " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The display name for a status, for the places that need the text without the chip. */
export function statusLabel(status: string) {
  return statusLabels[status] ?? humanize(status);
}

export function StatusChip({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  return (
    <span className="rx-status" data-status={normalized}>
      <span className="rx-status__dot" aria-hidden="true" />
      {statusLabel(status)}
    </span>
  );
}

export function EmptyState({
  eyebrow,
  title,
  body,
  action,
  icon,
  tone = "standalone",
}: {
  eyebrow?: string;
  title: string;
  body: string;
  action?: ReactNode;
  icon?: ReactNode;
  /**
   * `standalone` is the page-level card. `inset` is for an empty state that already
   * sits inside a panel — it drops the border and the display-sized heading, which
   * otherwise read as a second card crammed inside the first.
   */
  tone?: "standalone" | "inset";
}) {
  return (
    <div className="rx-empty" data-tone={tone}>
      {icon ? (
        <span className="rx-empty__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {eyebrow ? <span className="rx-eyebrow">{eyebrow}</span> : null}
      <h2>{title}</h2>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  note,
  help,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  note: string;
  /** How the number is worked out. A metric nobody can define is a metric nobody trusts. */
  help?: ReactNode;
  tone?: "neutral" | "blue" | "violet" | "teal" | "orange" | "green";
}) {
  return (
    <Card className="rx-metric" data-tone={tone}>
      <div className="rx-metric__top">
        <span>
          {label}
          {help ? <HelpTip label={label}>{help}</HelpTip> : null}
        </span>
        <span className="rx-metric__signal" aria-hidden="true" />
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </Card>
  );
}

export function Avatar({ initials, label }: { initials: string; label: string }) {
  return (
    <span className="rx-avatar" role="img" aria-label={label} title={label}>
      {initials}
    </span>
  );
}

/**
 * The explanation attached to a control.
 *
 * Icon-only and jargon controls were previously explained only by a `title`
 * attribute, which never appears on touch and never appears for keyboard users.
 * This is a real disclosure: focusable, dismissible with Escape, and it can carry
 * a sentence rather than three words.
 */
export function HelpTip({
  label,
  children,
  align = "start",
}: {
  /** What the tip is about, e.g. "Average turnaround". Read out to screen readers. */
  label: string;
  children: ReactNode;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const anchor = useAnchorRect(trigger.current, open);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="rx-helptip__trigger"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`What is ${label}?`}
        onClick={() => setOpen((value) => !value)}
      >
        <CircleHelp size={13} strokeWidth={2} aria-hidden="true" />
      </button>
      {open ? (
        <Popover
          anchor={anchor}
          onDismiss={() => setOpen(false)}
          ignore={trigger.current}
          className="rx-helptip"
          minWidth={260}
          align={align}
        >
          <div id={id} role="note">
            <strong>{label}</strong>
            <div className="rx-helptip__body">{children}</div>
          </div>
        </Popover>
      ) : null}
    </>
  );
}

/**
 * A framed piece of guidance in the flow of a page: what this screen expects, why
 * something is unavailable, what a setting will do. Not a toast — it stays put.
 */
export function Callout({
  tone = "info",
  title,
  children,
  action,
  onDismiss,
}: {
  tone?: "info" | "warning" | "danger" | "success";
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  onDismiss?: () => void;
}) {
  const Icon = tone === "info" || tone === "success" ? Info : TriangleAlert;
  return (
    <div className="rx-callout" data-tone={tone} role={tone === "danger" ? "alert" : undefined}>
      <Icon size={16} aria-hidden="true" />
      <div className="rx-callout__text">
        {title ? <strong>{title}</strong> : null}
        <div>{children}</div>
        {action ? <div className="rx-callout__action">{action}</div> : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          className="rx-callout__close"
          aria-label="Dismiss"
          onClick={onDismiss}
        >
          <X size={14} />
        </button>
      ) : null}
    </div>
  );
}

export type Step = {
  /** Short imperative title: "Add your first client". */
  title: string;
  /** What this step is for and what it unlocks. */
  body: string;
  status: "done" | "current" | "todo";
  action?: ReactNode;
  /** Shown under a done step, e.g. "3 clients". */
  detail?: string;
};

/**
 * Step 1 → 2 → 3 → done, with the current step called out. Used for the first-run
 * setup guide and for any multi-screen workflow where the user needs to know how
 * far through they are and what is left.
 */
export function Steps({ steps }: { steps: Step[] }) {
  return (
    <ol className="rx-steps">
      {steps.map((step, index) => (
        <li key={step.title} data-status={step.status}>
          <span className="rx-steps__marker" aria-hidden="true">
            {step.status === "done" ? "✓" : index + 1}
          </span>
          <div className="rx-steps__body">
            <strong>
              {step.title}
              <span className="rx-steps__state">
                {step.status === "done"
                  ? "Done"
                  : step.status === "current"
                    ? "Do this next"
                    : "Not started"}
              </span>
            </strong>
            <p>{step.body}</p>
            {step.detail ? <small>{step.detail}</small> : null}
            {step.action && step.status !== "done" ? (
              <div className="rx-steps__action">{step.action}</div>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * A setting the user switches on or off.
 *
 * Every switch carries three things a bare toggle never has: what it is called in
 * the user's language, what it does, and — once it is on — what changed. The
 * `effect` line is what stops a settings panel becoming a wall of unexplained
 * switches.
 */
export function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled = false,
  effect,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Plain-English consequence of the current position, shown beneath. */
  effect?: string;
}) {
  const id = useId();
  return (
    <div className="rx-toggle" data-disabled={disabled}>
      <div className="rx-toggle__text">
        <label htmlFor={id}>{label}</label>
        <p>{hint}</p>
        {effect ? <small>{effect}</small> : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        className="rx-switch"
        data-on={checked}
        onClick={() => onChange(!checked)}
      >
        <span aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * A choice between two or three mutually exclusive views of the same list.
 *
 * Replaces the buttons that read `Active only` / `Every status`, where the label
 * was ambiguous between the current state and the state a click would produce.
 * Here the selected option is visibly selected and every option is always visible.
 */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string; hint?: string }>;
  onChange: (next: T) => void;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset is for form controls; these are buttons.
    <div className="rx-segmented" role="group" aria-label={label}>
      <span className="rx-segmented__label">{label}</span>
      <div>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            data-active={option.value === value}
            aria-pressed={option.value === value}
            title={option.hint}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Reserved space while content loads, so the page does not jump when it arrives. */
export function Skeleton({ lines = 3, label }: { lines?: number; label?: string }) {
  return (
    <div className="rx-skeleton" role="status" aria-live="polite">
      <span className="rx-visually-hidden">{label ?? "Loading…"}</span>
      {Array.from({ length: lines }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length decorative bars
        <i key={index} style={{ width: `${100 - (index % 3) * 14}%` }} aria-hidden="true" />
      ))}
    </div>
  );
}

/**
 * Whether the thing you just changed has actually been stored.
 *
 * Settings that save on change are the classic place where a user cannot tell if
 * their edit took. This states it: unsaved, saving, saved, or failed with the
 * reason.
 */
export function SaveState({
  state,
  error,
  savedLabel = "Saved",
}: {
  state: "idle" | "dirty" | "saving" | "saved" | "error";
  error?: string | null;
  savedLabel?: string;
}) {
  if (state === "idle") return null;
  return (
    <p className="rx-savestate" data-state={state} role="status" aria-live="polite">
      {state === "saving" ? <Loader2 size={13} className="spin" aria-hidden="true" /> : null}
      {state === "dirty"
        ? "Unsaved changes"
        : state === "saving"
          ? "Saving…"
          : state === "saved"
            ? savedLabel
            : (error ?? "Could not save. Try again.")}
    </p>
  );
}
