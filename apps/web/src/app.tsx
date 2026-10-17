import { LiveblocksProvider } from "@liveblocks/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { queryClient } from "./lib/query";
import "./lib/liveblocks.config";
import { router } from "./router";

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LiveblocksProvider
        authEndpoint={async (room) => {
          const response = await fetch(
            import.meta.env.VITE_LIVEBLOCKS_AUTH_URL ?? "http://localhost:3000/api/liveblocks-auth",
            {
              method: "POST",
              credentials: "include",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ room }),
            },
          );
          // 404: live collaboration is switched off on this install (no Liveblocks key).
          // Answering "forbidden" makes the client give up on the room instead of retrying.
          if (response.status === 404) {
            return { error: "forbidden" as const, reason: "Live collaboration is switched off." };
          }
          if (!response.ok) throw new Error("Realtime authorization failed.");
          const body = await response.json();
          // Without LIVEBLOCKS_SECRET_KEY the API answers with a local `dev:` stub that
          // Liveblocks' servers reject. Tell the client to stop trying this room instead of
          // retrying with a token that can never work; everything else keeps working.
          if (body?.development === true) {
            return {
              error: "forbidden" as const,
              reason: "Live presence is off: LIVEBLOCKS_SECRET_KEY is not set on the API.",
            };
          }
          return body;
        }}
      >
        <RouterProvider router={router} />
      </LiveblocksProvider>
    </QueryClientProvider>
  );
}
