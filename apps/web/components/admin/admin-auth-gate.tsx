"use client";

import { isAdminRole } from "@bookprinta/shared";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useAuthSession } from "@/hooks/use-auth-session";
import { usePathname, useRouter } from "@/lib/i18n/navigation";
import { canAdminAccessPath, getDefaultAdminHref } from "./admin-navigation";

type AdminAuthGateProps = {
  children: React.ReactNode;
};

export function AdminAuthGate({ children }: AdminAuthGateProps) {
  const tAdmin = useTranslations("admin");
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, isLoading, isFetching, refetch } = useAuthSession();
  const [hasRetriedSession, setHasRetriedSession] = useState(false);
  const resolvedPathname = pathname || getDefaultAdminHref(user?.role);
  const isSessionPending = isLoading || (!isAuthenticated && isFetching);
  const hasAdminRole = isAuthenticated && isAdminRole(user?.role);
  const hasRouteAccess = hasAdminRole && canAdminAccessPath(user?.role, resolvedPathname);

  useEffect(() => {
    if (isSessionPending || isAuthenticated || hasRetriedSession) return;

    setHasRetriedSession(true);
    void refetch();
  }, [hasRetriedSession, isAuthenticated, isSessionPending, refetch]);

  useEffect(() => {
    if (isSessionPending) return;
    if (!isAuthenticated && !hasRetriedSession) return;
    if (!isAuthenticated || !isAdminRole(user?.role)) {
      const nextPath = resolvedPathname || "/admin";
      router.replace(`/login?next=${encodeURIComponent(nextPath)}`);
      return;
    }

    if (!canAdminAccessPath(user.role, resolvedPathname)) {
      router.replace(getDefaultAdminHref(user.role));
    }
  }, [hasRetriedSession, isAuthenticated, isSessionPending, resolvedPathname, router, user?.role]);

  if (isSessionPending || !hasRouteAccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4 text-center text-white">
        <p className="font-sans text-sm font-medium tracking-wide text-[#ededed]">
          {tAdmin("loading")}
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
