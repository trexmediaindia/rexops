import type Konva from "konva";
import { useEffect, useRef, useState } from "react";
import { Arrow, Circle, Layer, Line, Rect, Stage } from "react-konva";
import type { Anchor, AnnotationTool, Geometry, StoredAnnotation } from "../review/anchor";
import { clampUnit, projectGeometry, unprojectPoint, type ViewerTransform } from "./geometry";

// Konva overlay that both CAPTURES new annotations (boxes/arrows/freehand/points/polygons)
// and RENDERS stored annotations back onto the media — the thing the old code never did.
// Coordinates round-trip through the ViewerTransform so they stay aligned under
// zoom/pan/rotation/letterbox. Used for image, video, and pdf. See §7/§22.3.

const ACCENT = "#ff5d36";
const NORMAL = "#7fd4ff";

export type AnnotationLayerProps = {
  transform: ViewerTransform;
  tool: AnnotationTool;
  annotations: StoredAnnotation[];
  activeAnnotationId: string | null;
  // Only render REGION annotations matching this page (pdf) / within the time window (video).
  page?: number;
  positionMs?: number;
  timeWindowMs?: number;
  // The current timecode to stamp on new video-region annotations.
  timecodeMs?: number;
  onCreate: (anchor: Anchor) => void;
  onActivate?: (id: string | null) => void;
};

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

export function AnnotationLayer({
  transform,
  tool,
  annotations,
  activeAnnotationId,
  page,
  positionMs,
  timeWindowMs = 200,
  timecodeMs,
  onCreate,
}: AnnotationLayerProps) {
  const [wrapRef, size] = useElementSize<HTMLDivElement>();
  const [draft, setDraft] = useState<Geometry | null>(null);
  const [polyPoints, setPolyPoints] = useState<Array<{ x: number; y: number }>>([]);
  const drawing = tool !== "select";

  const pointer = (stage: Konva.Stage | null) => {
    const p = stage?.getPointerPosition();
    if (!p) return null;
    const n = unprojectPoint(p.x, p.y, transform);
    return { x: clampUnit(n.x), y: clampUnit(n.y) };
  };

  function commit(geometry: Geometry) {
    const anchor: Anchor = { type: "REGION", geometry };
    if (timecodeMs != null) anchor.timecodeMs = timecodeMs;
    if (page != null) anchor.page = page;
    onCreate(anchor);
  }

  function onDown(e: Konva.KonvaEventObject<PointerEvent>) {
    if (!drawing) return;
    const start = pointer(e.target.getStage());
    if (!start) return;
    if (tool === "point") {
      commit({ kind: "POINT", x: start.x, y: start.y });
      return;
    }
    if (tool === "polygon") {
      setPolyPoints((pts) => [...pts, start]);
      return;
    }
    setDraft(
      tool === "box"
        ? { kind: "RECTANGLE", x: start.x, y: start.y, width: 0, height: 0 }
        : tool === "arrow"
          ? { kind: "ARROW", x1: start.x, y1: start.y, x2: start.x, y2: start.y }
          : { kind: "PATH", points: [start] },
    );
  }

  function onMove(e: Konva.KonvaEventObject<PointerEvent>) {
    if (!draft) return;
    const p = pointer(e.target.getStage());
    if (!p) return;
    setDraft((current) => {
      if (!current) return current;
      if (current.kind === "RECTANGLE")
        return {
          kind: "RECTANGLE",
          x: Math.min(current.x, p.x),
          y: Math.min(current.y, p.y),
          width: Math.abs(p.x - current.x),
          height: Math.abs(p.y - current.y),
        };
      if (current.kind === "ARROW") return { ...current, x2: p.x, y2: p.y };
      if (current.kind === "PATH") return { kind: "PATH", points: [...current.points, p] };
      return current;
    });
  }

  function onUp() {
    if (!draft) return;
    // Ignore zero-size boxes (accidental clicks).
    if (draft.kind === "RECTANGLE" && draft.width < 0.005 && draft.height < 0.005) {
      setDraft(null);
      return;
    }
    commit(draft);
    setDraft(null);
  }

  function finishPolygon() {
    if (polyPoints.length >= 3) commit({ kind: "POLYGON", points: polyPoints });
    setPolyPoints([]);
  }

  const visible = annotations.filter((a) => {
    if (a.anchor.type !== "REGION") return false;
    if (page != null && a.anchor.page != null && a.anchor.page !== page) return false;
    if (
      positionMs != null &&
      a.anchor.timecodeMs != null &&
      a.id !== activeAnnotationId &&
      Math.abs(a.anchor.timecodeMs - positionMs) > timeWindowMs
    )
      return false;
    return true;
  });

  return (
    <div
      ref={wrapRef}
      className="annotation-layer"
      data-drawing={drawing}
      style={{ position: "absolute", inset: 0, pointerEvents: drawing ? "auto" : "none" }}
    >
      {size.width > 0 ? (
        <Stage
          width={size.width}
          height={size.height}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onDblClick={tool === "polygon" ? finishPolygon : undefined}
          style={{ cursor: drawing ? "crosshair" : "default" }}
        >
          <Layer listening={false}>
            {visible.map((a) =>
              a.anchor.type === "REGION" ? (
                <Shape
                  key={a.id}
                  geometry={a.anchor.geometry}
                  transform={transform}
                  active={a.id === activeAnnotationId}
                  resolved={a.resolved}
                />
              ) : null,
            )}
            {draft ? <Shape geometry={draft} transform={transform} pending /> : null}
            {polyPoints.length > 0 ? (
              <Line
                points={polyPoints.flatMap((p) => {
                  const s = projectGeometry({ kind: "POINT", ...p }, transform);
                  return s.kind === "POINT" ? [s.x, s.y] : [];
                })}
                stroke={ACCENT}
                strokeWidth={2}
                dash={[4, 4]}
              />
            ) : null}
          </Layer>
        </Stage>
      ) : null}
    </div>
  );
}

