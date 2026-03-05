"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

type AuthSessionUser = {
  id: string;
  email: string;
  role: string;
};

type AuthSessionResponse = {
  user: AuthSessionUser;
};

const AUTH_SESSION_QUERY_KEY = ["auth", "session"] as const;
const SESSION_HEALTHCHECK_INTERVAL_MS = 5 * 60 * 1000;

function getApiV1BaseUrl() {
  const base = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/+$/, "");

  if (base.endsWith("/api/v1")) return base;
  if (base.endsWith("/api")) return `${base}/v1`;
  return `${base}/api/v1`;
}

async function fetchAuthSession(): Promise<AuthSessionUser | null> {
  const meUrl = `${getApiV1BaseUrl()}/auth/me`;
  const refreshUrl = `${getApiV1BaseUrl()}/auth/refresh`;

  let response = await fetch(meUrl, {
    method: "GET",
    credentials: "include",
  });

  // Access token may be expired. Try refresh once, then retry /auth/me.
  if (response.status === 401) {
    const refreshResponse = await fetch(refreshUrl, {
      method: "POST",
      credentials: "include",
    });

    if (refreshResponse.ok) {
      response = await fetch(meUrl, {
        method: "GET",
        credentials: "include",
      });
    }
  }

  if (response.status === 401) return null;
  if (!response.ok) throw new Error("Unable to resolve auth session");

  const payload = (await response.json()) as AuthSessionResponse;
  return payload.user ?? null;
}

async function logoutSession(): Promise<void> {
  const logoutUrl = `${getApiV1BaseUrl()}/auth/logout`;
  const refreshUrl = `${getApiV1BaseUrl()}/auth/refresh`;

  let response = await fetch(logoutUrl, {
    method: "POST",
    credentials: "include",
  });

  // Access token may be expired. Try refresh once, then retry logout.
  if (response.status === 401) {
    const refreshResponse = await fetch(refreshUrl, {
      method: "POST",
      credentials: "include",
    });

    if (refreshResponse.ok) {
      response = await fetch(logoutUrl, {
        method: "POST",
        credentials: "include",
      });
    }
  }

  // If still unauthorized, treat as already logged out.
  if (response.status === 401) return;
  if (!response.ok) throw new Error("Unable to log out");
}

export function useAuthSession() {
  const queryClient = useQueryClient();

  const sessionQuery = useQuery({
    queryKey: AUTH_SESSION_QUERY_KEY,
    queryFn: fetchAuthSession,
    retry: false,
    staleTime: 30_000,
    refetchInterval: SESSION_HEALTHCHECK_INTERVAL_MS,
    refetchIntervalInBackground: true,
  });

  const logoutMutation = useMutation({
    mutationFn: logoutSession,
    onSuccess: () => {
      queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, null);
    },
  });

  return {
    user: sessionQuery.data ?? null,
    isAuthenticated: Boolean(sessionQuery.data),
    isLoading: sessionQuery.isLoading,
    isFetching: sessionQuery.isFetching,
    refetch: sessionQuery.refetch,
    logout: logoutMutation.mutateAsync,
    isLoggingOut: logoutMutation.isPending,
  };
}
