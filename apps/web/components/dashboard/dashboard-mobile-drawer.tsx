"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { DashboardSidebar } from "./dashboard-sidebar";

type DashboardMobileDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
};

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];

  const selector = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");

  return Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(
    (element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true"
  );
}

export function DashboardMobileDrawer({ isOpen, onClose }: DashboardMobileDrawerProps) {
  const tDashboard = useTranslations("dashboard");
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const previousActiveElement =
      typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;
    const originalBodyOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const focusables = getFocusableElements(panelRef.current);
      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = originalBodyOverflow;
      previousActiveElement?.focus();
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <motion.button
            type="button"
            aria-label={tDashboard("header_close_menu_aria")}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          />

          <motion.aside
            id="dashboard-mobile-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={tDashboard("sidebar_navigation_aria")}
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            data-lenis-prevent
            className="absolute inset-y-0 left-0 w-[86vw] max-w-80 border-r border-[#2A2A2A] shadow-[0_20px_60px_rgba(0,0,0,0.65)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div ref={panelRef} className="relative h-full">
              <button
                ref={closeButtonRef}
                type="button"
                onClick={onClose}
                aria-label={tDashboard("header_close_menu_aria")}
                className="absolute top-3 right-3 z-10 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#111111] text-white transition-colors duration-150 hover:border-[#007eff] hover:bg-[#1a1a1a] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
              >
                <X className="size-5" aria-hidden="true" />
              </button>

              <DashboardSidebar onNavigate={onClose} className="h-full" />
            </div>
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