function Shape({
  geometry,
  transform,
  active,
  resolved,
  pending,
}: {
  geometry: Geometry;
  transform: ViewerTransform;
  active?: boolean;
  resolved?: boolean;
  pending?: boolean;
}) {
  const stroke = active || pending ? ACCENT : NORMAL;
  const strokeWidth = active ? 3 : 2;
  const opacity = resolved ? 0.4 : 1;
  const dash = pending ? [6, 4] : undefined;
  const p = projectGeometry(geometry, transform);
  switch (p.kind) {
    case "POINT":
      return (
        <Circle
          x={p.x}
          y={p.y}
          radius={active ? 8 : 6}
          stroke={stroke}
          strokeWidth={strokeWidth}
          fill="rgba(255,93,54,.25)"
          opacity={opacity}
        />
      );
    case "RECTANGLE":
      return (
        <Rect
          x={p.x}
          y={p.y}
          width={p.width}
          height={p.height}
          stroke={stroke}
          strokeWidth={strokeWidth}
          dash={dash}
          opacity={opacity}
          cornerRadius={2}
        />
      );
    case "ARROW":
      return (
        <Arrow
          points={[p.x1, p.y1, p.x2, p.y2]}
          stroke={stroke}
          fill={stroke}
          strokeWidth={strokeWidth}
          pointerLength={10}
          pointerWidth={10}
          opacity={opacity}
        />
      );
    case "POLYGON":
      return (
        <Line
          points={p.points.flatMap((q) => [q.x, q.y])}
          stroke={stroke}
          strokeWidth={strokeWidth}
          closed
          dash={dash}
          opacity={opacity}
        />
      );
    case "PATH":
      return (
        <Line
          points={p.points.flatMap((q) => [q.x, q.y])}
          stroke={stroke}
          strokeWidth={strokeWidth}
          tension={0.3}
          opacity={opacity}
          lineCap="round"
          lineJoin="round"
        />
      );
    default:
      return null;
  }
}
