"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useAuthSession } from "@/hooks/use-auth-session";
import { AUTH_FALLBACK_ROUTES, buildLoginRedirect } from "@/lib/auth/redirect-policy";
import { usePathname, useRouter } from "@/lib/i18n/navigation";

type DashboardAuthGateProps = {
  children: React.ReactNode;
};

export function DashboardAuthGate({ children }: DashboardAuthGateProps) {
  const tDashboard = useTranslations("dashboard");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading, isFetching, refetch } = useAuthSession();
  const [hasRetriedSession, setHasRetriedSession] = useState(false);

  useEffect(() => {
    if (isLoading || isFetching || isAuthenticated || hasRetriedSession) return;

    setHasRetriedSession(true);
    void refetch();
  }, [hasRetriedSession, isAuthenticated, isFetching, isLoading, refetch]);

  useEffect(() => {
    if (isLoading || isFetching || isAuthenticated || !hasRetriedSession) return;

    const nextPathname = pathname || AUTH_FALLBACK_ROUTES.user;
    const query = searchParams.toString();
    const nextPath = query ? `${nextPathname}?${query}` : nextPathname;
    router.replace(buildLoginRedirect(nextPath));
  }, [hasRetriedSession, isAuthenticated, isFetching, isLoading, pathname, router, searchParams]);

  if (!isAuthenticated || isLoading || isFetching) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4 text-center text-white">
        <p className="font-sans text-sm font-medium tracking-wide text-[#ededed]">
          {tDashboard("loading")}
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
