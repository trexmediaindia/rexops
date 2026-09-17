import { Columns2, X } from "lucide-react";
import { useState } from "react";
import type { FileVersionView } from "../versioning/types";
import { VersionPicker } from "../versioning/version-picker";
import type { CompareMode } from "./compare-stage";

// Lets the user explicitly choose WHICH two versions to compare (the old Compare button
// just auto-grabbed one). A and B are mutually exclusive — the A≠B guard is enforced both
// by filtering each picker's options and by disabling Compare when they match. See §10.1.

export function CompareDialog({
  versions,
  defaultA,
  defaultMode = "SPLIT",
  onConfirm,
  onClose,
}: {
  versions: FileVersionView[];
  defaultA: string;
  defaultMode?: CompareMode;
  onConfirm: (selection: { a: string; b: string; mode: CompareMode }) => void;
  onClose: () => void;
}) {
  const [a, setA] = useState(defaultA);
  const [b, setB] = useState<string | null>(
    versions.find((version) => version.id !== defaultA)?.id ?? null,
  );
  const [mode, setMode] = useState<CompareMode>(defaultMode);

  const aOptions = versions.filter((version) => version.id !== b);
  const bOptions = versions.filter((version) => version.id !== a);
  const ready = Boolean(a && b && a !== b);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: scrim is a click-out convenience; the dialog has a real Close button and Escape handler.
    <div
      className="compare-dialog__scrim"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div className="compare-dialog" role="dialog" aria-modal="true" aria-label="Compare versions">
        <header className="compare-dialog__head">
          <strong>
            <Columns2 size={15} /> Compare versions
          </strong>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={15} />
          </button>
        </header>

        <div className="compare-dialog__pickers">
          <VersionPicker
            versions={aOptions}
            selectedIds={a ? [a] : []}
            multiple={false}
            label={`A · ${versions.find((v) => v.id === a)?.displayVersion ?? "pick"}`}
            onChange={(ids) => ids[0] && setA(ids[0])}
          />
          <VersionPicker
            versions={bOptions}
            selectedIds={b ? [b] : []}
            multiple={false}
            label={`B · ${versions.find((v) => v.id === b)?.displayVersion ?? "pick"}`}
            onChange={(ids) => setB(ids[0] ?? null)}
          />
        </div>

        <fieldset className="compare-dialog__modes">
          <legend>Layout</legend>
          {(["SPLIT", "ONION", "SIDE_BY_SIDE"] as CompareMode[]).map((value) => (
            <label key={value} data-active={mode === value}>
              <input
                type="radio"
                name="compare-mode"
                checked={mode === value}
                onChange={() => setMode(value)}
              />
              {value.replaceAll("_", " ").toLowerCase()}
            </label>
          ))}
        </fieldset>

        <footer className="compare-dialog__foot">
          {!ready ? (
            <span className="compare-dialog__hint">Pick two different versions.</span>
          ) : null}
          <button
            type="button"
            className="compare-dialog__confirm"
            disabled={!ready}
            onClick={() => ready && b && onConfirm({ a, b, mode })}
          >
            Compare
          </button>
        </footer>
      </div>
    </div>
  );
}
