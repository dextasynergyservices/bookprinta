"use client";

import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import { useLenis } from "@/hooks/use-lenis";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";
import { DashboardContentFrame } from "./dashboard-content-frame";
import { DashboardHeader } from "./dashboard-header";
import { DashboardMobileDrawer } from "./dashboard-mobile-drawer";
import { DashboardSidebar } from "./dashboard-sidebar";

type DashboardShellProps = {
  children: React.ReactNode;
};

const DASHBOARD_SIDEBAR_COLLAPSED_STORAGE_KEY = "dashboard_sidebar_collapsed";

export function DashboardShell({ children }: DashboardShellProps) {
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isDesktopSidebarCollapsed, setIsDesktopSidebarCollapsed] = useState(false);
  const { lenis } = useLenis();
  const prefersReducedMotion = useReducedMotion();
  const toggleDesktopSidebar = useCallback(() => {
    setIsDesktopSidebarCollapsed((previous) => !previous);
  }, []);
  const desktopSidebarWidth = useMemo(
    () => (isDesktopSidebarCollapsed ? "6rem" : "18rem"),
    [isDesktopSidebarCollapsed]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(DASHBOARD_SIDEBAR_COLLAPSED_STORAGE_KEY);
    setIsDesktopSidebarCollapsed(stored === "1");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      DASHBOARD_SIDEBAR_COLLAPSED_STORAGE_KEY,
      isDesktopSidebarCollapsed ? "1" : "0"
    );
  }, [isDesktopSidebarCollapsed]);

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
          "--dashboard-sidebar-width": desktopSidebarWidth,
        } as CSSProperties
      }
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(58% 42% at 18% 0%, rgba(0,126,255,0.10) 0%, rgba(0,0,0,0) 68%)",
        }}
      />

      <aside
        className={cn(
          "hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:block lg:w-[var(--dashboard-sidebar-width)] lg:overflow-hidden lg:border-r lg:border-[#2A2A2A] lg:transition-[width] lg:duration-200 lg:ease-out"
        )}
        data-collapsed={isDesktopSidebarCollapsed ? "true" : "false"}
      >
        <DashboardSidebar
          isCollapsed={isDesktopSidebarCollapsed}
          onToggleCollapse={toggleDesktopSidebar}
        />
      </aside>

      <div
        className={cn(
          "relative z-10 min-h-screen lg:pl-[var(--dashboard-sidebar-width)] lg:transition-[padding] lg:duration-200 lg:ease-out"
        )}
      >
        <div className="flex min-h-screen flex-col">
          <DashboardHeader
            onOpenMobileMenu={() => setIsMobileDrawerOpen(true)}
            isMobileMenuOpen={isMobileDrawerOpen}
          />

          <main
            id="main-content"
            tabIndex={-1}
            className="relative min-h-[calc(100vh-4rem)] min-w-0 overflow-x-hidden lg:min-h-[calc(100vh-5rem)]"
          >
            <DashboardContentFrame>{children}</DashboardContentFrame>
          </main>
        </div>
      </div>

      <DashboardMobileDrawer
        isOpen={isMobileDrawerOpen}
        onClose={() => setIsMobileDrawerOpen(false)}
      />
    </div>
  );
}
