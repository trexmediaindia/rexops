import { useOthers, useStatus } from "@liveblocks/react";

export function GhostPlayheads({
  versionId,
  duration,
  onJump,
}: {
  versionId: string;
  duration: number;
  onJump(seconds: number): void;
}) {
  const status = useStatus();
  const others = useOthers().filter(
    (other) =>
      other.presence.activeVersionId === versionId &&
      other.presence.view?.playheadMs !== null &&
      other.presence.view?.playheadMs !== undefined,
  );
  if (status !== "connected" || !duration) return null;
  return (
    <>
      {others.map((other) => {
        const seconds = (other.presence.view?.playheadMs ?? 0) / 1000;
        return (
          <button
            type="button"
            className="ghost-playhead"
            key={other.connectionId}
            style={
              {
                left: `${Math.min(100, (seconds / duration) * 100)}%`,
                "--presence-color": other.info.color,
              } as React.CSSProperties
            }
            title={`${other.info.name} · ${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`}
            aria-label={`Jump to ${other.info.name}'s playhead`}
            onClick={() => onJump(seconds)}
          >
            <span>{other.info.name}</span>
          </button>
        );
      })}
    </>
  );
}
