import { TriangleAlert, X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef } from "react";

/**
 * The stop before something that is hard to undo.
 *
 * Archiving a client or a project used to happen on a single click, with no
 * warning, no statement of what else it took with it, and no way back from the
 * screen you were on. This names the record, says what will happen to everything
 * underneath it, and says whether it can be reversed — then offers a button that
 * repeats the action rather than saying "Confirm".
 */
export function ConfirmDialog({
  title,
  body,
  consequence,
  confirmLabel,
  pendingLabel,
  cancelLabel = "Keep it as it is",
  tone = "warning",
  pending = false,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  /** What is about to happen, naming the record. */
  body: ReactNode;
  /** What else it affects, and whether it can be undone. */
  consequence?: ReactNode;
  /** Repeats the action: "Archive Imperial Living", never "Confirm". */
  confirmLabel: string;
  pendingLabel?: string;
  cancelLabel?: string;
  tone?: "warning" | "danger";
  pending?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const headingId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Focus lands on the way out, not on the destructive button: a stray Enter
    // should cancel, not confirm.
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="review-dialog confirm-dialog" data-tone={tone}>
      <button
        type="button"
        className="review-dialog__backdrop"
        onClick={onClose}
        aria-label={`Close ${title}`}
      />
      <section role="alertdialog" aria-modal="true" aria-labelledby={headingId}>
        <div>
          <strong id={headingId}>
            <TriangleAlert size={16} aria-hidden="true" />
            {title}
          </strong>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <p className="confirm-dialog__body">{body}</p>
        {consequence ? <p className="confirm-dialog__consequence">{consequence}</p> : null}

        {error ? (
          <p className="form-dialog__error" role="alert">
            {error}
          </p>
        ) : null}

        <footer className="form-dialog__foot">
          <button
            ref={cancelRef}
            type="button"
            className="form-dialog__cancel"
            onClick={onClose}
            disabled={pending}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="confirm-dialog__go"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? (pendingLabel ?? `${confirmLabel}…`) : confirmLabel}
          </button>
        </footer>
      </section>
    </div>
  );
}
