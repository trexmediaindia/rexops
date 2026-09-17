import { useSyncExternalStore } from "react";
import { batches, concurrentMap, partBounds, partNumbersForSize } from "./multipart-upload";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
const storageKey = "rexops:upload-queue:v1";

export type UploadStatus =
  | "queued"
  | "signing"
  | "uploading"
  | "resuming"
  | "needs-file"
  | "completing"
  | "done"
  | "failed"
  | "canceled";

export type UploadIntent = {
  deliverableId: string;
  purpose: "VERSION" | "COMPANION_PREVIEW";
  targetVersionId?: string;
  versionBump?: "MAJOR" | "MINOR";
  isSource?: boolean;
};

export type UploadItem = {
  id: string;
  deliverableId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  fingerprint: string;
  purpose: UploadIntent["purpose"];
  targetVersionId?: string;
  versionBump: "MAJOR" | "MINOR";
  isSource: boolean;
  sessionId?: string;
  status: UploadStatus;
  progress: number;
  speedBytesPerSecond: number;
  error?: string;
  createdAt: number;
  file?: File;
  abort?: AbortController;
};

type Snapshot = { items: UploadItem[] };

let snapshot: Snapshot = { items: [] };
const listeners = new Set<() => void>();
let active = 0;

function emit() {
  snapshot = { items: [...snapshot.items] };
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(
      storageKey,
      JSON.stringify(
        snapshot.items
          .filter((item) => !["done", "canceled"].includes(item.status))
          .map(({ file: _file, abort: _abort, ...item }) => ({
            ...item,
            status: item.sessionId ? "needs-file" : "queued",
          })),
      ),
    );
  }
  for (const listener of listeners) listener();
}

function patch(id: string, next: Partial<UploadItem>) {
  const item = snapshot.items.find((candidate) => candidate.id === id);
  if (!item) return;
  Object.assign(item, next);
  emit();
}

