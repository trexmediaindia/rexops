import { useEventListener, useStatus } from "@liveblocks/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, CheckCheck } from "lucide-react";
import { useState } from "react";
import { authClient } from "../../lib/auth-client";
import { useFeatures } from "../../lib/features";
import { RealtimeRoom } from "../../lib/realtime";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

type NotificationItem = {
  id: string;
  title: string;
  message: string | null;
  url: string | null;
  isRead: boolean;
  createdAt: string;
};

function BellInside({ inboxPath }: { inboxPath: string }) {
  const status = useStatus();
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<{ title: string; url: string | null } | null>(null);
  const notifications = useQuery({
    queryKey: ["notifications", "bell"],
    queryFn: async () => {
      const response = await fetch(`${apiUrl}/api/notifications`, { credentials: "include" });
      if (!response.ok) throw new Error("Notifications unavailable.");
      const body = (await response.json()) as {
        items: NotificationItem[];
        nextCursor: string | null;
      };
      return body.items;
    },
    refetchInterval: status === "connected" ? false : 30_000,
  });
  useEventListener(({ event }) => {
    if (event.type !== "NOTIFICATION") return;
    setToast(event.preview);
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    window.setTimeout(() => setToast(null), 4500);
  });
  const unread = notifications.data?.filter((item) => !item.isRead).length ?? 0;
  return (
    <div className="live-bell" aria-live="polite">
      <Link className="icon-button" aria-label={`${unread} unread notifications`} to={inboxPath}>
        <Bell size={17} />
        {unread ? <span>{unread > 9 ? "9+" : unread}</span> : null}
      </Link>
      {toast ? (
        <a className="live-bell__toast" href={toast.url ?? inboxPath}>
          <strong>{toast.title}</strong>
          <span>Open notification</span>
        </a>
      ) : null}
    </div>
  );
}

export function LiveBell({ inboxPath = "/agency/inbox" }: { inboxPath?: string }) {
  const session = authClient.useSession();
  const features = useFeatures();
  const userId = session.data?.user.id;
  if (!userId) return null;
  if (features.data?.["collaboration.live"] !== true) {
    return <NotificationBell />;
  }
  return (
    <RealtimeRoom id={`user:${userId}`}>
      <BellInside inboxPath={inboxPath} />
    </RealtimeRoom>
  );
}

function timeAgo(value: string) {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/**
 * The bell for deployments without live collaboration: checks for new notifications
 * every 30 seconds (and whenever the tab comes back into focus) and opens a short list.
 * Opening an item marks it read and goes straight to the thing it is about.
 */
function NotificationBell() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const notifications = useQuery({
    queryKey: ["notifications", "bell"],
    queryFn: async () => {
      const response = await fetch(`${apiUrl}/api/notifications`, { credentials: "include" });
      if (!response.ok) throw new Error("Notifications unavailable.");
      const body = (await response.json()) as { items: NotificationItem[] };
      return body.items;
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const post = async (path: string) => {
    await fetch(`${apiUrl}/api/notifications${path}`, { method: "POST", credentials: "include" });
    await queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };
  const items = (notifications.data ?? []).slice(0, 12);
  const unread = (notifications.data ?? []).filter((item) => !item.isRead).length;

  return (
    <div className="live-bell notification-bell">
      <button
        type="button"
        className="icon-button"
        aria-label={unread ? `${unread} new notifications` : "Notifications"}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Bell size={17} />
        {unread ? <span>{unread > 9 ? "9+" : unread}</span> : null}
      </button>
      {open ? (
        <>
          <button
            type="button"
            className="notification-bell__backdrop"
            aria-label="Close notifications"
            onClick={() => setOpen(false)}
          />
          <div className="notification-bell__panel" role="dialog" aria-label="Notifications">
            <header>
              <strong>Notifications</strong>
              {unread ? (
                <button type="button" onClick={() => void post("/read-all")}>
                  <CheckCheck size={14} /> Mark all read
                </button>
              ) : null}
            </header>
            {items.length ? (
              <ul>
                {items.map((item) => (
                  <li key={item.id} data-unread={!item.isRead || undefined}>
                    <button
                      type="button"
                      onClick={async () => {
                        setOpen(false);
                        if (!item.isRead) void post(`/${item.id}/read`);
                        if (item.url) {
                          if (item.url.startsWith("/")) await navigate({ to: item.url });
                          else window.location.href = item.url;
                        }
                      }}
                    >
                      <strong>{item.title}</strong>
                      {item.message ? <span>{item.message}</span> : null}
                      <small>{timeAgo(item.createdAt)}</small>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="notification-bell__empty">
                {notifications.isLoading ? "Loading…" : "You're all caught up."}
              </p>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
