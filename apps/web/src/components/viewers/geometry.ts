// Transform math for the annotation overlay. Geometry is stored normalized 0..1 against
// the *intrinsic content frame*; the viewer reports where that frame is rendered on screen
// (contentRect) plus zoom/pan/rotation, and we project/unproject through it. This is what
// keeps annotations aligned under letterboxing, zoom, pan, and PDF page rotation — the bug
// in the old code that normalized against a DOM box that changed with zoom.
//
// See docs/16-deliverables-review-room-revamp.md §23.

import type { Geometry, NormalizedPoint } from "../review/anchor";

export type Rect = { left: number; top: number; width: number; height: number };

export type ViewerTransform = {
  // Rect (in the overlay's own coordinate space) where the rendered media content sits.
  contentRect: Rect;
  zoom: number; // 1 = fit
  panX: number;
  panY: number;
  rotation: 0 | 90 | 180 | 270; // pdf only
};

export const IDENTITY_TRANSFORM: ViewerTransform = {
  contentRect: { left: 0, top: 0, width: 1, height: 1 },
  zoom: 1,
  panX: 0,
  panY: 0,
  rotation: 0,
};

// Compute the letterboxed content rect for media of `intrinsic` aspect drawn object-fit:
// contain inside `box`. Returns the centered rect the media actually occupies.
export function containRect(
  box: { width: number; height: number },
  intrinsic: { width: number; height: number },
): Rect {
  if (intrinsic.width <= 0 || intrinsic.height <= 0 || box.width <= 0 || box.height <= 0) {
    return { left: 0, top: 0, width: box.width, height: box.height };
  }
  const scale = Math.min(box.width / intrinsic.width, box.height / intrinsic.height);
  const width = intrinsic.width * scale;
  const height = intrinsic.height * scale;
  return { left: (box.width - width) / 2, top: (box.height - height) / 2, width, height };
}

// Rotate a unit-square point by a multiple of 90° about the unit square's center (0.5,0.5).
function rotateUnit(p: NormalizedPoint, rotation: 0 | 90 | 180 | 270): NormalizedPoint {
  switch (rotation) {
    case 90:
      return { x: 1 - p.y, y: p.x };
    case 180:
      return { x: 1 - p.x, y: 1 - p.y };
    case 270:
      return { x: p.y, y: 1 - p.x };
    default:
      return p;
  }
}

// intrinsic (0..1, pre-rotation) -> overlay-space px
export function projectPoint(p: NormalizedPoint, t: ViewerTransform): NormalizedPoint {
  const r = rotateUnit(p, t.rotation);
  const { contentRect: c } = t;
  return {
    x: c.left + t.panX + r.x * c.width * t.zoom,
    y: c.top + t.panY + r.y * c.height * t.zoom,
  };
}

// overlay-space px -> intrinsic (0..1, pre-rotation). Inverse of projectPoint.
export function unprojectPoint(sx: number, sy: number, t: ViewerTransform): NormalizedPoint {
  const { contentRect: c } = t;
  const u = {
    x: (sx - c.left - t.panX) / (c.width * t.zoom),
    y: (sy - c.top - t.panY) / (c.height * t.zoom),
  };
  // invert the rotation
  const inverse = ((360 - t.rotation) % 360) as 0 | 90 | 180 | 270;
  return rotateUnit(u, inverse);
}

export function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

// Project a whole geometry's points into overlay-space px (for Konva rendering).
export function projectGeometry(geometry: Geometry, t: ViewerTransform) {
  switch (geometry.kind) {
    case "POINT": {
      const p = projectPoint(geometry, t);
      return { kind: "POINT" as const, ...p };
    }
    case "RECTANGLE": {
      const a = projectPoint({ x: geometry.x, y: geometry.y }, t);
      const b = projectPoint(
        { x: geometry.x + geometry.width, y: geometry.y + geometry.height },
        t,
      );
      return {
        kind: "RECTANGLE" as const,
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        width: Math.abs(b.x - a.x),
        height: Math.abs(b.y - a.y),
      };
    }
    case "ARROW": {
      const a = projectPoint({ x: geometry.x1, y: geometry.y1 }, t);
      const b = projectPoint({ x: geometry.x2, y: geometry.y2 }, t);
      return { kind: "ARROW" as const, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    }
    case "POLYGON":
    case "PATH": {
      const points = geometry.points.map((p) => projectPoint(p, t));
      return { kind: geometry.kind, points };
    }
  }
}

// Center of a geometry in intrinsic 0..1 space — used by focusAnchor to pan/zoom to it.
export function geometryCenter(geometry: Geometry): NormalizedPoint {
  switch (geometry.kind) {
    case "POINT":
      return { x: geometry.x, y: geometry.y };
    case "RECTANGLE":
      return { x: geometry.x + geometry.width / 2, y: geometry.y + geometry.height / 2 };
    case "ARROW":
      return { x: (geometry.x1 + geometry.x2) / 2, y: (geometry.y1 + geometry.y2) / 2 };
    case "POLYGON":
    case "PATH": {
      const n = geometry.points.length || 1;
      const sum = geometry.points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), {
        x: 0,
        y: 0,
      });
      return { x: sum.x / n, y: sum.y / n };
    }
  }
}