async function request<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export function uploadFingerprint(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function hydrate() {
  if (typeof localStorage === "undefined" || snapshot.items.length) return;
  const raw = localStorage.getItem(storageKey);
  if (!raw) return;
  try {
    const stored = JSON.parse(raw) as UploadItem[];
    snapshot = {
      items: stored.map((item) => ({
        ...item,
        status: item.sessionId ? "needs-file" : "queued",
        progress: item.progress ?? 0,
        speedBytesPerSecond: 0,
      })),
    };
  } catch {
    localStorage.removeItem(storageKey);
  }
}

hydrate();

async function waitUntilVisible() {
  if (typeof document === "undefined" || document.visibilityState === "visible") return;
  await new Promise<void>((resolve) => {
    const show = () => {
      if (document.visibilityState !== "visible") return;
      document.removeEventListener("visibilitychange", show);
      resolve();
    };
    document.addEventListener("visibilitychange", show);
  });
}

async function runUpload(item: UploadItem) {
  if (!item.file || !item.sessionId) return;
  active += 1;
  const controller = new AbortController();
  patch(item.id, {
    abort: controller,
    status: item.progress ? "resuming" : "signing",
    error: undefined,
  });
  const startedAt = performance.now();
  try {
    const inspection = await request<{
      completedParts: Array<{ partNumber: number; eTag: string }>;
      status: string;
      partSizeBytes: number;
    }>(`/api/file-versions/uploads/${item.sessionId}`);
    if (["COMPLETE", "ABORTED", "EXPIRED"].includes(inspection.status)) {
      throw new Error("This upload session is no longer resumable.");
    }
    const completed = new Map(inspection.completedParts.map((part) => [part.partNumber, part]));
    const remaining = partNumbersForSize(item.file.size, inspection.partSizeBytes).filter(
      (partNumber) => !completed.has(partNumber),
    );
    const signedParts: Array<{ partNumber: number; url: string }> = [];
    for (const group of batches(remaining, 100)) {
      const signed = await request<{ parts: Array<{ partNumber: number; url: string }> }>(
        `/api/file-versions/uploads/${item.sessionId}/parts`,
        { method: "POST", body: JSON.stringify({ partNumbers: group }) },
      );
      signedParts.push(...signed.parts);
    }
    let uploadedBytes = [...completed.keys()].reduce((total, partNumber) => {
      const bounds = partBounds(partNumber, item.fileSize, inspection.partSizeBytes);
      return total + bounds.end - bounds.start;
    }, 0);
    patch(item.id, {
      status: "uploading",
      progress: Math.round((uploadedBytes / item.fileSize) * 96),
    });
    const uploaded = await concurrentMap(signedParts, 4, async (part) => {
      await waitUntilVisible();
      const bounds = partBounds(part.partNumber, item.fileSize, inspection.partSizeBytes);
      const blob = item.file?.slice(bounds.start, bounds.end);
      if (!blob) throw new Error("Re-select the source file to continue.");
      const response = await fetch(part.url, {
        method: "PUT",
        body: blob,
        signal: controller.signal,
        headers: { "content-type": "application/octet-stream" },
      });
      if (!response.ok) throw new Error(`Part ${part.partNumber} failed to upload.`);
      uploadedBytes += blob.size;
      const elapsedSeconds = Math.max((performance.now() - startedAt) / 1000, 0.2);
      patch(item.id, {
        progress: Math.max(2, Math.round((uploadedBytes / item.fileSize) * 96)),
        speedBytesPerSecond: uploadedBytes / elapsedSeconds,
      });
      const body = (await response.json().catch(() => null)) as { eTag?: string } | null;
      const eTag = response.headers.get("etag") ?? body?.eTag;
      if (!eTag) throw new Error(`Part ${part.partNumber} returned no integrity tag.`);
      return { partNumber: part.partNumber, eTag };
    });
    const parts = [...inspection.completedParts, ...uploaded].sort(
      (left, right) => left.partNumber - right.partNumber,
    );
    patch(item.id, { status: "completing", progress: 98 });
    await request(`/api/file-versions/uploads/${item.sessionId}/complete`, {
      method: "POST",
      body: JSON.stringify({ parts }),
    });
    patch(item.id, { status: "done", progress: 100, speedBytesPerSecond: 0, abort: undefined });
    window.dispatchEvent(
      new CustomEvent("rexops:upload-complete", {
        detail: { deliverableId: item.deliverableId, purpose: item.purpose },
      }),
    );
  } catch (error) {
    if (controller.signal.aborted) {
      patch(item.id, { status: "canceled", abort: undefined });
    } else {
      patch(item.id, {
        status: "failed",
        abort: undefined,
        speedBytesPerSecond: 0,
        error: error instanceof Error ? error.message : "Upload failed.",
      });
    }
  } finally {
    active -= 1;
    void pump();
  }
}

async function openBatch(items: UploadItem[]) {
  const byDeliverable = new Map<string, UploadItem[]>();
  for (const item of items) {
    byDeliverable.set(item.deliverableId, [...(byDeliverable.get(item.deliverableId) ?? []), item]);
  }
  for (const [deliverableId, deliverableItems] of byDeliverable) {
    try {
      const result = await request<{
        sessions: Array<{ sessionId?: string; error?: string }>;
      }>(`/api/file-versions/deliverable/${deliverableId}/upload-batch`, {
        method: "POST",
        body: JSON.stringify({
          files: deliverableItems.map((item) => ({
            fileName: item.fileName,
            fileType: item.fileType,
            fileSizeBytes: item.fileSize,
            fingerprint: item.fingerprint,
            fileFingerprint: item.fingerprint,
            purpose: item.purpose,
            targetVersionId: item.targetVersionId,
            versionBump: item.versionBump,
            isSource: item.isSource,
          })),
        }),
      });
      result.sessions.forEach((session, index) => {
        const item = deliverableItems[index];
        if (!item) return;
        patch(
          item.id,
          session.sessionId
            ? { sessionId: session.sessionId, status: "queued" }
            : { status: "failed", error: session.error ?? "Upload could not be opened." },
        );
      });
    } catch (error) {
      for (const item of deliverableItems) {
        patch(item.id, {
          status: "failed",
          error: error instanceof Error ? error.message : "Upload batch could not be opened.",
        });
      }
    }
  }
}

async function pump() {
  while (active < 3) {
    const item = snapshot.items.find(
      (candidate) => candidate.status === "queued" && candidate.file && candidate.sessionId,
    );
    if (!item) break;
    void runUpload(item);
    await Promise.resolve();
  }
}

export async function enqueueUploads(files: File[], intent: UploadIntent) {
  const items = files.map<UploadItem>((file) => ({
    id: crypto.randomUUID(),
    deliverableId: intent.deliverableId,
    fileName: file.name,
    fileType: file.type || "application/octet-stream",
    fileSize: file.size,
    fingerprint: uploadFingerprint(file),
    purpose: intent.purpose,
    targetVersionId: intent.targetVersionId,
    versionBump: intent.versionBump ?? "MINOR",
    isSource: intent.isSource ?? false,
    status: "signing",
    progress: 0,
    speedBytesPerSecond: 0,
    createdAt: Date.now(),
    file,
  }));
  snapshot.items.unshift(...items);
  emit();
  await openBatch(items);
  await pump();
  return items;
}

export function reselectUpload(id: string, file: File) {
  const item = snapshot.items.find((candidate) => candidate.id === id);
  if (!item) return false;
  if (uploadFingerprint(file) !== item.fingerprint) {
    patch(id, { error: "Choose the same file that started this upload." });
    return false;
  }
  patch(id, { file, status: "queued", error: undefined });
  void pump();
  return true;
}

export async function cancelUpload(id: string) {
  const item = snapshot.items.find((candidate) => candidate.id === id);
  if (!item) return;
  item.abort?.abort();
  if (item.sessionId) {
    await request(`/api/file-versions/uploads/${item.sessionId}`, { method: "DELETE" }).catch(
      () => undefined,
    );
  }
  patch(id, { status: "canceled", abort: undefined });
}

export function retryUpload(id: string) {
  const item = snapshot.items.find((candidate) => candidate.id === id);
  if (!item) return;
  patch(id, {
    status: item.file ? "queued" : "needs-file",
    error: undefined,
  });
  void pump();
}

export function clearFinishedUploads() {
  snapshot.items = snapshot.items.filter((item) => !["done", "canceled"].includes(item.status));
  emit();
}

export function useUploadStore() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
    () => snapshot,
  );
}
