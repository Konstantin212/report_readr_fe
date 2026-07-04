"use client";

import { QueryClient, QueryClientProvider, isServer } from "@tanstack/react-query";

/**
 * App-wide React Query provider. The client is created once per browser
 * session and persists across client-side navigations (the (app) layout is
 * never unmounted), so data fetched on one page is cached for the next —
 * positions → tax → positions serves from cache within `staleTime` instead
 * of re-hitting the DB. A fresh client is made per request on the server so
 * requests never share cache.
 */
function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Data is user-scoped financial state that changes only on upload /
        // sync / cron — a minute of staleness is invisible and kills the
        // redundant refetch-on-every-navigation.
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient(): QueryClient {
  if (isServer) return makeQueryClient();
  return (browserQueryClient ??= makeQueryClient());
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>;
}
