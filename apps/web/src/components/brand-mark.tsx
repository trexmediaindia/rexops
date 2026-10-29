/**
 * The Creative Dock mark: the blue "D" of the logo on a black tile, the same as the
 * app icon and the landing page's tab icon.
 */
export function BrandMark() {
  return (
    <span className="wordmark__mark brand-mark" aria-hidden="true">
      D
    </span>
  );
}

/** The logo as the landing page sets it: "Creative" in white, "Dock" in blue. */
export function BrandWord({ suffix }: { suffix?: string }) {
  return (
    <span className="brand-word">
      Creative <span>Dock</span>
      {suffix ? <small> {suffix}</small> : null}
    </span>
  );
}
