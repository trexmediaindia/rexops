import { useEventListener, useStatus } from "@liveblocks/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
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
  if (!userId || features.data?.["collaboration.live"] !== true) {
    return (
      <Link className="icon-button" aria-label="Notifications" to={inboxPath}>
        <Bell size={17} />
      </Link>
    );
  }
  return (
    <RealtimeRoom id={`user:${userId}`}>
      <BellInside inboxPath={inboxPath} />
    </RealtimeRoom>
  );
}
