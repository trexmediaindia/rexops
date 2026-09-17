import { Liveblocks } from "@liveblocks/node";

let client: Liveblocks | null | undefined;

function liveblocksClient() {
  if (client !== undefined) return client;
  client = process.env.LIVEBLOCKS_SECRET_KEY
    ? new Liveblocks({ secret: process.env.LIVEBLOCKS_SECRET_KEY })
    : null;
  return client;
}

export async function broadcastUserNotification(
  recipientUserId: string,
  preview: { title: string; url: string | null },
) {
  const liveblocks = liveblocksClient();
  if (!liveblocks) return false;
  await liveblocks.broadcastEvent(`user:${recipientUserId}`, {
    type: "NOTIFICATION",
    unreadDelta: 1,
    preview,
  });
  return true;
}
