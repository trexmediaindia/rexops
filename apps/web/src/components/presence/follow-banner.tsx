export function FollowBanner({ name, onExit }: { name: string; onExit(): void }) {
  return (
    <div className="follow-banner" role="status">
      Following {name}
      <button type="button" onClick={onExit}>
        Exit
      </button>
    </div>
  );
}
