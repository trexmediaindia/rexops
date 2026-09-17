import {
  RoomProvider,
  useBroadcastEvent,
  useEventListener,
  useMyPresence,
  useOthers,
  useSelf,
} from "@liveblocks/react";
import { useQueryClient } from "@tanstack/react-query";
import type React from "react";
import { useEffect } from "react";
import type { RexRoomEvent } from "./liveblocks.config";

type InvalidationDetail = {
  room: string;
  queryKeys: string[][];
};

export function broadcastInvalidation(detail: InvalidationDetail) {
  window.dispatchEvent(new CustomEvent<InvalidationDetail>("rexops:invalidate", { detail }));
}

export function broadcastRoomEvent(room: string, event: RexRoomEvent) {
  window.dispatchEvent(
    new CustomEvent<{ room: string; event: RexRoomEvent }>("rexops:room-event", {
      detail: { room, event },
    }),
  );
}

function RoomBridge({ room }: { room: string }) {
  const queryClient = useQueryClient();
  const broadcast = useBroadcastEvent();
  const others = useOthers();
  const self = useSelf();
  const [presence, updatePresence] = useMyPresence();

  useEffect(() => {
    const listener = (raw: Event) => {
      const event = raw as CustomEvent<InvalidationDetail>;
      if (event.detail.room !== room) return;
      broadcast({ type: "INVALIDATE", queryKeys: event.detail.queryKeys });
    };
    window.addEventListener("rexops:invalidate", listener);
    const roomEventListener = (raw: Event) => {
      const event = raw as CustomEvent<{ room: string; event: RexRoomEvent }>;
      if (event.detail.room === room) broadcast(event.detail.event);
    };
    window.addEventListener("rexops:room-event", roomEventListener);
    return () => {
      window.removeEventListener("rexops:invalidate", listener);
      window.removeEventListener("rexops:room-event", roomEventListener);
    };
  }, [broadcast, room]);

  useEventListener(({ event }) => {
    if (event.type === "INVALIDATE") {
      for (const queryKey of event.queryKeys) {
        void queryClient.invalidateQueries({ queryKey });
      }
    }
  });

  useEffect(() => {
    const move = (event: PointerEvent) => {
      updatePresence({
        cursor: { x: event.clientX, y: event.clientY },
        activeRoom: room,
        state: "active",
      });
    };
    const leave = () => updatePresence({ cursor: null });
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerleave", leave);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerleave", leave);
    };
  }, [room, updatePresence]);

  useEffect(() => {
    let timer = window.setTimeout(() => updatePresence({ state: "idle" }), 60_000);
    const active = () => {
      window.clearTimeout(timer);
      updatePresence({ state: "active" });
      timer = window.setTimeout(() => updatePresence({ state: "idle" }), 60_000);
    };
    window.addEventListener("pointerdown", active);
    window.addEventListener("keydown", active);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointerdown", active);
      window.removeEventListener("keydown", active);
    };
  }, [updatePresence]);

  return (
    <>
      {others.map((other) => {
        const cursor = other.presence.cursor;
        if (!cursor) return null;
        // A screen can hold more than one room at once — the inbox joins `user:<id>`
        // for its notification panel while the topbar bell is already in it. Each
        // connection sees the other as an "other", so the viewer's own name was
        // being drawn back at them, twice.
        if (self && other.id === self.id) return null;
        // A teammate's pointer is in *their* viewport's coordinates. Drawing one that
        // falls outside ours put a fixed-position marker past the right edge, which
        // widened the document and gave every page a phantom horizontal scrollbar.
        if (
          cursor.x < 0 ||
          cursor.y < 0 ||
          cursor.x > window.innerWidth ||
          cursor.y > window.innerHeight
        ) {
          return null;
        }
        return (
          <span
            className="presence-cursor"
            key={other.connectionId}
            style={
              {
                transform: `translate(${cursor.x}px, ${cursor.y}px)`,
                "--presence-color": other.info.color,
              } as React.CSSProperties
            }
          >
            <i />
            <b>{other.info.name}</b>
          </span>
        );
      })}
      <span hidden>{String(presence.activeRoom ?? "")}</span>
    </>
  );
}

export function RealtimeRoom({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <RoomProvider
      id={id}
      initialPresence={{
        cursor: null,
        activeRoom: id,
        activeVersionId: null,
        view: null,
        state: "active",
        isCommenting: false,
        isTyping: false,
      }}
    >
      <RoomBridge room={id} />
      {children}
    </RoomProvider>
  );
}
