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
          if (!response.ok) throw new Error("Realtime authorization failed.");
          return response.json();
        }}
      >
        <RouterProvider router={router} />
      </LiveblocksProvider>
    </QueryClientProvider>
  );
}
