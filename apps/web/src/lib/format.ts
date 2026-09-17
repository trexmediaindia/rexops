const UNITS = ["B", "KB", "MB", "GB", "TB"];

/** Binary file sizes, rounded the way a capacity read-out wants them: one
 * decimal under 10, none above, so the string stays a stable width. */
export function formatBytes(bytes: number) {
  if (!bytes || bytes < 0) return "0 B";
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${UNITS[index]}`;
}

const RELATIVE_STEPS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["second", 60],
  ["minute", 60],
  ["hour", 24],
  ["day", 7],
  ["week", 4.35],
  ["month", 12],
  ["year", Number.POSITIVE_INFINITY],
];

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto", style: "narrow" });

/**
 * "3h ago" rather than "8/25/2026, 3:15:00 PM". A feed row is scanned, not read —
 * the absolute stamp belongs in the `title` for when somebody actually needs it.
 */
export function formatRelativeTime(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  let delta = (date.getTime() - Date.now()) / 1000;
  for (const [unit, span] of RELATIVE_STEPS) {
    if (Math.abs(delta) < span) return relative.format(Math.round(delta), unit);
    delta /= span;
  }
  return date.toLocaleDateString();
}

/** The full stamp, for tooltips and anywhere the exact time is the point. */
export function formatAbsoluteTime(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * `WAITING_FOR_CLIENT` -> `Waiting for client`. The API speaks SCREAMING_SNAKE and a
 * bare `.toLowerCase()` left labels like "waiting_for_client" in running copy.
 */
export function titleCase(value: string) {
  const words = value.replaceAll("_", " ").toLowerCase().trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
