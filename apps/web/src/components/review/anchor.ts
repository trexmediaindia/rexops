// Typed anchor model — the single source of truth shared by viewers, the annotation
// layer, the comment composer, the comment list, and focusAnchor navigation.
//
// Geometry is ALWAYS normalized 0..1 relative to the *intrinsic media frame* (not the
// DOM box), so an annotation captured at one zoom/pan/rotation renders correctly at any
// other and inside compare panes. See docs/16-deliverables-review-room-revamp.md §6/§23.

export type NormalizedPoint = { x: number; y: number };

export type Geometry =
  | { kind: "POINT"; x: number; y: number }
  | { kind: "RECTANGLE"; x: number; y: number; width: number; height: number }
  | { kind: "ARROW"; x1: number; y1: number; x2: number; y2: number }
  | { kind: "POLYGON"; points: NormalizedPoint[] }
  | { kind: "PATH"; points: NormalizedPoint[] };

export type Anchor =
  | { type: "NONE" }
  | { type: "TIMECODE"; timecodeMs: number }
  | { type: "REGION"; geometry: Geometry; timecodeMs?: number; page?: number }
  | { type: "WAVEFORM_RANGE"; startMs: number; endMs: number };

export type AnchorType = Anchor["type"];

// The active annotation tool, shared by the toolbar and every viewer's capture layer.
export type AnnotationTool = "select" | "point" | "box" | "arrow" | "draw" | "polygon";

// A stored annotation = a comment's id + its typed anchor (+ resolved/active flags for
// styling). The annotation layer renders these back onto the media.
export type StoredAnnotation = {
  id: string;
  anchor: Anchor;
  resolved?: boolean;
};

// The medium a viewer renders. Audio uses the wavesurfer-native annotation path; the
// Konva overlay handles video + pdf; Annotorious handles image.
export type Medium = "image" | "video" | "pdf" | "audio" | "other";

export function mediumFromFileType(fileType: string | null | undefined): Medium {
  if (!fileType) return "other";
  if (fileType.startsWith("video/")) return "video";
  if (fileType.startsWith("image/")) return "image";
  if (fileType.startsWith("audio/")) return "audio";
  if (fileType === "application/pdf") return "pdf";
  return "other";
}

// Format milliseconds as m:ss (or h:mm:ss past an hour). Used by labels + transport.
export function formatMs(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// A short human label for a pending composer chip, a comment-card anchor button, and a
// marker tooltip. Never throws on malformed input.
export function anchorLabel(anchor: Anchor | null | undefined): string {
  if (!anchor) return "General";
  switch (anchor.type) {
    case "TIMECODE":
      return `@ ${formatMs(anchor.timecodeMs)}`;
    case "REGION":
      if (anchor.page != null && anchor.timecodeMs != null)
        return `p.${anchor.page} · @ ${formatMs(anchor.timecodeMs)}`;
      if (anchor.page != null) return `p.${anchor.page} region`;
      if (anchor.timecodeMs != null) return `@ ${formatMs(anchor.timecodeMs)}`;
      return "Region";
    case "WAVEFORM_RANGE":
      return `${formatMs(anchor.startMs)}–${formatMs(anchor.endMs)}`;
    default:
      return "General";
  }
}

// Does this anchor place a marker on the time scrubber?
export function anchorTimecodeMs(anchor: Anchor | null | undefined): number | null {
  if (!anchor) return null;
  if (anchor.type === "TIMECODE") return anchor.timecodeMs;
  if (anchor.type === "REGION" && anchor.timecodeMs != null) return anchor.timecodeMs;
  if (anchor.type === "WAVEFORM_RANGE") return anchor.startMs;
  return null;
}

// Narrow an untyped persisted value (Record<string,unknown> | null) into a typed Anchor.
// Tolerant: anything it cannot recognize becomes { type: "NONE" }. This is the migration
// bridge from the legacy loosely-typed `anchor` jsonb to the typed union.
export function parseAnchor(anchorType: string | null | undefined, raw: unknown): Anchor {
  const a = (raw ?? {}) as Record<string, unknown>;
  switch (anchorType) {
    case "TIMECODE": {
      const ms = num(a.timecodeMs);
      return ms == null ? { type: "NONE" } : { type: "TIMECODE", timecodeMs: ms };
    }
    case "REGION": {
      const geometry = parseGeometry(a.geometry);
      if (!geometry) return { type: "NONE" };
      const out: Extract<Anchor, { type: "REGION" }> = { type: "REGION", geometry };
      const tc = num(a.timecodeMs);
      if (tc != null) out.timecodeMs = tc;
      const pg = num(a.page);
      if (pg != null) out.page = pg;
      return out;
    }
    case "WAVEFORM_RANGE": {
      const startMs = num(a.startMs);
      const endMs = num(a.endMs);
      if (startMs == null || endMs == null) return { type: "NONE" };
      return { type: "WAVEFORM_RANGE", startMs, endMs };
    }
    default:
      return { type: "NONE" };
  }
}

function parseGeometry(raw: unknown): Geometry | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  switch (g.kind) {
    case "POINT": {
      const x = num(g.x);
      const y = num(g.y);
      return x == null || y == null ? null : { kind: "POINT", x, y };
    }
    case "RECTANGLE": {
      const x = num(g.x);
      const y = num(g.y);
      const width = num(g.width);
      const height = num(g.height);
      return x == null || y == null || width == null || height == null
        ? null
        : { kind: "RECTANGLE", x, y, width, height };
    }
    case "ARROW": {
      const x1 = num(g.x1);
      const y1 = num(g.y1);
      const x2 = num(g.x2);
      const y2 = num(g.y2);
      return x1 == null || y1 == null || x2 == null || y2 == null
        ? null
        : { kind: "ARROW", x1, y1, x2, y2 };
    }
    case "POLYGON":
    case "PATH": {
      const points = parsePoints(g.points);
      return points.length === 0 ? null : { kind: g.kind, points };
    }
    default:
      return null;
  }
}

function parsePoints(raw: unknown): NormalizedPoint[] {
  if (!Array.isArray(raw)) return [];
  const out: NormalizedPoint[] = [];
  for (const p of raw) {
    if (!p || typeof p !== "object") continue;
    const x = num((p as Record<string, unknown>).x);
    const y = num((p as Record<string, unknown>).y);
    if (x != null && y != null) out.push({ x, y });
  }
  return out;
}

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}
