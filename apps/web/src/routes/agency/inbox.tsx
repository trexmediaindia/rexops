import { useEventListener, useMyPresence, useOthers, useStatus } from "@liveblocks/react";
import { Button, SaveState, Select, Skeleton } from "@rexops/ui";
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Bell,
  BellRing,
  CheckCheck,
  ChevronLeft,
  FileText,
  Link2,
  LoaderCircle,
  MessageCircle,
  Paperclip,
  Search,
  Send,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AgencyShell } from "../../components/app-shell";
import { TypingIndicator } from "../../components/presence/typing-indicator";
import { PageHeader } from "../../components/ui/page-header";
import type { FileVersionView } from "../../components/versioning/types";
import { VersionChips, VersionPicker } from "../../components/versioning/version-picker";
import { uploadAttachment } from "../../lib/attachment-upload";
import { authClient } from "../../lib/auth-client";
import { formatAbsoluteTime, formatRelativeTime } from "../../lib/format";
import { broadcastInvalidation, broadcastRoomEvent, RealtimeRoom } from "../../lib/realtime";
import { useLiveRoomEvents } from "../../lib/use-live-room-events";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

async function request<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string | null;
  url: string | null;
  isRead: boolean;
  createdAt: string;
};
type Channel = {
  id: string;
  scopeType: "PROJECT" | "DELIVERABLE" | "DM";
  scopeId: string | null;
  name: string | null;
  unreadCount: number;
};
type Message = {
  id: string;
  body: string;
  userId: string;
  authorName: string;
  refVersionIds: string[];
  mentionUserIds: string[];
  hashtags: string[];
  parentId: string | null;
  createdAt: string;
  attachmentRows: Array<{
    id: string;
    fileName: string;
    fileType: string;
    fileSizeBytes: string;
  }>;
};
type ChatUser = { id: string; name: string; role: string };
type Page<T> = { items: T[]; nextCursor: string | null };

type NotificationFilter =
  | "ALL"
  | "UNREAD"
  | "MENTIONS"
  | "APPROVALS"
  | "CHANGES"
  | "ASSIGNMENTS"
  | "REMINDERS";

const NOTIFICATION_FILTERS: Array<{ key: NotificationFilter; label: string }> = [
  { key: "ALL", label: "All" },
  { key: "UNREAD", label: "Unread" },
  { key: "MENTIONS", label: "Mentions" },
  { key: "APPROVALS", label: "Approvals" },
  { key: "CHANGES", label: "Changes" },
  { key: "ASSIGNMENTS", label: "Assignments" },
  { key: "REMINDERS", label: "Reminders" },
];

function matchesFilter(item: NotificationItem, filter: NotificationFilter) {
  switch (filter) {
    case "ALL":
      return true;
    case "UNREAD":
      return !item.isRead;
    case "MENTIONS":
      return item.type === "MENTION";
    case "APPROVALS":
      return ["INTERNAL_REVIEW_REQUESTED", "SUBMITTED_TO_CLIENT", "APPROVED"].includes(item.type);
    case "CHANGES":
      return item.type === "REVISION_REQUESTED";
    case "ASSIGNMENTS":
      return item.type === "ASSIGNMENT";
    default:
      return item.type === "DUE_DATE_REMINDER";
  }
}

/**
 * DM channels carry no name; the API stores the two participants as a sorted
 * `"<idA>:<idB>"` scope. Every direct message was therefore titled the literal
 * words "Direct message", so a list of them was indistinguishable.
 */
function channelTitle(channel: Channel, users: ChatUser[], myUserId: string) {
  if (channel.name) return channel.name;
  if (channel.scopeType !== "DM") return "Untitled channel";
  const otherId = (channel.scopeId ?? "").split(":").find((id) => id && id !== myUserId);
  const other = users.find((user) => user.id === otherId);
  return other ? other.name : "Direct message";
}

const SCOPE_LABEL: Record<Channel["scopeType"], string> = {
  DM: "Direct message",
  PROJECT: "Project channel",
  DELIVERABLE: "Deliverable channel",
};

function applicationServerKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

function NotificationPanel() {
  const status = useStatus();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<NotificationFilter>("ALL");
  const notifications = useInfiniteQuery({
    queryKey: ["notifications"],
    queryFn: ({ pageParam }) =>
      request<Page<NotificationItem>>(
        `/api/notifications?limit=30${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
      ),
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    refetchInterval: status === "connected" ? false : 30_000,
  });
  useEventListener(({ event }) => {
    if (event.type === "NOTIFICATION") {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }
  });
  const readAll = useMutation({
    mutationFn: () => request("/api/notifications/read-all", { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const notificationItems = useMemo(
    () => notifications.data?.pages.flatMap((page) => page.items) ?? [],
    [notifications.data?.pages],
  );
  const visible = useMemo(
    () => notificationItems.filter((item) => matchesFilter(item, filter)),
    [filter, notificationItems],
  );
  return (
    <section className="panel notification-inbox">
      <div className="panel__heading">
        <div>
          <span className="rx-eyebrow">Latest signal</span>
          <h2>{notificationItems.filter((item) => !item.isRead).length} unread</h2>
        </div>
        <div>
          <span className="live-indicator" data-connected={status === "connected"}>
            <span /> {status === "connected" ? "Live" : "Fallback polling"}
          </span>
          <button type="button" onClick={() => readAll.mutate()}>
            <CheckCheck size={14} /> Mark all read
          </button>
        </div>
      </div>
      <div className="notification-filters">
        {NOTIFICATION_FILTERS.map((item) => {
          const count = notificationItems.filter((row) => matchesFilter(row, item.key)).length;
          return (
            <button
              type="button"
              key={item.key}
              data-active={filter === item.key}
              onClick={() => setFilter(item.key)}
            >
              {item.label}
              {count ? <b>{count}</b> : null}
            </button>
          );
        })}
      </div>
      <div>
        {visible.map((item) => (
          <a href={item.url ?? "#"} key={item.id} data-read={item.isRead}>
            <span className="notification-type">
              <Bell size={14} />
            </span>
            <div>
              <strong>{item.title}</strong>
              <p>{item.message}</p>
            </div>
            <time
              className="rx-mono"
              dateTime={item.createdAt}
              title={formatAbsoluteTime(item.createdAt)}
            >
              {formatRelativeTime(item.createdAt)}
            </time>
          </a>
        ))}
        {!visible.length ? (
          <p className="notification-empty">No notifications in this filter.</p>
        ) : null}
        {notifications.hasNextPage ? (
          <button
            type="button"
            className="pagination-action"
            disabled={notifications.isFetchingNextPage}
            onClick={() => notifications.fetchNextPage()}
          >
            {notifications.isFetchingNextPage ? "Loading…" : "Load earlier notifications"}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function ChatParticipants() {
  const others = useOthers();
  if (!others.length) return <span className="chat-participants">Only you are here</span>;
  return (
    <span className="chat-participants" title={others.map((other) => other.info.name).join(", ")}>
      {others.slice(0, 3).map((other) => (
        <i
          key={other.connectionId}
          role="img"
          style={{ background: other.info.color }}
          aria-label={`${other.info.name} is here`}
        />
      ))}
      {others.length} here
    </span>
  );
}

function ChatPanel({ channel, users }: { channel: Channel; users: ChatUser[] }) {
  const queryClient = useQueryClient();
  const status = useStatus();
  const others = useOthers();
  const [, updatePresence] = useMyPresence();
  const session = authClient.useSession();
  const myUserId = session.data?.user.id ?? "";
  const [message, setMessage] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [refVersionIds, setRefVersionIds] = useState<string[]>([]);
  const [mentionUserIds, setMentionUserIds] = useState<string[]>([]);
  const [attachmentIds, setAttachmentIds] = useState<Array<{ id: string; name: string }>>([]);
  const [attachmentPending, setAttachmentPending] = useState(false);
  const [messageSearch, setMessageSearch] = useState("");
  const attachmentInput = useRef<HTMLInputElement>(null);
  const versions = useQuery({
    queryKey: ["chat-versions", channel.scopeId],
    queryFn: () => request<FileVersionView[]>(`/api/file-versions/deliverable/${channel.scopeId}`),
    enabled: channel.scopeType === "DELIVERABLE" && Boolean(channel.scopeId),
  });
  const messages = useInfiniteQuery({
    queryKey: ["channel-messages", channel.id, messageSearch],
    queryFn: ({ pageParam }) =>
      request<Page<Message>>(
        `/api/collaboration/channels/${channel.id}/messages${
          messageSearch || pageParam
            ? `?${new URLSearchParams({
                ...(messageSearch ? { search: messageSearch } : {}),
                ...(pageParam ? { cursor: pageParam } : {}),
                limit: "40",
              })}`
            : "?limit=40"
        }`,
      ),
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    refetchInterval: status === "connected" ? false : 15_000,
  });
  useLiveRoomEvents(
    (event) => {
      if (event.type !== "MESSAGE_ADDED" || event.channelId !== channel.id) return false;
      queryClient.setQueryData<InfiniteData<Page<Message>, string>>(
        ["channel-messages", channel.id, messageSearch],
        (current) => {
          if (
            !current ||
            current.pages.some((page) => page.items.some((item) => item.id === event.message.id))
          ) {
            return current;
          }
          const [latest, ...rest] = current.pages;
          if (!latest) return current;
          return {
            ...current,
            pages: [{ ...latest, items: [...latest.items, event.message as Message] }, ...rest],
          };
        },
      );
      return true;
    },
    [["channel-messages", channel.id, messageSearch]],
  );
  const post = useMutation({
    mutationFn: () =>
      request<Message>(`/api/collaboration/channels/${channel.id}/messages`, {
        method: "POST",
        body: JSON.stringify({
          body: message,
          parentId: threadId ?? undefined,
          refVersionIds,
          mentionUserIds,
          attachmentIds: attachmentIds.map((attachment) => attachment.id),
        }),
      }),
    onSuccess: async (created) => {
      const hydrated: Message = {
        ...created,
        authorName: session.data?.user.name ?? "You",
        attachmentRows: attachmentIds.map((attachment) => ({
          id: attachment.id,
          fileName: attachment.name,
          fileType: "",
          fileSizeBytes: "0",
        })),
      };
      setMessage("");
      setRefVersionIds([]);
      setMentionUserIds([]);
      setAttachmentIds([]);
      updatePresence({ isTyping: false });
      broadcastRoomEvent(`chat:${channel.id}`, {
        type: "MESSAGE_ADDED",
        channelId: channel.id,
        message: hydrated,
      });
      await queryClient.invalidateQueries({
        queryKey: ["channel-messages", channel.id, messageSearch],
      });
      broadcastInvalidation({
        room: `chat:${channel.id}`,
        queryKeys: [["channel-messages", channel.id, messageSearch]],
      });
    },
  });
  const messageItems = useMemo(
    () => [...(messages.data?.pages ?? [])].reverse().flatMap((page) => page.items),
    [messages.data?.pages],
  );
  const parentMessages = messageItems.filter((item) => !item.parentId);
  const replies = messageItems.filter((item) => item.parentId);
  const thread = parentMessages.find((item) => item.id === threadId);

  useEffect(() => {
    const timer = window.setTimeout(
      () => updatePresence({ isTyping: Boolean(message.trim()) }),
      180,
    );
    return () => window.clearTimeout(timer);
  }, [message, updatePresence]);
  useEffect(() => {
    const last = messageItems.at(-1);
    if (last) {
      void request(`/api/collaboration/channels/${channel.id}/read`, {
        method: "POST",
        body: JSON.stringify({ messageId: last.id }),
      });
    }
  }, [channel.id, messageItems]);

  function renderMessage(item: Message) {
    const replyCount = replies.filter((reply) => reply.parentId === item.id).length;
    return (
      <article
        key={item.id}
        className="chat-message"
        data-mine={item.userId === myUserId || undefined}
      >
        <header>
          <strong>{item.authorName}</strong>
          <time dateTime={item.createdAt} title={formatAbsoluteTime(item.createdAt)}>
            {formatRelativeTime(item.createdAt)}
          </time>
        </header>
        <p>{item.body}</p>
        {item.refVersionIds.length ? (
          <div className="message-version-chips">
            {item.refVersionIds.map((id) => {
              const version = versions.data?.find((candidate) => candidate.id === id);
              return (
                <span key={id}>
                  <Link2 size={11} /> {version?.displayVersion ?? "Referenced version"}
                </span>
              );
            })}
          </div>
        ) : null}
        {item.attachmentRows?.map((attachment) => (
          <button
            type="button"
            className="message-attachment"
            key={attachment.id}
            onClick={async () => {
              const asset = await request<{ url: string }>(
                `/api/attachments/${attachment.id}/download`,
              );
              window.open(asset.url, "_blank", "noopener,noreferrer");
            }}
          >
            <FileText size={12} /> {attachment.fileName}
          </button>
        ))}
        {item.parentId ? null : (
          <button
            type="button"
            className="rx-action message-reply"
            onClick={() => setThreadId(item.id)}
          >
            <MessageCircle size={12} aria-hidden="true" />
            {replyCount ? `${replyCount} ${replyCount === 1 ? "reply" : "replies"}` : "Reply"}
          </button>
        )}
      </article>
    );
  }

  return (
    <section className="panel production-chat">
      <div className="panel__heading">
        <div>
          <span className="rx-eyebrow">{SCOPE_LABEL[channel.scopeType]}</span>
          <h2>{channelTitle(channel, users, myUserId)}</h2>
        </div>
        <div>
          <ChatParticipants />
          <span className="live-indicator" data-connected={status === "connected"}>
            <span /> {status === "connected" ? "Live" : "Fallback polling"}
          </span>
        </div>
      </div>
      <label className="chat-search">
        <Search size={13} />
        <input
          value={messageSearch}
          onChange={(event) => setMessageSearch(event.target.value)}
          placeholder="Search this channel"
        />
      </label>
      <div className="chat-feed">
        {messages.hasNextPage ? (
          <button
            type="button"
            className="pagination-action"
            disabled={messages.isFetchingNextPage}
            onClick={() => messages.fetchNextPage()}
          >
            {messages.isFetchingNextPage ? "Loading…" : "Load older messages"}
          </button>
        ) : null}
        {parentMessages.map(renderMessage)}
      </div>
      <TypingIndicator />
      <div className="chat-composer">
        {thread ? (
          <p className="chat-composer__replying">
            Replying to <strong>{thread.authorName}</strong>
            <button type="button" onClick={() => setThreadId(null)}>
              <X size={12} aria-hidden="true" /> Cancel
            </button>
          </p>
        ) : null}
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={thread ? `Reply to ${thread.authorName}…` : "Write to this channel…"}
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes("application/x-rexops-version")) {
              event.preventDefault();
            }
          }}
          onDrop={(event) => {
            const versionId = event.dataTransfer.getData("application/x-rexops-version");
            if (!versionId) return;
            event.preventDefault();
            setRefVersionIds((ids) => [...new Set([...ids, versionId])]);
          }}
        />
        <VersionChips
          versions={versions.data ?? []}
          selectedIds={refVersionIds}
          onRemove={(id) => setRefVersionIds((ids) => ids.filter((value) => value !== id))}
        />
        {attachmentIds.map((attachment) => (
          <span className="attachment-chip" key={attachment.id}>
            <Paperclip size={11} /> {attachment.name}
          </span>
        ))}
        <div className="chat-composer__toolbar">
          <div>
            {versions.data?.length ? (
              <VersionPicker
                versions={versions.data}
                selectedIds={refVersionIds}
                onChange={setRefVersionIds}
              />
            ) : null}
            <button type="button" onClick={() => attachmentInput.current?.click()}>
              <Paperclip size={13} /> Attach
            </button>
            <input
              ref={attachmentInput}
              hidden
              type="file"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setAttachmentPending(true);
                try {
                  const id = await uploadAttachment(file);
                  setAttachmentIds((items) => [...items, { id, name: file.name }]);
                } finally {
                  setAttachmentPending(false);
                }
              }}
            />
            <Select
              aria-label="Mention a teammate"
              placeholder="@ mention"
              size="sm"
              value=""
              options={users.map((user) => ({
                value: user.id,
                label: user.name,
                hint: user.role,
              }))}
              onChange={(value) => {
                const user = users.find((candidate) => candidate.id === value);
                if (!user) return;
                setMentionUserIds((ids) => [...new Set([...ids, user.id])]);
                setMessage((current) => `${current}@${user.name.replaceAll(" ", "")} `);
              }}
            />
          </div>
          <Button
            disabled={!message.trim() || post.isPending || attachmentPending}
            onClick={() => post.mutate()}
          >
            {post.isPending || attachmentPending ? (
              <LoaderCircle className="spin" size={15} />
            ) : (
              <Send size={15} />
            )}{" "}
            Send
          </Button>
        </div>
      </div>
      {thread ? (
        <aside className="chat-thread-panel">
          <header>
            <button type="button" onClick={() => setThreadId(null)}>
              <ChevronLeft size={14} />
            </button>
            <div>
              <span className="rx-eyebrow">Thread</span>
              <strong>{thread.authorName}</strong>
            </div>
            <button type="button" onClick={() => setThreadId(null)}>
              <X size={14} />
            </button>
          </header>
          {renderMessage(thread)}
          {replies.filter((reply) => reply.parentId === thread.id).map(renderMessage)}
        </aside>
      ) : null}
      <span hidden>{others.length}</span>
    </section>
  );
}

export function InboxPage() {
  const queryClient = useQueryClient();
  const session = authClient.useSession();
  const [tab, setTab] = useState<"notifications" | "chat">("notifications");
  const [channelId, setChannelId] = useState("");
  const [search, setSearch] = useState("");
  const [dmUserId, setDmUserId] = useState("");
  const channels = useInfiniteQuery({
    queryKey: ["channels", search],
    queryFn: ({ pageParam }) =>
      request<Page<Channel>>(
        `/api/collaboration/channels?${new URLSearchParams({
          ...(search ? { search } : {}),
          ...(pageParam ? { cursor: pageParam } : {}),
          limit: "30",
        })}`,
      ),
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: tab === "chat",
  });
  const users = useQuery({
    queryKey: ["chat-users"],
    queryFn: () => request<ChatUser[]>("/api/collaboration/users"),
    enabled: tab === "chat",
  });
  const createDm = useMutation({
    mutationFn: () =>
      request<Channel>("/api/collaboration/channels", {
        method: "POST",
        body: JSON.stringify({ scopeType: "DM", scopeId: dmUserId }),
      }),
    onSuccess: async (channel) => {
      setChannelId(channel.id);
      setDmUserId("");
      await queryClient.invalidateQueries({ queryKey: ["channels"] });
    },
  });
  const enablePush = useMutation({
    mutationFn: async () => {
      const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if (!publicKey) throw new Error("VAPID is not configured for this environment.");
      const registration = await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Notification permission was not granted.");
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(publicKey),
      });
      const serialized = subscription.toJSON();
      return request("/api/notifications/push-subscriptions", {
        method: "POST",
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          keys: serialized.keys,
          userAgent: navigator.userAgent,
        }),
      });
    },
  });
  const channelItems = channels.data?.pages.flatMap((page) => page.items) ?? [];
  const selected = channelItems.find((channel) => channel.id === channelId) ?? channelItems[0];

  return (
    <AgencyShell>
      <PageHeader
        eyebrow="Everything addressed to you"
        title="Inbox"
        purpose="Anything that needs you personally: decisions you have been asked for, mentions of your name, due-date reminders, and the day-to-day conversation about the work."
        help={
          <>
            <p>
              Notifications are generated by the app — somebody sent you work to approve, mentioned
              you in a comment, or a deadline moved.
            </p>
            <p>
              Production chat is for talking to your own team. Clients never see these channels.
            </p>
          </>
        }
        secondary={
          <Button
            variant="secondary"
            disabled={enablePush.isPending}
            onClick={() => enablePush.mutate()}
          >
            <BellRing size={15} />
            {enablePush.isPending
              ? "Asking your browser…"
              : enablePush.isSuccess
                ? "Desktop alerts are on"
                : "Get alerts on this device"}
          </Button>
        }
        status={
          enablePush.isError ? (
            <SaveState
              state="error"
              error={`Alerts could not be switched on. ${(enablePush.error as Error).message}`}
            />
          ) : null
        }
      />
      <div className="inbox-tabs">
        <button
          type="button"
          aria-pressed={tab === "notifications"}
          data-active={tab === "notifications"}
          onClick={() => setTab("notifications")}
        >
          <Bell size={15} /> Things that need you
        </button>
        <button
          type="button"
          aria-pressed={tab === "chat"}
          data-active={tab === "chat"}
          onClick={() => setTab("chat")}
        >
          <MessageCircle size={15} /> Team chat
        </button>
      </div>
      {tab === "notifications" ? (
        session.data?.user.id ? (
          <RealtimeRoom id={`user:${session.data.user.id}`}>
            <NotificationPanel />
          </RealtimeRoom>
        ) : (
          // NotificationPanel calls useStatus/useEventListener, so it must never render
          // outside a RoomProvider — doing so while the session was still loading threw
          // and took the whole page down.
          <section className="panel">
            <Skeleton lines={4} label="Loading your notifications" />
          </section>
        )
      ) : (
        <div className="chat-workspace">
          <aside className="panel channel-switcher">
            <label>
              <Search size={14} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search channels"
              />
            </label>
            <div>
              {channelItems.map((channel) => (
                <button
                  type="button"
                  key={channel.id}
                  className="channel-row"
                  data-active={selected?.id === channel.id}
                  onClick={() => setChannelId(channel.id)}
                >
                  {channel.scopeType === "DM" ? <Users size={14} /> : <MessageCircle size={14} />}
                  <span>
                    {channelTitle(channel, users.data ?? [], session.data?.user.id ?? "")}
                  </span>
                  {channel.unreadCount ? <b>{channel.unreadCount}</b> : null}
                </button>
              ))}
              {channels.hasNextPage ? (
                <button
                  type="button"
                  className="pagination-action"
                  disabled={channels.isFetchingNextPage}
                  onClick={() => channels.fetchNextPage()}
                >
                  {channels.isFetchingNextPage ? "Loading…" : "Load more channels"}
                </button>
              ) : null}
            </div>
            <div className="channel-switcher__dm">
              <span id="new-dm-label">New direct message</span>
              <Select
                aria-label="New direct message"
                placeholder="Choose a teammate"
                value={dmUserId}
                options={(users.data ?? []).map((user) => ({
                  value: user.id,
                  label: user.name,
                  hint: user.role,
                }))}
                onChange={setDmUserId}
              />
              <Button disabled={!dmUserId} onClick={() => createDm.mutate()}>
                Start DM
              </Button>
            </div>
          </aside>
          {selected ? (
            <RealtimeRoom id={`chat:${selected.id}`}>
              <ChatPanel channel={selected} users={users.data ?? []} />
            </RealtimeRoom>
          ) : (
            <section className="panel chat-gate">No accessible channels yet.</section>
          )}
        </div>
      )}
      {enablePush.error ? <div className="form-error">{enablePush.error.message}</div> : null}
    </AgencyShell>
  );
}
