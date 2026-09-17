import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Popover, useAnchorRect } from "./popover";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** `yyyy-mm-dd` in local time. `toISOString()` is UTC and shifts the day either side of midnight. */
function toKey(date: Date) {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function fromKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Monday-first offset for the 1st of the month. */
function leadingBlanks(year: number, month: number) {
  return (new Date(year, month, 1).getDay() + 6) % 7;
}

/**
 * Date field with an in-app calendar.
 *
 * The native `<input type="date">` was the reason so much work had no due date: it
 * shows an `mm/dd/yyyy` mask that reads as a disabled field, and its picker is OS
 * chrome dropped into a dark UI. This shows the chosen date in full, offers the two
 * shortcuts people actually use, and can be cleared.
 *
 * Value is `yyyy-mm-dd` so it stays a drop-in for the native field it replaces.
 */
export function DatePicker({
  value,
  onChange,
  id,
  name,
  placeholder = "No date set",
  disabled = false,
  min,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  name?: string;
  placeholder?: string;
  disabled?: boolean;
  min?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const anchor = useAnchorRect(trigger.current, open);
  const selected = useMemo(() => fromKey(value), [value]);
  const [cursor, setCursor] = useState(() => {
    const base = selected ?? new Date();
    return { year: base.getFullYear(), month: base.getMonth() };
  });

  const todayKey = toKey(new Date());
  const minKey = min ?? undefined;

  const days = useMemo(() => {
    const count = new Date(cursor.year, cursor.month + 1, 0).getDate();
    return Array.from(
      { length: count },
      (_, index) => new Date(cursor.year, cursor.month, index + 1),
    );
  }, [cursor]);

  const shift = (direction: -1 | 1) =>
    setCursor((current) => {
      const next = new Date(current.year, current.month + direction, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });

  const pick = (key: string) => {
    onChange(key);
    setOpen(false);
    trigger.current?.focus();
  };

  const jump = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    setCursor({ year: date.getFullYear(), month: date.getMonth() });
    pick(toKey(date));
  };

  return (
    <div className="rx-datefield">
      <button
        ref={trigger}
        id={id}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-placeholder={selected ? undefined : true}
        className="rx-datefield__trigger"
        onClick={() => setOpen((current) => !current)}
      >
        <CalendarDays size={15} aria-hidden="true" />
        <span>
          {selected
            ? selected.toLocaleDateString(undefined, {
                weekday: "short",
                day: "numeric",
                month: "short",
                year: "numeric",
              })
            : placeholder}
        </span>
      </button>
      {selected && !disabled ? (
        <button
          type="button"
          className="rx-datefield__clear"
          aria-label="Clear date"
          onClick={() => onChange("")}
        >
          <X size={13} />
        </button>
      ) : null}
      {name ? <input type="hidden" name={name} value={value} /> : null}
      {open ? (
        <Popover
          anchor={anchor}
          ignore={trigger.current}
          minWidth={272}
          onDismiss={() => setOpen(false)}
          className="rx-calendar"
        >
          <header>
            <button type="button" aria-label="Previous month" onClick={() => shift(-1)}>
              <ChevronLeft size={15} />
            </button>
            <strong>
              {MONTHS[cursor.month]} {cursor.year}
            </strong>
            <button type="button" aria-label="Next month" onClick={() => shift(1)}>
              <ChevronRight size={15} />
            </button>
          </header>
          <div className="rx-calendar__weekdays" aria-hidden="true">
            {WEEKDAYS.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          {/* Deliberately not `role="grid"`: the month is a wrapped run of buttons, not
              a table of rows, and claiming grid semantics without them reads worse to a
              screen reader than the plain button list does. */}
          <div className="rx-calendar__grid">
            {WEEKDAYS.slice(0, leadingBlanks(cursor.year, cursor.month)).map((day) => (
              <span key={`lead-${day}`} />
            ))}
            {days.map((day) => {
              const key = toKey(day);
              return (
                <button
                  key={key}
                  type="button"
                  disabled={minKey ? key < minKey : false}
                  data-selected={key === value || undefined}
                  data-today={key === todayKey || undefined}
                  onClick={() => pick(key)}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
          <footer>
            <button type="button" onClick={() => jump(0)}>
              Today
            </button>
            <button type="button" onClick={() => jump(7)}>
              In a week
            </button>
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              Clear
            </button>
          </footer>
        </Popover>
      ) : null}
    </div>
  );
}
