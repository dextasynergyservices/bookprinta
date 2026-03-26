"use client";

import type { AuthSessionResponse, AuthSessionUser } from "@bookprinta/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import posthog from "posthog-js";
import { useEffect, useRef } from "react";

export const AUTH_SESSION_QUERY_KEY = ["auth", "session"] as const;
const SESSION_HEALTHCHECK_INTERVAL_MS = 5 * 60 * 1000;

function getApiV1BaseUrl() {
  // Client-side: use same-origin path (proxied by Vercel rewrites to Render).
  // This makes auth cookies first-party, avoiding cross-origin cookie issues.
  if (typeof window !== "undefined") return "/api/v1";

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

  if (response.status === 401) {
    // Session is truly dead (both access and refresh tokens expired).
    // Clear the session marker so proxy.ts redirects to login on next navigation.
    const { clearSessionMarkerCookie } = await import("@/lib/auth/session-cookie");
    clearSessionMarkerCookie();
    return null;
  }
  if (!response.ok) throw new Error("Unable to resolve auth session");

  const payload = (await response.json()) as AuthSessionResponse;
  return payload.user ?? null;
}

async function logoutSession(): Promise<void> {
  // Clear the frontend session marker cookie (used by proxy.ts for route protection)
  const { clearSessionMarkerCookie } = await import("@/lib/auth/session-cookie");
  clearSessionMarkerCookie();

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
      if (typeof window !== "undefined" && posthog.__loaded) {
        posthog.reset();
      }
    },
  });

  // Identify / reset PostHog user when session changes
  const prevUserIdRef = useRef<string | null>(null);
  const user = sessionQuery.data ?? null;

  useEffect(() => {
    if (typeof window === "undefined" || !posthog.__loaded) return;

    const currentId = user?.id ?? null;
    if (currentId === prevUserIdRef.current) return;
    prevUserIdRef.current = currentId;

    if (user) {
      posthog.identify(user.id, {
        email: user.email,
        name: user.displayName,
        role: user.role,
      });
    } else {
      posthog.reset();
    }
  }, [user]);

  return {
    user,
    isAuthenticated: Boolean(sessionQuery.data),
    isLoading: sessionQuery.isLoading,
    isFetching: sessionQuery.isFetching,
    refetch: sessionQuery.refetch,
    logout: logoutMutation.mutateAsync,
    isLoggingOut: logoutMutation.isPending,
  };
}
