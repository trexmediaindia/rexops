import { useOthers, useStatus } from "@liveblocks/react";

export function ViewerDots({ versionId }: { versionId: string }) {
  const status = useStatus();
  const viewers = useOthers().filter((other) => other.presence.activeVersionId === versionId);
  if (status !== "connected" || !viewers.length) return null;
  const names = viewers.map((viewer) => viewer.info.name);
  return (
    <span
      className="viewer-dots"
      role="status"
      aria-label={`${names.join(", ")} viewing this version`}
    >
      <span>
        {viewers.slice(0, 3).map((viewer) => (
          <i
            key={viewer.connectionId}
            title={viewer.info.name}
            data-idle={viewer.presence.state === "idle"}
            style={{ background: viewer.info.color }}
          />
        ))}
      </span>
      {viewers.length} viewing
    </span>
  );
}
