import { ChevronLeft, ChevronRight, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import * as pdfjs from "pdfjs-dist";
import { type MutableRefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import videojs from "video.js";
// Without the vendor stylesheet video.js's control-text spans render as visible body
// copy stacked over the media instead of being visually hidden.
import "video.js/dist/video-js.css";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.esm.js";
import type { Anchor, AnnotationTool, StoredAnnotation } from "../review/anchor";
import { AnnotationLayer } from "./annotation-layer";
import { containRect, type ViewerTransform } from "./geometry";

// Imperative focus handle a viewer publishes so focusAnchor (in the room) can drive it:
// seek the transport, flip a PDF page, etc. See §8.
export type ViewerFocus = {
  seekMs?: (ms: number) => void;
  goToPage?: (page: number) => void;
};

export type ViewerProps = {
  url: string;
  fileName: string;
  fileType: string | null;
  currentTime: number; // seconds
  onTime: (value: number) => void;
  onDuration: (value: number) => void;
  tool: AnnotationTool;
  annotations: StoredAnnotation[];
  activeAnnotationId: string | null;
  onCreate: (anchor: Anchor) => void;
  onActivate?: (id: string | null) => void;
  focusRef?: MutableRefObject<ViewerFocus | null>;
};

// Measure a wrapper element's box; recompute on resize.
function useBoxSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const update = () => setBox({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, box] as const;
}

function VideoViewer(props: ViewerProps) {
  const { url, currentTime, onTime, onDuration, focusRef } = props;
  const host = useRef<HTMLDivElement>(null);
  const element = useRef<HTMLVideoElement | null>(null);
  const player = useRef<ReturnType<typeof videojs> | null>(null);
  const [wrapRef, box] = useBoxSize<HTMLDivElement>();
  const [intrinsic, setIntrinsic] = useState({ width: 16, height: 9 });

  useEffect(() => {
    if (!host.current) return;
    // video.js removes the <video> node on dispose, so it cannot own a node React
    // rendered — re-running this effect (StrictMode, or simply picking another
    // version, since `url` is a dependency) would leave the stage permanently empty.
    // Create the element per init instead and let dispose take it away with it.
    const video = document.createElement("video");
    video.className = "video-js";
    host.current.append(video);
    element.current = video;

    const instance = videojs(video, {
      controls: false, // unified app transport drives playback
      // The host box is already sized by the stage; fluid would re-impose the file's
      // aspect ratio as padding and overflow it.
      fluid: false,
      sources: [{ src: url }],
    });
    player.current = instance;
    // video.js writes its own `#vjs_video_N-dimensions` rule, which an ID selector makes
    // unbeatable from a stylesheet — set it through the API so the player box matches
    // the stage instead of the file's intrinsic size.
    instance.dimensions("100%", "100%");
    instance.on("timeupdate", () => onTime(instance.currentTime() ?? 0));
    instance.on("loadedmetadata", () => {
      onDuration(instance.duration() ?? 0);
      const w = instance.videoWidth?.() ?? video.videoWidth ?? 16;
      const h = instance.videoHeight?.() ?? video.videoHeight ?? 9;
      if (w && h) setIntrinsic({ width: w, height: h });
    });
    return () => {
      instance.dispose();
      player.current = null;
      element.current = null;
    };
  }, [onDuration, onTime, url]);

  // Throttled prop -> player sync keeps a small dead-band to avoid feedback loops.
  useEffect(() => {
    const el = element.current;
    if (el && Math.abs(el.currentTime - currentTime) > 0.3) el.currentTime = currentTime;
  }, [currentTime]);

  // Publish the imperative focus handle (explicit seeks bypass the dead-band).
  useEffect(() => {
    if (!focusRef) return;
    focusRef.current = {
      seekMs: (ms) => {
        const el = element.current;
        if (el) el.currentTime = ms / 1000;
        player.current?.currentTime(ms / 1000);
      },
    };
    return () => {
      if (focusRef) focusRef.current = null;
    };
  }, [focusRef]);

  const transform: ViewerTransform = {
    contentRect: containRect(box, intrinsic),
    zoom: 1,
    panX: 0,
    panY: 0,
    rotation: 0,
  };

  return (
    <div ref={wrapRef} className="registered-viewer video-proof" style={{ position: "relative" }}>
      {/* No data-vjs-player here: that attribute makes video.js adopt this div as the
          player root and remove it on dispose, taking React's own node with it. */}
      <div ref={host} className="video-proof__host" />
      <AnnotationLayer
        transform={transform}
        tool={props.tool}
        annotations={props.annotations}
        activeAnnotationId={props.activeAnnotationId}
        positionMs={currentTime * 1000}
        timecodeMs={Math.round(currentTime * 1000)}
        onCreate={props.onCreate}
        onActivate={props.onActivate}
      />
    </div>
  );
}

function ImageViewer(props: ViewerProps) {
  const { url, fileName } = props;
  const [wrapRef, box] = useBoxSize<HTMLDivElement>();
  const [intrinsic, setIntrinsic] = useState({ width: 1, height: 1 });
  const transform: ViewerTransform = {
    contentRect: containRect(box, intrinsic),
    zoom: 1,
    panX: 0,
    panY: 0,
    rotation: 0,
  };
  return (
    <div ref={wrapRef} className="registered-viewer image-proof" style={{ position: "relative" }}>
      <img
        src={url}
        alt={fileName}
        style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
        onLoad={(e) =>
          setIntrinsic({
            width: e.currentTarget.naturalWidth || 1,
            height: e.currentTarget.naturalHeight || 1,
          })
        }
      />
      <AnnotationLayer
        transform={transform}
        tool={props.tool}
        annotations={props.annotations}
        activeAnnotationId={props.activeAnnotationId}
        onCreate={props.onCreate}
        onActivate={props.onActivate}
      />
    </div>
  );
}

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

function PdfViewer(props: ViewerProps) {
  const { url, focusRef } = props;
  const canvas = useRef<HTMLCanvasElement>(null);
  const [wrapRef, box] = useBoxSize<HTMLDivElement>();
  const [document, setDocument] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [rotation, setRotation] = useState(0);
  const [canvasSize, setCanvasSize] = useState({ width: 1, height: 1 });

  useEffect(() => {
    let cancelled = false;
    void pdfjs.getDocument({ url }).promise.then((next) => {
      if (!cancelled) setDocument(next);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  useEffect(() => {
    if (!document || !canvas.current) return;
    let cancelled = false;
    void document.getPage(page).then(async (pdfPage) => {
      if (cancelled || !canvas.current) return;
      const viewport = pdfPage.getViewport({ scale, rotation });
      const context = canvas.current.getContext("2d");
      if (!context) return;
      canvas.current.width = viewport.width;
      canvas.current.height = viewport.height;
      setCanvasSize({ width: viewport.width, height: viewport.height });
      await pdfPage.render({ canvas: canvas.current, canvasContext: context, viewport }).promise;
    });
    return () => {
      cancelled = true;
    };
  }, [document, page, rotation, scale]);

  useEffect(() => {
    if (!focusRef) return;
    focusRef.current = { goToPage: (next) => setPage(next) };
    return () => {
      if (focusRef) focusRef.current = null;
    };
  }, [focusRef]);

  // Annotations are stored in the displayed-canvas frame; rotation re-renders the canvas
  // (annotations bind to the orientation drawn at — see §7.4 note).
  const transform: ViewerTransform = {
    contentRect: containRect(box, canvasSize),
    zoom: 1,
    panX: 0,
    panY: 0,
    rotation: 0,
  };

  return (
    <div className="registered-viewer pdf-proof">
      <div className="annotation-tools pdf-tools">
        <button type="button" disabled={page <= 1} onClick={() => setPage((v) => v - 1)}>
          <ChevronLeft size={14} />
        </button>
        <span>
          {page} / {document?.numPages ?? "…"}
        </span>
        <button
          type="button"
          disabled={page >= (document?.numPages ?? 1)}
          onClick={() => setPage((v) => v + 1)}
        >
          <ChevronRight size={14} />
        </button>
        <button type="button" onClick={() => setScale((v) => Math.max(0.5, v - 0.2))}>
          <ZoomOut size={14} />
        </button>
        <button type="button" onClick={() => setScale((v) => Math.min(3, v + 0.2))}>
          <ZoomIn size={14} />
        </button>
        <button type="button" onClick={() => setRotation((v) => (v + 90) % 360)}>
          <RotateCw size={14} />
        </button>
      </div>
      <div ref={wrapRef} className="pdf-canvas" style={{ position: "relative" }}>
        <canvas ref={canvas} style={{ display: "block", margin: "0 auto" }} />
        <AnnotationLayer
          transform={transform}
          tool={props.tool}
          annotations={props.annotations}
          activeAnnotationId={props.activeAnnotationId}
          page={page}
          onCreate={props.onCreate}
          onActivate={props.onActivate}
        />
      </div>
    </div>
  );
}

function AudioViewer(props: ViewerProps) {
  const { url, currentTime, onTime, onDuration, onCreate, onActivate, focusRef, annotations } =
    props;
  const container = useRef<HTMLDivElement>(null);
  const ws = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<ReturnType<typeof RegionsPlugin.create> | null>(null);
  const annotationsRef = useRef(annotations);
  annotationsRef.current = annotations;

  useEffect(() => {
    if (!container.current) return;
    const regions = RegionsPlugin.create();
    regionsRef.current = regions;
    const wavesurfer = WaveSurfer.create({
      container: container.current,
      url,
      height: 120,
      waveColor: "#708090",
      progressColor: "#ff5d36",
      plugins: [regions],
    });
    ws.current = wavesurfer;
    wavesurfer.on("timeupdate", onTime);
    wavesurfer.on("decode", (duration) => {
      onDuration(duration);
      // Render stored ranges back onto the waveform.
      for (const a of annotationsRef.current) {
        if (a.anchor.type === "WAVEFORM_RANGE") {
          regions.addRegion({
            id: a.id,
            start: a.anchor.startMs / 1000,
            end: a.anchor.endMs / 1000,
            color: "rgba(127,212,255,.22)",
            drag: false,
            resize: false,
          });
        }
      }
    });
    const disable = regions.enableDragSelection({ color: "rgba(255, 93, 54, .24)" });
    regions.on("region-created", (region) => {
      // Only user drags (no preset id) become new anchors.
      if (region.id && annotationsRef.current.some((a) => a.id === region.id)) return;
      onCreate({
        type: "WAVEFORM_RANGE",
        startMs: Math.round(region.start * 1000),
        endMs: Math.round((region.end ?? region.start) * 1000),
      });
    });
    regions.on("region-clicked", (region, event) => {
      event.stopPropagation();
      wavesurfer.setTime(region.start);
      onActivate?.(region.id || null);
    });
    return () => {
      disable();
      wavesurfer.destroy();
      ws.current = null;
      regionsRef.current = null;
    };
  }, [onCreate, onDuration, onTime, onActivate, url]);

  // currentTime -> player sync (the effect the old code was missing entirely).
  useEffect(() => {
    const wavesurfer = ws.current;
    if (!wavesurfer) return;
    const dur = wavesurfer.getDuration();
    if (dur > 0 && Math.abs(wavesurfer.getCurrentTime() - currentTime) > 0.25) {
      wavesurfer.setTime(currentTime);
    }
  }, [currentTime]);

  useEffect(() => {
    if (!focusRef) return;
    focusRef.current = { seekMs: (ms) => ws.current?.setTime(ms / 1000) };
    return () => {
      if (focusRef) focusRef.current = null;
    };
  }, [focusRef]);

  return <div ref={container} className="registered-viewer audio-proof" />;
}

export function RegisteredViewer(props: ViewerProps) {
  const { fileType } = props;
  if (fileType?.startsWith("video/")) return <VideoViewer {...props} />;
  if (fileType?.startsWith("image/")) return <ImageViewer {...props} />;
  if (fileType === "application/pdf") return <PdfViewer {...props} />;
  if (fileType?.startsWith("audio/")) return <AudioViewer {...props} />;
  return <p>Download-only format. Attach a supported companion preview for proofing.</p>;
}
