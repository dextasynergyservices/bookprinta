"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useNotificationUnreadCount } from "@/hooks/use-dashboard-shell-data";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { usePathname } from "@/lib/i18n/navigation";
import { NotificationPanel } from "./notification-panel";

type NotificationBellProps = {
  onOpenReviewDialog?: (target: {
    bookId: string;
    bookTitle: string | null;
  }) => void | Promise<void>;
};

export function NotificationBell({ onOpenReviewDialog }: NotificationBellProps) {
  const tDashboard = useTranslations("dashboard");
  const pathname = usePathname();
  const prefersReducedMotion = useReducedMotion();
  const { unreadCount, hasUnread, isLoading, isError, isFallback } = useNotificationUnreadCount();
  const [isOpen, setIsOpen] = useState(false);
  const [badgeAnimationKey, setBadgeAnimationKey] = useState(0);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const previousUnreadCountRef = useRef<number | null>(null);
  const previousPathnameRef = useRef(pathname);
  const panelId = useId();
  const panelTitleId = useId();
  const panelDescriptionId = useId();

  useEffect(() => {
    if (previousPathnameRef.current === pathname) {
      return;
    }

    previousPathnameRef.current = pathname;
    setIsOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (wrapperRef.current?.contains(target)) return;

      setIsOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      event.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isLoading || isError || isFallback) {
      return;
    }

    if (previousUnreadCountRef.current === null) {
      previousUnreadCountRef.current = unreadCount;
      return;
    }

    if (unreadCount > previousUnreadCountRef.current) {
      setBadgeAnimationKey((current) => current + 1);
    }

    previousUnreadCountRef.current = unreadCount;
  }, [isError, isFallback, isLoading, unreadCount]);

  const notificationsSrText = useMemo(() => {
    if (isLoading) return tDashboard("notifications_loading");
    if (isError || isFallback) return tDashboard("notifications_unavailable");
    if (hasUnread) return tDashboard("header_notifications_unread_count", { count: unreadCount });
    return tDashboard("notifications_empty");
  }, [hasUnread, isError, isFallback, isLoading, tDashboard, unreadCount]);

  const buttonAriaLabel = isOpen
    ? tDashboard("header_notifications_close_aria")
    : tDashboard("header_notifications_aria");
  const badgeLabel = unreadCount > 99 ? tDashboard("notifications_badge_overflow") : unreadCount;

  return (
    <div ref={wrapperRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={buttonAriaLabel}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        onClick={() => setIsOpen((current) => !current)}
        className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#111111] text-white transition-colors duration-150 hover:border-[#007eff] hover:bg-[#1a1a1a] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
      >
        <Bell className="size-5" aria-hidden="true" />

        <AnimatePresence initial={false}>
          {hasUnread ? (
            <motion.span
              key={badgeAnimationKey}
              initial={prefersReducedMotion ? { scale: 1, opacity: 1 } : { scale: 1, opacity: 1 }}
              animate={
                prefersReducedMotion || badgeAnimationKey === 0
                  ? { scale: 1, opacity: 1 }
                  : { scale: [1, 1.18, 0.96, 1], opacity: [1, 1, 1, 1] }
              }
              exit={{ opacity: 0, scale: 0.75 }}
              transition={
                prefersReducedMotion
                  ? { duration: 0.01 }
                  : { duration: 0.42, ease: [0.22, 1, 0.36, 1] }
              }
              data-notification-badge="true"
              data-bounce-seq={badgeAnimationKey}
              aria-hidden="true"
              className="absolute -top-1 -right-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[#007eff] px-1 font-sans text-[10px] leading-none font-semibold text-white"
            >
              {badgeLabel}
            </motion.span>
          ) : null}
        </AnimatePresence>

        <span className="sr-only" aria-live="polite">
          {notificationsSrText}
        </span>
      </button>

      <NotificationPanel
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        panelId={panelId}
        panelTitleId={panelTitleId}
        panelDescriptionId={panelDescriptionId}
        unreadCount={unreadCount}
        onOpenReviewDialog={onOpenReviewDialog}
      />
    </div>
  );
}
