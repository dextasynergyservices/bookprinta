"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { getFocusableElements } from "./admin-shell.utils";
import { AdminSidebar } from "./admin-sidebar";

type AdminMobileDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  userRole?: string | null;
};

export function getAdminDrawerMotionProps(prefersReducedMotion: boolean) {
  if (prefersReducedMotion) {
    return {
      overlay: {
        initial: { opacity: 1 },
        animate: { opacity: 1 },
        exit: { opacity: 1 },
        transition: { duration: 0 },
      },
      panel: {
        initial: { x: 0 },
        animate: { x: 0 },
        exit: { x: 0 },
        transition: { duration: 0 },
      },
    };
  }

  return {
    overlay: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 0.18, ease: "easeOut" as const },
    },
    panel: {
      initial: { x: "-100%" },
      animate: { x: 0 },
      exit: { x: "-100%" },
      transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] as const },
    },
  };
}

export function AdminMobileDrawer({ isOpen, onClose, userRole }: AdminMobileDrawerProps) {
  const tAdmin = useTranslations("admin");
  const prefersReducedMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const motionProps = getAdminDrawerMotionProps(prefersReducedMotion);

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
            aria-label={tAdmin("close_menu_aria")}
            onClick={onClose}
            className="absolute inset-0 z-0 bg-black/60 backdrop-blur-sm"
            initial={motionProps.overlay.initial}
            animate={motionProps.overlay.animate}
            exit={motionProps.overlay.exit}
            transition={motionProps.overlay.transition}
          />

          <motion.aside
            id="admin-mobile-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={tAdmin("navigation_aria")}
            initial={motionProps.panel.initial}
            animate={motionProps.panel.animate}
            exit={motionProps.panel.exit}
            transition={motionProps.panel.transition}
            data-lenis-prevent
            className="pointer-events-auto absolute inset-y-0 left-0 z-10 w-[86vw] max-w-80 border-r border-[#1F1F1F] shadow-[0_20px_60px_rgba(0,0,0,0.65)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div ref={panelRef} className="relative h-full">
              <button
                ref={closeButtonRef}
                type="button"
                onClick={onClose}
                aria-label={tAdmin("close_menu_aria")}
                className="absolute top-3 right-3 z-10 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#111111] text-white transition-colors duration-150 hover:border-[#007eff] hover:bg-[#1a1a1a] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
              >
                <X className="size-5" aria-hidden="true" />
              </button>

              <AdminSidebar onNavigate={onClose} userRole={userRole} className="h-full" />
            </div>
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
