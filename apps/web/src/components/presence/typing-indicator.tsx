import { useOthers } from "@liveblocks/react";

export function TypingIndicator({ kind = "typing" }: { kind?: "typing" | "commenting" }) {
  const people = useOthers().filter((other) =>
    kind === "typing" ? other.presence.isTyping : other.presence.isCommenting,
  );
  if (!people.length) return null;
  const names = people.slice(0, 2).map((person) => person.info.name);
  return (
    <span className="typing-indicator">
      {names.join(" and ")} {people.length === 1 ? "is" : "are"}{" "}
      {kind === "typing" ? "typing" : "writing a comment"}…
    </span>
  );
}
