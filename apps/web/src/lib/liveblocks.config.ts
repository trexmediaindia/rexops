import type { JsonObject } from "@liveblocks/client";

export type RexSelection =
  | {
      kind: "REGION";
      x: number;
      y: number;
      w: number | null;
      h: number | null;
      page: number | null;
    }
  | { kind: "WAVEFORM"; startMs: number; endMs: number }
  | { kind: "PAGE"; page: number }
  | null;

export type RexPresence = {
  activeRoom: string;
  activeVersionId: string | null;
  view: {
    playheadMs: number | null;
    selection: RexSelection;
    compareB: string | null;
  } | null;
  cursor: { x: number; y: number } | null;
  state: "active" | "idle";
  isCommenting: boolean;
  isTyping: boolean;
};

export type RexUserInfo = {
  name: string;
  color: string;
  avatarUrl: string | null;
  role: string;
  agencyId: string;
  audience: "AGENCY" | "CLIENT" | "GUEST";
};

export type RexRoomEvent =
  | { type: "INVALIDATE"; queryKeys: string[][] }
  | {
      type: "COMMENT_ADDED";
      deliverableId: string;
      versionId: string;
      comment: JsonObject;
    }
  | { type: "COMMENT_RESOLVED"; deliverableId: string; commentId: string; resolved: boolean }
  | { type: "DECISION_MADE"; deliverableId: string; versionId: string; decision: string }
  | { type: "VERSION_ADDED"; deliverableId: string; version: JsonObject }
  | { type: "MESSAGE_ADDED"; channelId: string; message: JsonObject }
  | { type: "REACTION_FLY"; emoji: string; x: number; y: number }
  | {
      type: "NOTIFICATION";
      unreadDelta: number;
      preview: { title: string; url: string | null };
    };

declare global {
  interface Liveblocks {
    Presence: RexPresence;
    UserMeta: {
      id: string;
      info: RexUserInfo;
    };
    RoomEvent: RexRoomEvent;
  }
}
