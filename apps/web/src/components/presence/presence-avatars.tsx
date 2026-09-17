import { useOthers, useStatus } from "@liveblocks/react";
import { ChevronDown, Radio } from "lucide-react";
import { useState } from "react";

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function PresenceAvatars({
  following,
  onFollow,
}: {
  following: number | null;
  onFollow(connectionId: number | null): void;
}) {
  const others = useOthers();
  const status = useStatus();
  const [open, setOpen] = useState(false);
  if (status !== "connected") return <span className="presence-fallback">Fallback</span>;
  if (!others.length) return <span className="presence-alone">You’re the only reviewer here</span>;
  return (
    <div className="presence-avatars">
      <fieldset aria-label={`${others.map((other) => other.info.name).join(", ")} are here`}>
        {others.slice(0, 4).map((other) => (
          <span
            key={other.connectionId}
            title={`${other.info.name}${other.presence.state === "idle" ? " · idle" : ""}`}
            data-idle={other.presence.state === "idle"}
            style={{ "--presence-color": other.info.color } as React.CSSProperties}
          >
            {other.info.avatarUrl ? (
              <img src={other.info.avatarUrl} alt="" />
            ) : (
              initials(other.info.name)
            )}
          </span>
        ))}
        {others.length > 4 ? <b>+{others.length - 4}</b> : null}
      </fieldset>
      <button type="button" onClick={() => setOpen((value) => !value)}>
        <Radio size={13} /> Follow <ChevronDown size={12} />
      </button>
      {open ? (
        <div className="presence-avatars__menu">
          {others.map((other) => (
            <button
              type="button"
              data-active={following === other.connectionId}
              key={other.connectionId}
              onClick={() => {
                onFollow(following === other.connectionId ? null : other.connectionId);
                setOpen(false);
              }}
            >
              <span style={{ background: other.info.color }} />
              {following === other.connectionId
                ? `Stop following ${other.info.name}`
                : other.info.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
