import { QueryClient } from "@tanstack/react-query";
import { RequestError } from "./request";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      /*
       * Don't retry a refusal. A 403 was being retried three times with backoff,
       * so a screen the signed-in user simply cannot see sat on "Loading…" for
       * seven seconds before admitting anything was wrong. Server errors and
       * network blips still get the default retries.
       */
      retry: (failureCount, error) => {
        const status = error instanceof RequestError ? error.status : undefined;
        if (status && status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});
