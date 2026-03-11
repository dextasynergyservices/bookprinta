"use client";

import { isAdminRole } from "@bookprinta/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useRouter } from "@/lib/i18n/navigation";
import { adminNotificationsQueryKeys } from "./use-admin-notifications";
import { AUTH_SESSION_QUERY_KEY, useAuthSession } from "./use-auth-session";

export const ADMIN_IDLE_TIMEOUT_MS = 60 * 60 * 1000;

type UseAdminIdleLogoutOptions = {
  onIdleTimeout?: () => void | Promise<void>;
};

export function useAdminIdleLogout({ onIdleTimeout }: UseAdminIdleLogoutOptions = {}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { user, isAuthenticated, isLoggingOut, logout } = useAuthSession();
  const idleTimerRef = useRef<number | null>(null);
  const logoutInFlightRef = useRef(false);
  const onIdleTimeoutRef = useRef(onIdleTimeout);
  const logoutRef = useRef(logout);
  const isEnabled = isAuthenticated && isAdminRole(user?.role) && !isLoggingOut;

  useEffect(() => {
    onIdleTimeoutRef.current = onIdleTimeout;
  }, [onIdleTimeout]);

  useEffect(() => {
    logoutRef.current = logout;
  }, [logout]);

  useEffect(() => {
    const clearIdleTimer = () => {
      if (idleTimerRef.current !== null) {
        window.clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };

    if (!isEnabled) {
      clearIdleTimer();
      logoutInFlightRef.current = false;
      return;
    }

    const handleTimeout = async () => {
      if (logoutInFlightRef.current) {
        return;
      }

      logoutInFlightRef.current = true;

      try {
        await onIdleTimeoutRef.current?.();
      } catch {
        // Transient UI cleanup should never block forced logout.
      }

      try {
        await logoutRef.current();
      } catch {
        // Redirect proceeds even if the network request fails.
      } finally {
        await queryClient.cancelQueries({ queryKey: AUTH_SESSION_QUERY_KEY });
        await queryClient.cancelQueries({ queryKey: adminNotificationsQueryKeys.all });
        queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, null);
        queryClient.removeQueries({ queryKey: adminNotificationsQueryKeys.all });
        router.replace("/login");
      }
    };

    const resetIdleTimer = () => {
      if (logoutInFlightRef.current) {
        return;
      }

      clearIdleTimer();
      idleTimerRef.current = window.setTimeout(() => {
        void handleTimeout();
      }, ADMIN_IDLE_TIMEOUT_MS);
    };

    resetIdleTimer();

    window.addEventListener("mousemove", resetIdleTimer);
    window.addEventListener("keydown", resetIdleTimer);
    window.addEventListener("touchstart", resetIdleTimer);

    return () => {
      clearIdleTimer();
      window.removeEventListener("mousemove", resetIdleTimer);
      window.removeEventListener("keydown", resetIdleTimer);
      window.removeEventListener("touchstart", resetIdleTimer);
    };
  }, [isEnabled, queryClient, router]);
}
