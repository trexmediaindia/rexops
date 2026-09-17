import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type Anchor = { top: number; left: number; width: number; height: number };

/**
 * Measures an anchor element and keeps the reading fresh while a popover is open.
 * Positions are viewport-relative because the popover itself is `position: fixed` —
 * see the note in `Popover` for why it is not absolutely positioned in flow.
 */
export function useAnchorRect(element: HTMLElement | null, open: boolean) {
  const [rect, setRect] = useState<Anchor | null>(null);

  useLayoutEffect(() => {
    if (!open || !element) {
      setRect(null);
      return;
    }
    const measure = () => {
      const box = element.getBoundingClientRect();
      setRect({ top: box.top, left: box.left, width: box.width, height: box.height });
    };
    measure();
    window.addEventListener("resize", measure);
    // `true` so scrolling any ancestor — a dialog body, a panel — moves the popover
    // with its trigger instead of leaving it stranded mid-screen.
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [element, open]);

  return rect;
}

/**
 * A fixed-position layer portalled to `document.body`.
 *
 * The dropdowns it carries open from triggers that sit inside scrollable dialogs
 * and `overflow: hidden` panels, so an in-flow absolute layer would get clipped.
 * Portalling sidesteps every ancestor's overflow and stacking context.
 */
export function Popover({
  anchor,
  onDismiss,
  children,
  className = "",
  minWidth,
  align = "start",
  ignore,
}: {
  anchor: Anchor | null;
  onDismiss: () => void;
  children: React.ReactNode;
  className?: string;
  minWidth?: number;
  align?: "start" | "end";
  /** The trigger. Pointer-downs on it are left alone so its own click can toggle. */
  ignore?: HTMLElement | null;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  // `scrollHeight`, not `offsetHeight`: the rendered box is already clamped by the
  // `maxHeight` below, so measuring it would report exactly the space available and
  // the "does it fit?" test could never fail. The natural content height is what
  // decides whether to flip above the trigger.
  useLayoutEffect(() => {
    const measured = layer.current?.scrollHeight;
    // Guarded rather than bare: flipping changes `maxHeight`, so an unguarded write
    // here could oscillate between two readings instead of settling.
    if (measured && Math.abs(measured - height) > 1) setHeight(measured);
  });

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (layer.current?.contains(target) || ignore?.contains(target)) return;
      onDismiss();
    };
    // Pointer-down rather than click so the dismissal beats any button underneath.
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [ignore, onDismiss]);

  if (!anchor) return null;

  const gap = 6;
  const spaceBelow = window.innerHeight - (anchor.top + anchor.height);
  const flip = height > 0 && spaceBelow < height + gap && anchor.top > spaceBelow;
  const width = Math.max(minWidth ?? 0, anchor.width);
  const left =
    align === "end"
      ? Math.min(anchor.left + anchor.width - width, window.innerWidth - width - 8)
      : Math.min(anchor.left, window.innerWidth - width - 8);

  return createPortal(
    <div
      ref={layer}
      className={`rx-popover ${className}`}
      style={{
        top: flip ? undefined : anchor.top + anchor.height + gap,
        bottom: flip ? window.innerHeight - anchor.top + gap : undefined,
        left: Math.max(8, left),
        minWidth: width,
        maxHeight: Math.max(160, (flip ? anchor.top : spaceBelow) - gap - 12),
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
