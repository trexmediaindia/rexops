/**
 * The Creative Dock mark: a frame with a piece of work docked into its corner. Drawn
 * in the accent so the product has a face of its own rather than a letter in a box.
 */
export function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <svg
      className="brand-mark"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="2"
        y="2"
        width="20"
        height="20"
        rx="5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <rect x="10" y="10" width="8" height="8" rx="2" fill="currentColor" />
    </svg>
  );
}
