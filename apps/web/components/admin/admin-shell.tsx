"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import { useAdminIdleLogout } from "@/hooks/use-admin-idle-logout";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useLenis } from "@/hooks/use-lenis";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { usePathname } from "@/lib/i18n/navigation";
import { AdminContentFrame } from "./admin-content-frame";
import { AdminHeader } from "./admin-header";
import { AdminMobileDrawer } from "./admin-mobile-drawer";
import { AdminSidebar } from "./admin-sidebar";

type AdminShellProps = {
  children: React.ReactNode;
  onNotificationsClick?: () => void;
};

const ADMIN_SIDEBAR_WIDTH = "17.5rem";
const ADMIN_SIDEBAR_COLLAPSED_WIDTH = "6rem";
const ADMIN_SIDEBAR_COLLAPSED_STORAGE_KEY = "admin_sidebar_collapsed";

export function AdminShell({ children, onNotificationsClick }: AdminShellProps) {
  const tAdmin = useTranslations("admin");
  const { user } = useAuthSession();
  const { lenis } = useLenis();
  const pathname = usePathname();
  const prefersReducedMotion = useReducedMotion();
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isDesktopSidebarCollapsed, setIsDesktopSidebarCollapsed] = useState(false);
  const toggleDesktopSidebar = useCallback(() => {
    setIsDesktopSidebarCollapsed((previous) => !previous);
  }, []);
  const desktopSidebarWidth = useMemo(
    () => (isDesktopSidebarCollapsed ? ADMIN_SIDEBAR_COLLAPSED_WIDTH : ADMIN_SIDEBAR_WIDTH),
    [isDesktopSidebarCollapsed]
  );
  const desktopSidebarToggleLabel = isDesktopSidebarCollapsed
    ? tAdmin("sidebar_expand_aria")
    : tAdmin("sidebar_collapse_aria");
  const DesktopSidebarToggleIcon = isDesktopSidebarCollapsed ? ChevronRight : ChevronLeft;

  useAdminIdleLogout({
    onIdleTimeout: () => {
      setIsMobileDrawerOpen(false);
    },
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    setIsDesktopSidebarCollapsed(
      window.localStorage.getItem(ADMIN_SIDEBAR_COLLAPSED_STORAGE_KEY) === "1"
    );
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    window.localStorage.setItem(
      ADMIN_SIDEBAR_COLLAPSED_STORAGE_KEY,
      isDesktopSidebarCollapsed ? "1" : "0"
    );
  }, [isDesktopSidebarCollapsed]);

  useEffect(() => {
    if (!pathname) {
      return;
    }

    setIsMobileDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!lenis || prefersReducedMotion) return;

    if (isMobileDrawerOpen) {
      lenis.stop();
      return () => {
        lenis.start();
      };
    }

    lenis.start();

    return () => {
      lenis.start();
    };
  }, [isMobileDrawerOpen, lenis, prefersReducedMotion]);

  return (
    <div
      className="relative min-h-screen overflow-x-clip bg-[#000000] text-white"
      style={
        {
          "--admin-sidebar-width": desktopSidebarWidth,
        } as CSSProperties
      }
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(58% 42% at 82% 0%, rgba(0,126,255,0.12) 0%, rgba(0,0,0,0) 68%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "96px 96px",
          maskImage:
            "linear-gradient(180deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.25) 48%, transparent 100%)",
        }}
      />

      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:block lg:w-[var(--admin-sidebar-width)] lg:overflow-hidden lg:border-r lg:border-[#1F1F1F] lg:transition-[width] lg:duration-200 lg:ease-out">
        <AdminSidebar
          userRole={user?.role}
          isCollapsed={isDesktopSidebarCollapsed}
          className="h-full"
        />
      </aside>

      <div
        className="pointer-events-none fixed top-24 z-50 hidden lg:block lg:transition-[left] lg:duration-200 lg:ease-out"
        style={{ left: "calc(var(--admin-sidebar-width) - 1rem)" }}
      >
        <button
          type="button"
          aria-pressed={isDesktopSidebarCollapsed}
          aria-label={desktopSidebarToggleLabel}
          title={desktopSidebarToggleLabel}
          onClick={toggleDesktopSidebar}
          className="pointer-events-auto inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#111111] text-white shadow-[0_16px_36px_rgba(0,0,0,0.45)] transition-colors duration-150 hover:border-[#007eff] hover:bg-[#1a1a1a] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
        >
          <DesktopSidebarToggleIcon className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div className="relative z-10 min-h-screen lg:pl-[var(--admin-sidebar-width)] lg:transition-[padding] lg:duration-200 lg:ease-out">
        <div className="flex min-h-screen flex-col">
          <AdminHeader
            onOpenMobileMenu={() => setIsMobileDrawerOpen(true)}
            isMobileMenuOpen={isMobileDrawerOpen}
            onNotificationsClick={onNotificationsClick}
          />

          <main
            id="main-content"
            tabIndex={-1}
            className="relative min-h-[calc(100vh-8rem)] min-w-0 overflow-x-hidden md:min-h-[calc(100vh-8.5rem)] lg:min-h-[calc(100vh-5.5rem)]"
          >
            <AdminContentFrame>{children}</AdminContentFrame>
          </main>
        </div>
      </div>

      <AdminMobileDrawer
        isOpen={isMobileDrawerOpen}
        onClose={() => setIsMobileDrawerOpen(false)}
        userRole={user?.role}
      />
    </div>
  );
}
