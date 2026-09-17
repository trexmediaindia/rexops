import { Button } from "@rexops/ui";
import { Check, ChevronDown, LoaderCircle, RotateCcw, UploadCloud, X } from "lucide-react";
import { useRef, useState } from "react";
import {
  cancelUpload,
  clearFinishedUploads,
  reselectUpload,
  retryUpload,
  type UploadItem,
  useUploadStore,
} from "../../lib/upload-store";

function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.ceil(bytes / 1024)} KB`;
}

function UploadRow({ item }: { item: UploadItem }) {
  const input = useRef<HTMLInputElement>(null);
  const active = ["signing", "uploading", "resuming", "completing"].includes(item.status);
  return (
    <article className="upload-manager__row" data-status={item.status}>
      <div>
        <span className="upload-manager__icon">
          {item.status === "done" ? (
            <Check size={14} />
          ) : active ? (
            <LoaderCircle className="spin" size={14} />
          ) : (
            <UploadCloud size={14} />
          )}
        </span>
        <div>
          <strong title={item.fileName}>{item.fileName}</strong>
          <span>
            {formatBytes(item.fileSize)}
            {item.speedBytesPerSecond > 0 ? ` · ${formatBytes(item.speedBytesPerSecond)}/s` : ""}
          </span>
        </div>
        <span className="rx-mono">{item.progress}%</span>
      </div>
      <i role="progressbar" aria-valuenow={item.progress} aria-valuemin={0} aria-valuemax={100}>
        <b style={{ width: `${item.progress}%` }} />
      </i>
      {item.error ? <small>{item.error}</small> : null}
      <div className="upload-manager__actions">
        {item.status === "needs-file" ? (
          <>
            <button type="button" onClick={() => input.current?.click()}>
              Re-select to resume
            </button>
            <input
              ref={input}
              hidden
              type="file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) reselectUpload(item.id, file);
              }}
            />
          </>
        ) : null}
        {item.status === "failed" ? (
          <button type="button" onClick={() => retryUpload(item.id)}>
            <RotateCcw size={12} /> Retry
          </button>
        ) : null}
        {!["done", "canceled"].includes(item.status) ? (
          <button
            type="button"
            onClick={() => void cancelUpload(item.id)}
            aria-label="Cancel upload"
          >
            <X size={12} />
          </button>
        ) : null}
      </div>
    </article>
  );
}

export function UploadManager() {
  const { items } = useUploadStore();
  const [collapsed, setCollapsed] = useState(false);
  if (!items.length) return null;
  const active = items.filter((item) =>
    ["queued", "signing", "uploading", "resuming", "completing", "needs-file"].includes(
      item.status,
    ),
  ).length;
  return (
    <aside className="upload-manager" aria-live="polite" data-collapsed={collapsed}>
      <header>
        <div>
          <UploadCloud size={16} />
          <strong>Uploads</strong>
          <span>{active ? `${active} active` : `${items.length} complete`}</span>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? "Expand uploads" : "Collapse uploads"}
        >
          <ChevronDown size={15} />
        </button>
      </header>
      {!collapsed ? (
        <>
          <div className="upload-manager__list">
            {items.map((item) => (
              <UploadRow item={item} key={item.id} />
            ))}
          </div>
          <footer>
            <span>{active ? "Uploads continue while you work." : "All uploads finished."}</span>
            <Button variant="ghost" onClick={clearFinishedUploads}>
              Clear done
            </Button>
          </footer>
        </>
      ) : null}
    </aside>
  );
}
