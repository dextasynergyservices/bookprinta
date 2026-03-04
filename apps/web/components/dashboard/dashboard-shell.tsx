"use client";

import { useEffect, useState } from "react";
import { useLenis } from "@/hooks/use-lenis";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { DashboardContentFrame } from "./dashboard-content-frame";
import { DashboardHeader } from "./dashboard-header";
import { DashboardMobileDrawer } from "./dashboard-mobile-drawer";
import { DashboardSidebar } from "./dashboard-sidebar";

type DashboardShellProps = {
  children: React.ReactNode;
};

export function DashboardShell({ children }: DashboardShellProps) {
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const { lenis } = useLenis();
  const prefersReducedMotion = useReducedMotion();

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
    <div className="relative min-h-screen overflow-x-clip bg-[#000000] text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(58% 42% at 18% 0%, rgba(0,126,255,0.10) 0%, rgba(0,0,0,0) 68%)",
        }}
      />

      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:block lg:w-72 lg:border-r lg:border-[#2A2A2A]">
        <DashboardSidebar />
      </aside>

      <div className="relative min-h-screen lg:pl-72">
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
