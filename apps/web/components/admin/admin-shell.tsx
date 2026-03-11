"use client";

import { type CSSProperties, useEffect, useState } from "react";
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

export function AdminShell({ children, onNotificationsClick }: AdminShellProps) {
  const { user } = useAuthSession();
  const { lenis } = useLenis();
  const pathname = usePathname();
  const prefersReducedMotion = useReducedMotion();
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  useAdminIdleLogout({
    onIdleTimeout: () => {
      setIsMobileDrawerOpen(false);
    },
  });

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
          "--admin-sidebar-width": ADMIN_SIDEBAR_WIDTH,
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

      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:block lg:w-[var(--admin-sidebar-width)] lg:overflow-hidden lg:border-r lg:border-[#1F1F1F]">
        <AdminSidebar userRole={user?.role} className="h-full" />
      </aside>

      <div className="relative z-10 min-h-screen lg:pl-[var(--admin-sidebar-width)]">
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
