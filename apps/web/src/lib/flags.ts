const localFlags = new Map<string, boolean>([
  ["work.views", false],
  ["review.room", false],
  ["automation", false],
]);

export function flag(key: string, fallback = false) {
  return localFlags.get(key) ?? fallback;
}
