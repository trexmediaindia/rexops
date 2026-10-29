import { useQuery } from "@tanstack/react-query";
import { contentTypeLabel } from "../lib/client-workspace";
import type { DeliverableRecord } from "../lib/types";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

async function getJson<T>(path: string): Promise<T | null> {
  const response = await fetch(`${apiUrl}${path}`, { credentials: "include" });
  return response.ok ? ((await response.json()) as T) : null;
}

/**
 * The work itself: the shared image, or a video's poster frame. Work that hasn't been
 * shared yet has nothing to show, so it gets a plain tile with its kind written on it.
 */
export function WorkThumbnail({ item }: { item: Pick<DeliverableRecord, "id" | "contentType"> }) {
  const thumb = useQuery({
    queryKey: ["client-thumb", item.id],
    queryFn: async () => {
      const versions = await getJson<Array<{ id: string; fileType: string | null }>>(
        `/api/file-versions/deliverable/${item.id}`,
      );
      const latest = versions?.[0];
      if (!latest) return null;
      const kind = latest.fileType?.startsWith("image/") ? "preview" : "poster";
      return (
        (await getJson<{ url: string }>(`/api/file-versions/${latest.id}/${kind}`))?.url ?? null
      );
    },
    retry: false,
    staleTime: 5 * 60_000,
  });
  return (
    <span className="work-thumb" data-empty={!thumb.data || undefined}>
      {thumb.data ? (
        <img src={thumb.data} alt="" loading="lazy" />
      ) : (
        <span>{contentTypeLabel(item.contentType)}</span>
      )}
    </span>
  );
}
