import { useOthers } from "@liveblocks/react";
import { useEffect } from "react";

export function useFollow({
  connectionId,
  onVersion,
  onTime,
  onCompare,
}: {
  connectionId: number | null;
  onVersion(id: string): void;
  onTime(seconds: number): void;
  onCompare(id: string | null): void;
}) {
  const others = useOthers();
  const target = others.find((other) => other.connectionId === connectionId);
  useEffect(() => {
    if (!target) return;
    if (target.presence.activeVersionId) onVersion(target.presence.activeVersionId);
    if (
      target.presence.view?.playheadMs !== null &&
      target.presence.view?.playheadMs !== undefined
    ) {
      onTime(target.presence.view.playheadMs / 1000);
    }
    onCompare(target.presence.view?.compareB ?? null);
  }, [onCompare, onTime, onVersion, target]);
  return target ?? null;
}
