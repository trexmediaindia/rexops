import { Check, Film, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { titleCase } from "../../lib/format";
import type { FileVersionView } from "./types";

export function VersionChips({
  versions,
  selectedIds,
  onRemove,
}: {
  versions: FileVersionView[];
  selectedIds: string[];
  onRemove(id: string): void;
}) {
  return (
    <div className="version-chips">
      {selectedIds.map((id) => {
        const version = versions.find((candidate) => candidate.id === id);
        return version ? (
          <span key={id}>
            {version.displayVersion}
            <button
              type="button"
              onClick={() => onRemove(id)}
              aria-label={`Remove ${version.displayVersion}`}
            >
              <X size={11} />
            </button>
          </span>
        ) : null;
      })}
    </div>
  );
}

export function VersionPicker({
  versions,
  selectedIds,
  onChange,
  multiple = true,
  label = "Reference version",
}: {
  versions: FileVersionView[];
  selectedIds: string[];
  onChange(ids: string[]): void;
  multiple?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () =>
      versions.filter((version) =>
        `${version.displayVersion} ${version.label ?? ""} ${version.fileName ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [query, versions],
  );
  return (
    <div className="version-picker">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <Film size={13} /> {label}
      </button>
      {open ? (
        <div className="version-picker__popover" role="dialog" aria-label={label}>
          <label>
            <Search size={13} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a cut"
            />
          </label>
          <div role="listbox" aria-multiselectable={multiple}>
            {filtered.map((version) => {
              const selected = selectedIds.includes(version.id);
              return (
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  key={version.id}
                  onClick={() => {
                    const next = multiple
                      ? selected
                        ? selectedIds.filter((id) => id !== version.id)
                        : [...selectedIds, version.id]
                      : [version.id];
                    onChange(next);
                    if (!multiple) setOpen(false);
                  }}
                >
                  <span className="rx-mono">{version.displayVersion}</span>
                  <span>
                    <strong>{version.label || version.fileName || "Untitled version"}</strong>
                    <small>{titleCase(version.status)}</small>
                  </span>
                  {selected ? <Check size={14} /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
