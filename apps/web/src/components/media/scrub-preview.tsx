export function spriteCellIndex(
  hoverTimeSeconds: number,
  intervalMs: number,
  columns: number,
  rows: number,
) {
  return Math.max(
    0,
    Math.min(columns * rows - 1, Math.floor((hoverTimeSeconds * 1000) / intervalMs)),
  );
}

export function ScrubPreview({
  url,
  hoverTime,
  intervalMs,
  columns,
  rows,
  cellWidth,
  cellHeight,
  positionPercent,
}: {
  url: string;
  hoverTime: number;
  intervalMs: number;
  columns: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  positionPercent: number;
}) {
  const index = spriteCellIndex(hoverTime, intervalMs, columns, rows);
  const column = index % columns;
  const row = Math.floor(index / columns);
  const minutes = Math.floor(hoverTime / 60);
  const seconds = Math.floor(hoverTime % 60);
  return (
    <span className="scrub-preview" style={{ left: `${positionPercent}%` }}>
      <i
        style={{
          width: cellWidth,
          height: cellHeight,
          backgroundImage: `url("${url}")`,
          backgroundPosition: `${-column * cellWidth}px ${-row * cellHeight}px`,
        }}
      />
      <b className="rx-mono">
        {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
      </b>
    </span>
  );
}
