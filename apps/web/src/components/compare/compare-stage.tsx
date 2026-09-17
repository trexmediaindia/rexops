import { useQuery } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { lazy, type MutableRefObject, Suspense, useEffect, useRef, useState } from "react";
import type { Anchor, AnnotationTool, StoredAnnotation } from "../review/anchor";
import type { FileVersionView } from "../versioning/types";
import type { ViewerFocus } from "../viewers/viewer-registry";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
const RegisteredViewer = lazy(() =>
  import("../viewers/viewer-registry").then((module) => ({ default: module.RegisteredViewer })),
);

export type CompareMode = "SIDE_BY_SIDE" | "SPLIT" | "ONION";
export type CompareZoom = { scale: number; x: number; y: number };

type AssetProps = {
  version: FileVersionView;
  currentTime: number;
  onTime(value: number): void;
  onDuration(value: number): void;
  tool: AnnotationTool;
  annotations: StoredAnnotation[];
  activeAnnotationId: string | null;
  onCreate(anchor: Anchor): void;
  onActivate?(id: string | null): void;
  focusRef?: MutableRefObject<ViewerFocus | null>;
};

function Asset({
  version,
  currentTime,
  onTime,
  onDuration,
  tool,
  annotations,
  activeAnnotationId,
  onCreate,
  onActivate,
  focusRef,
}: AssetProps) {
  const asset = useQuery({
    queryKey: ["preview", version.id],
    queryFn: async () => {
      const response = await fetch(`${apiUrl}/api/file-versions/${version.id}/preview`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Preview unavailable");
      return (await response.json()) as { url: string };
    },
    enabled: version.previewStatus === "READY" && Boolean(version.previewUrl),
  });
  if (version.previewStatus !== "READY" || !version.previewUrl) {
    return (
      <div className="review-media__fallback">
        {version.previewStatus === "FAILED" ? null : <LoaderCircle className="spin" size={28} />}
        <strong>
          {version.previewStatus === "FAILED" ? "Preview failed" : "Preview processing"}
        </strong>
        <span>{version.previewError ?? "The worker is preparing a review-safe proxy."}</span>
      </div>
    );
  }
  if (!asset.data) return <LoaderCircle className="spin" size={28} />;
  return (
    <Suspense fallback={<LoaderCircle className="spin" size={28} />}>
      <RegisteredViewer
        url={asset.data.url}
        fileName={version.fileName ?? "Review asset"}
        fileType={version.fileType}
        currentTime={currentTime}
        onTime={onTime}
        onDuration={onDuration}
        tool={tool}
        annotations={annotations}
        activeAnnotationId={activeAnnotationId}
        onCreate={onCreate}
        onActivate={onActivate}
        focusRef={focusRef}
      />
    </Suspense>
  );
}

function medium(version: FileVersionView) {
  if (version.fileType?.startsWith("video/")) return "video";
  if (version.fileType?.startsWith("audio/")) return "audio";
  if (version.fileType?.startsWith("image/")) return "image";
  if (version.fileType === "application/pdf") return "pdf";
  return "other";
}

export function CompareStage({
  base,
  against,
  mode,
  currentTime,
  onTime,
  onDuration,
  zoom,
  onZoom,
  tool,
  activeAnnotationId,
  annotationsA,
  annotationsB,
  onCreateA,
  onCreateB,
  onActivate,
  focusRef,
}: {
  base: FileVersionView;
  against: FileVersionView | null;
  mode: CompareMode;
  currentTime: number;
  onTime(value: number): void;
  onDuration(value: number): void;
  zoom: CompareZoom;
  onZoom(value: CompareZoom): void;
  tool: AnnotationTool;
  activeAnnotationId: string | null;
  annotationsA: StoredAnnotation[];
  annotationsB: StoredAnnotation[];
  onCreateA(anchor: Anchor): void;
  onCreateB(anchor: Anchor): void;
  onActivate?(id: string | null): void;
  focusRef?: MutableRefObject<ViewerFocus | null>;
}) {
  const root = useRef<HTMLDivElement>(null);
  const panStart = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);
  const [divider, setDivider] = useState(50);
  const [opacity, setOpacity] = useState(50);
  const sameMedium = against && medium(base) === medium(against);
  const effectiveMode = sameMedium ? mode : "SIDE_BY_SIDE";
  const still = ["image", "pdf"].includes(medium(base));

  useEffect(() => {
    if (!against || !["video", "audio"].includes(medium(base))) return;
    let frame = 0;
    const sync = () => {
      const media = root.current?.querySelectorAll<HTMLMediaElement>("video, audio");
      const primary = media?.[0];
      const secondary = media?.[1];
      if (primary && secondary) {
        secondary.playbackRate = primary.playbackRate;
        if (Math.abs(secondary.currentTime - primary.currentTime) > 1 / 30) {
          secondary.currentTime = primary.currentTime;
        }
        if (primary.paused && !secondary.paused) secondary.pause();
        if (!primary.paused && secondary.paused) void secondary.play().catch(() => undefined);
      }
      frame = requestAnimationFrame(sync);
    };
    frame = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(frame);
  }, [against, base]);

  function setDividerFromPointer(event: React.PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    setDivider(Math.max(5, Math.min(95, ((event.clientX - bounds.left) / bounds.width) * 100)));
  }

  return (
    <div
      ref={root}
      className="compare-stage"
      data-mode={effectiveMode.toLowerCase()}
      data-still={still}
      onWheel={
        still
          ? (event) => {
              event.preventDefault();
              const scale = Math.max(0.5, Math.min(4, zoom.scale - event.deltaY * 0.002));
              onZoom({ ...zoom, scale });
            }
          : undefined
      }
      style={
        {
          "--compare-divider": `${divider}%`,
          "--compare-opacity": opacity / 100,
        } as React.CSSProperties
      }
      onPointerDown={(event) => {
        if (!still || (!event.shiftKey && event.button !== 1)) return;
        panStart.current = {
          x: event.clientX,
          y: event.clientY,
          originX: zoom.x,
          originY: zoom.y,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!panStart.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
        onZoom({
          ...zoom,
          x: panStart.current.originX + event.clientX - panStart.current.x,
          y: panStart.current.originY + event.clientY - panStart.current.y,
        });
      }}
      onPointerUp={(event) => {
        panStart.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
    >
      <div
        className="compare-stage__pane compare-stage__pane--a"
        style={
          still
            ? { transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})` }
            : undefined
        }
      >
        <span className="compare-stage__label">A · {base.displayVersion}</span>
        <Asset
          version={base}
          currentTime={currentTime}
          onTime={onTime}
          onDuration={onDuration}
          tool={tool}
          annotations={annotationsA}
          activeAnnotationId={activeAnnotationId}
          onCreate={onCreateA}
          onActivate={onActivate}
          focusRef={focusRef}
        />
      </div>
      {against ? (
        <div
          className="compare-stage__pane compare-stage__pane--b"
          style={
            still
              ? { transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})` }
              : undefined
          }
        >
          <span className="compare-stage__label">B · {against.displayVersion}</span>
          <Asset
            version={against}
            currentTime={currentTime}
            onTime={onTime}
            onDuration={onDuration}
            tool={tool}
            annotations={annotationsB}
            activeAnnotationId={activeAnnotationId}
            onCreate={onCreateB}
            onActivate={onActivate}
          />
        </div>
      ) : null}
      {against && effectiveMode === "SPLIT" ? (
        <div
          className="compare-stage__divider"
          role="slider"
          aria-label="Comparison split"
          aria-valuemin={5}
          aria-valuemax={95}
          aria-valuenow={Math.round(divider)}
          tabIndex={0}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setDividerFromPointer(event);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              setDividerFromPointer(event);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") setDivider((value) => Math.max(5, value - 1));
            if (event.key === "ArrowRight") setDivider((value) => Math.min(95, value + 1));
          }}
        />
      ) : null}
      {against && effectiveMode === "ONION" ? (
        <label className="compare-stage__opacity">
          Blend
          <input
            type="range"
            min={0}
            max={100}
            value={opacity}
            onChange={(event) => setOpacity(Number(event.target.value))}
          />
        </label>
      ) : null}
    </div>
  );
}
