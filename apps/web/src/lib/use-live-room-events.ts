import { useEventListener } from "@liveblocks/react";
import { useQueryClient } from "@tanstack/react-query";
import type { RexRoomEvent } from "./liveblocks.config";

export function useLiveRoomEvents(
  handler: (event: RexRoomEvent) => boolean | undefined,
  fallbackQueryKeys: string[][] = [],
) {
  const queryClient = useQueryClient();
  useEventListener(({ event }) => {
    if (event.type === "INVALIDATE") return;
    try {
      const handled = handler(event);
      if (handled === false) throw new Error("Event was not handled.");
    } catch {
      for (const queryKey of fallbackQueryKeys) {
        void queryClient.invalidateQueries({ queryKey });
      }
    }
  });
}
