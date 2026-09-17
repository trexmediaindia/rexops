import { useQuery } from "@tanstack/react-query";
import { Check, CloudUpload, File, Film, Image, LoaderCircle, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { UploadItem } from "../../lib/upload-store";
import type { FileVersionView } from "./types";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

function statusText(status: string) {
  return status.replaceAll("_", " ").toLowerCase();
}

function FileGlyph({ type }: { type: string | null }) {
  if (type?.startsWith("video/")) return <Film size={20} />;
  if (type?.startsWith("image/")) return <Image size={20} />;
  return <File size={20} />;
}

function VersionThumb({ version }: { version: FileVersionView }) {
  const [spriteCell, setSpriteCell] = useState(0);
  const [hovered, setHovered] = useState(false);
  const poster = useQuery({
    queryKey: ["version-poster", version.id],
    queryFn: async () => {
      const response = await fetch(`${apiUrl}/api/file-versions/${version.id}/poster`, {
        credentials: "include",
      });
      if (!response.ok) return null;
      return (await response.json()) as { url: string };
    },
    retry: false,
  });
  const sprite = useQuery({
    queryKey: ["version-sprite", version.id],
    queryFn: async () => {
      const response = await fetch(`${apiUrl}/api/file-versions/${version.id}/sprite`, {
        credentials: "include",
      });
      if (!response.ok) return null;
      return (await response.json()) as {
        url: string;
        columns: number;
        rows: number;
        cellWidth: number;
        cellHeight: number;
      };
    },
    retry: false,
  });
  useEffect(() => {
    const data = sprite.data;
    if (!hovered || !data || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(
      () => setSpriteCell((value) => (value + 1) % Math.min(3, data.columns * data.rows)),
      420,
    );
    return () => window.clearInterval(timer);
  }, [hovered, sprite.data]);
  const cell = sprite.data;
  return (
    <span
      className="version-thumb"
      role="img"
      aria-label={`Thumbnail for ${version.displayVersion}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {hovered && cell ? (
        <i
          style={{
            backgroundImage: `url("${cell.url}")`,
            backgroundSize: `${cell.columns * cell.cellWidth}px ${cell.rows * cell.cellHeight}px`,
            backgroundPosition: `${-(spriteCell % cell.columns) * cell.cellWidth}px ${-Math.floor(spriteCell / cell.columns) * cell.cellHeight}px`,
          }}
        />
      ) : poster.data?.url ? (
        <img src={poster.data.url} alt="" />
      ) : (
        <FileGlyph type={version.fileType} />
      )}
    </span>
  );
}

export function VersionRail({
  versions,
  selectedId,
  onSelect,
  onFiles,
  pending = [],
  viewerDots,
  draggable = false,
}: {
  versions: FileVersionView[];
  selectedId: string;
  onSelect(id: string): void;
  onFiles?(files: File[]): void;
  pending?: UploadItem[];
  viewerDots?(version: FileVersionView): React.ReactNode;
  draggable?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const latest = Math.max(...versions.map((version) => version.versionNumber), 0);
  const isEmpty = !versions.length && !pending.length;
  return (
    <div className="version-stack">
      {/* When the rail is empty the compact "Drop a file to add" strip and the large
          empty state say the same thing twice, stacked. Show one or the other. */}
      {onFiles && !isEmpty ? (
        <button
          type="button"
          className="version-stack__dropzone"
          data-dragging={dragging}
          onClick={() => input.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            onFiles([...event.dataTransfer.files]);
          }}
        >
          <Plus size={14} /> Drop a file to add
          <input
            ref={input}
            hidden
            multiple
            type="file"
            onChange={(event) => onFiles([...(event.target.files ?? [])])}
          />
        </button>
      ) : null}
      {pending.map((item) => (
        <article className="version-stack__pending" key={item.id}>
          <span>
            <LoaderCircle className="spin" size={15} /> {item.fileName}
          </span>
          <i>
            <b style={{ width: `${item.progress}%` }} />
          </i>
          <small>
            {item.status === "needs-file" ? "Re-select to resume" : `${item.progress}%`}
          </small>
        </article>
      ))}
      <div className="version-stack__list">
        {versions.map((version) => (
          <article
            className="version-stack__item"
            key={version.id}
            data-selected={selectedId === version.id}
            data-status={version.status.toLowerCase()}
          >
            <button
              type="button"
              draggable={draggable}
              onDragStart={(event) => {
                if (!draggable) return;
                event.dataTransfer.setData("application/x-rexops-version", version.id);
                event.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => onSelect(version.id)}
            >
              <VersionThumb version={version} />
              <span className="version-stack__copy">
                <span>
                  <b className="rx-mono">
                    v{version.majorVersion}.<em>{version.minorVersion}</em>
                  </b>
                  {version.versionNumber === latest ? <small>LATEST</small> : null}
                </span>
                <strong>{version.label || version.fileName || "Untitled version"}</strong>
                <span className="version-stack__status">
                  {version.previewStatus === "READY" ? (
                    <Check size={11} />
                  ) : version.previewStatus === "FAILED" ? (
                    <span aria-hidden>!</span>
                  ) : (
                    <LoaderCircle className="spin" size={11} />
                  )}
                  {statusText(version.status)}
                </span>
              </span>
            </button>
            {viewerDots?.(version)}
          </article>
        ))}
      </div>
      {isEmpty && onFiles ? (
        <button
          type="button"
          className="version-stack__empty"
          data-dragging={dragging}
          onClick={() => input.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            onFiles([...event.dataTransfer.files]);
          }}
        >
          <CloudUpload size={22} aria-hidden="true" />
          <strong>Drop the first cut here</strong>
          <span>or click to browse</span>
          <input
            ref={input}
            hidden
            multiple
            type="file"
            onChange={(event) => onFiles([...(event.target.files ?? [])])}
          />
        </button>
      ) : null}
    </div>
  );
}
