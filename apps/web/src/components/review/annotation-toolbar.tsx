import { ArrowUpRight, MousePointer2, Pencil, Pentagon, Plus, Square } from "lucide-react";
import type { AnnotationTool, Medium } from "./anchor";

// One unified, medium-aware annotation toolbar. Replaces the three divergent per-viewer
// toolbars (video Point/Box/Draw, image Rectangle/Polygon, pdf page/zoom). Audio has no
// drawing tools (it uses waveform drag), so the toolbar is hidden for audio/other.

/*
 * "Point", "Box", "Polygon" name the shape, not the job. Nothing on the screen
 * said that picking a tool and drawing on the media is how a comment gets pinned
 * to a place in the work. Each tool now carries the sentence, the toolbar says
 * what it is for, and the selected tool tells you what to do next.
 */
const ALL_TOOLS: Array<{
  tool: AnnotationTool;
  label: string;
  /** What this tool does to the media, in the words of the person using it. */
  does: string;
  icon: typeof Square;
}> = [
  {
    tool: "select",
    label: "Select",
    does: "Click an existing mark to jump to the comment attached to it. Nothing new is drawn.",
    icon: MousePointer2,
  },
  {
    tool: "point",
    label: "Point",
    does: "Click one spot to pin a comment to it. Best for a single detail.",
    icon: Plus,
  },
  {
    tool: "box",
    label: "Box",
    does: "Drag a rectangle around the area you are talking about.",
    icon: Square,
  },
  {
    tool: "arrow",
    label: "Arrow",
    does: "Drag from where you want the reader to look to the thing you mean.",
    icon: ArrowUpRight,
  },
  {
    tool: "draw",
    label: "Draw",
    does: "Draw freehand over the frame, as if circling it with a pen.",
    icon: Pencil,
  },
  {
    tool: "polygon",
    label: "Polygon",
    does: "Click each corner to outline an irregular shape, then click the first point to close it.",
    icon: Pentagon,
  },
];

const TOOLS_BY_MEDIUM: Record<Medium, AnnotationTool[]> = {
  image: ["select", "point", "box", "arrow", "draw", "polygon"],
  video: ["select", "point", "box", "arrow", "draw", "polygon"],
  pdf: ["select", "point", "box", "arrow", "draw", "polygon"],
  audio: [],
  other: [],
};

export function AnnotationToolbar({
  medium,
  tool,
  onToolChange,
  disabled,
}: {
  medium: Medium;
  tool: AnnotationTool;
  onToolChange: (tool: AnnotationTool) => void;
  disabled?: boolean;
}) {
  const tools = TOOLS_BY_MEDIUM[medium];
  if (tools.length === 0) return null;
  const visible = ALL_TOOLS.filter((entry) => tools.includes(entry.tool));
  const active = visible.find((entry) => entry.tool === tool);
  return (
    <div className="annotation-toolbar-group">
      <div
        className="annotation-toolbar"
        role="toolbar"
        aria-label="Mark up the work to pin a comment to a place in it"
      >
        {visible.map(({ tool: value, label, does, icon: Icon }) => (
          <button
            key={value}
            type="button"
            className="annotation-toolbar__tool"
            data-active={tool === value}
            aria-pressed={tool === value}
            aria-label={`${label}: ${does}`}
            disabled={disabled}
            title={does}
            onClick={() => onToolChange(value)}
          >
            <Icon size={14} />
            <span>{label}</span>
          </button>
        ))}
      </div>
      {active ? (
        <p className="annotation-toolbar__hint" aria-live="polite">
          {disabled
            ? "Marking up is turned off for this version."
            : `${active.label}: ${active.does}`}
        </p>
      ) : null}
    </div>
  );
}
