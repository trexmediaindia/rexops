import { Check, ChevronDown } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Popover, useAnchorRect } from "./popover";

export type SelectOption = {
  value: string;
  label: string;
  hint?: string;
  disabled?: boolean;
};

/**
 * The app's dropdown.
 *
 * Replaces the native `<select>`, whose popup is drawn by the OS and cannot be
 * themed — on a dark UI it arrived as a bright system list with system type. This
 * renders the list itself, so it matches the surrounding surface and can carry a
 * secondary hint per row.
 *
 * Keyboard contract matches the ARIA listbox pattern, so it is not a downgrade on
 * the native control: Enter/Space/Down opens, Up/Down/Home/End move the active
 * option, typing jumps by prefix, Enter commits, Escape closes without committing.
 */
export function Select({
  value,
  options,
  onChange,
  placeholder = "Select…",
  id,
  name,
  disabled = false,
  required = false,
  size = "md",
  "aria-label": ariaLabel,
  className = "",
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  size?: "md" | "sm";
  "aria-label"?: string;
  className?: string;
}) {
  const fallbackId = useId();
  const listId = `${id ?? fallbackId}-listbox`;
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const typed = useRef({ query: "", at: 0 });
  const anchor = useAnchorRect(trigger.current, open);

  const selectedIndex = useMemo(
    () => options.findIndex((option) => option.value === value),
    [options, value],
  );
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const close = useCallback((refocus = true) => {
    setOpen(false);
    setActiveIndex(-1);
    if (refocus) trigger.current?.focus();
  }, []);

  const commit = useCallback(
    (index: number) => {
      const option = options[index];
      if (!option || option.disabled) return;
      onChange(option.value);
      close();
    },
    [close, onChange, options],
  );

  // Open onto the current selection so the list starts where the user left it.
  const launch = useCallback(() => {
    if (disabled || !options.length) return;
    setOpen(true);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [disabled, options.length, selectedIndex]);

  const step = useCallback(
    (from: number, direction: 1 | -1) => {
      if (!options.length) return -1;
      let index = from;
      for (let hop = 0; hop < options.length; hop += 1) {
        index = (index + direction + options.length) % options.length;
        if (!options[index]?.disabled) return index;
      }
      return from;
    },
    [options],
  );

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    list.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({
      block: "nearest",
    });
  }, [activeIndex, open]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!open) {
      if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
        event.preventDefault();
        launch();
      }
      return;
    }
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        close();
        break;
      case "Tab":
        close(false);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        commit(activeIndex);
        break;
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((current) => step(current, 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((current) => step(current, -1));
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(step(-1, 1));
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(step(0, -1));
        break;
      default: {
        if (event.key.length !== 1 || event.metaKey || event.ctrlKey || event.altKey) return;
        const now = Date.now();
        typed.current.query =
          now - typed.current.at > 700 ? event.key : typed.current.query + event.key;
        typed.current.at = now;
        const query = typed.current.query.toLowerCase();
        const match = options.findIndex(
          (option) => !option.disabled && option.label.toLowerCase().startsWith(query),
        );
        if (match >= 0) setActiveIndex(match);
      }
    }
  };

  return (
    <>
      <button
        ref={trigger}
        id={id}
        type="button"
        role="combobox"
        aria-controls={listId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        aria-required={required || undefined}
        data-placeholder={selected ? undefined : true}
        data-size={size}
        disabled={disabled || !options.length}
        className={`rx-select ${className}`}
        onClick={() => (open ? close() : launch())}
        onKeyDown={onKeyDown}
      >
        <span>{selected?.label ?? (options.length ? placeholder : "None available")}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {/* A hidden native control keeps the value inside an enclosing <form> submission
          and keeps browser autofill/validation working against a real field. */}
      {name ? <input type="hidden" name={name} value={value} /> : null}
      {open ? (
        <Popover
          anchor={anchor}
          ignore={trigger.current}
          onDismiss={() => close(false)}
          className="rx-select__menu"
        >
          <div
            ref={list}
            id={listId}
            role="listbox"
            aria-label={ariaLabel}
            aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
            tabIndex={-1}
          >
            {options.map((option, index) => (
              /* biome-ignore lint/a11y/useKeyWithClickEvents: the trigger's onKeyDown
                 owns every keyboard path (arrows, Home/End, typeahead, Enter, Escape). */
              <div
                key={option.value}
                /* -1, not 0: this is the aria-activedescendant listbox pattern. Focus
                   stays on the combobox trigger and the active option is announced by
                   id; putting the options in the tab order would break that. */
                tabIndex={-1}
                id={`${listId}-${index}`}
                data-index={index}
                role="option"
                aria-selected={option.value === value}
                aria-disabled={option.disabled || undefined}
                data-active={index === activeIndex || undefined}
                onPointerEnter={() => setActiveIndex(index)}
                onClick={() => commit(index)}
              >
                <span>
                  {option.label}
                  {option.hint ? <em>{option.hint}</em> : null}
                </span>
                {option.value === value ? <Check size={14} aria-hidden="true" /> : null}
              </div>
            ))}
          </div>
        </Popover>
      ) : null}
    </>
  );
}
