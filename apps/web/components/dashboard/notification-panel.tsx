"use client";

import type { NotificationItem } from "@bookprinta/shared";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  BellRing,
  ChevronRight,
  CreditCard,
  PackageCheck,
  Star,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  DashboardErrorState,
  NotificationItemSkeleton,
} from "@/components/dashboard/dashboard-async-primitives";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationsList,
} from "@/hooks/use-dashboard-shell-data";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useRouter } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

const LOCALE_FORMAT_TAGS: Record<string, string> = {
  en: "en-NG",
  fr: "fr-FR",
  es: "es-ES",
};

const PANEL_TRANSITION = {
  duration: 0.24,
  ease: [0.22, 1, 0.36, 1] as const,
};

const READ_BORDER_TRANSITION = {
  duration: 0.18,
  ease: "easeOut" as const,
};

type NotificationPanelProps = {
  isOpen: boolean;
  onClose: () => void;
  panelId: string;
  panelTitleId: string;
  panelDescriptionId: string;
  unreadCount: number;
  onOpenReviewDialog?: (target: {
    bookId: string;
    bookTitle: string | null;
  }) => void | Promise<void>;
};

function resolveIntlLocale(locale: string): string {
  return LOCALE_FORMAT_TAGS[locale] ?? "en-NG";
}

function formatNotificationTimestamp(value: string, locale: string): string | null {
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return null;

  return new Intl.DateTimeFormat(resolveIntlLocale(locale), {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsedDate);
}

function getNotificationIcon(type: NotificationItem["type"]) {
  switch (type) {
    case "ORDER_STATUS":
      return PackageCheck;
    case "BANK_TRANSFER_RECEIVED":
      return CreditCard;
    case "PRODUCTION_DELAY":
      return AlertTriangle;
    case "REVIEW_REQUEST":
      return Star;
    default:
      return BellRing;
  }
}

function translateNotificationCopy(
  translate: ReturnType<typeof useTranslations>,
  key: string,
  params: NotificationItem["data"]["params"] | undefined
) {
  try {
    return translate(key as never, params as never);
  } catch {
    return key;
  }
}

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

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

function NotificationLoadingState({ label }: { label: string }) {
  return (
    <div
      aria-live="polite"
      aria-busy="true"
      className="min-h-72 px-1 py-3"
      data-testid="notification-panel-loading"
    >
      <p className="sr-only">{label}</p>
      <div className="grid gap-3">
        {["notif-skeleton-1", "notif-skeleton-2", "notif-skeleton-3", "notif-skeleton-4"].map(
          (key) => (
            <NotificationItemSkeleton key={key} />
          )
        )}
      </div>
    </div>
  );
}

function NotificationEmptyState({ label }: { label: string }) {
  return (
    <div aria-live="polite" className="flex min-h-72 items-center justify-center px-6 py-12">
      <p className="text-center font-sans text-sm text-white">{label}</p>
    </div>
  );
}

type NotificationListItemProps = {
  item: NotificationItem;
  locale: string;
  isPending: boolean;
  prefersReducedMotion: boolean;
  translate: ReturnType<typeof useTranslations>;
  onSelect: (item: NotificationItem) => Promise<void>;
};

function NotificationListItem({
  item,
  locale,
  isPending,
  prefersReducedMotion,
  translate,
  onSelect,
}: NotificationListItemProps) {
  const Icon = getNotificationIcon(item.type);
  const timestamp = formatNotificationTimestamp(item.createdAt, locale);
  const title = translateNotificationCopy(translate, item.data.titleKey, item.data.params);
  const message = translateNotificationCopy(translate, item.data.messageKey, item.data.params);
  const isWarning = item.type === "PRODUCTION_DELAY" || item.data.presentation?.tone === "warning";
  const hasAction = item.data.action && item.data.action.kind !== "none";

  return (
    <li>
      <motion.button
        type="button"
        initial={false}
        whileTap={prefersReducedMotion ? undefined : { scale: 0.995 }}
        onClick={() => void onSelect(item)}
        disabled={isPending}
        data-notification-id={item.id}
        data-read-state={item.isRead ? "read" : "unread"}
        className={cn(
          "relative flex w-full items-start gap-3 overflow-hidden rounded-[24px] border px-4 py-4 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-70",
          isWarning
            ? "border-[#FDE68A] bg-[#FEF3C7] text-[#171717]"
            : "border-[#2A2A2A] bg-[#111111] text-white hover:border-[#3A3A3A] hover:bg-[#171717]"
        )}
      >
        <span className="sr-only">
          {item.isRead
            ? translate("dashboard.notifications_item_read_label" as never)
            : translate("dashboard.notifications_item_unread_label" as never)}
          {hasAction ? ` ${translate("dashboard.notifications_item_action_hint" as never)}` : ""}
        </span>

        <motion.span
          aria-hidden="true"
          initial={false}
          animate={{
            opacity: item.isRead ? 0 : 1,
            scaleY: item.isRead ? 0.35 : 1,
          }}
          transition={prefersReducedMotion ? { duration: 0.01 } : READ_BORDER_TRANSITION}
          data-notification-indicator="true"
          className="absolute inset-y-3 left-0 w-1 rounded-full bg-[#007eff]"
          style={{ transformOrigin: "50% 0%" }}
        />

        <span
          className={cn(
            "inline-flex size-10 shrink-0 items-center justify-center rounded-full border",
            isWarning
              ? "border-[#F59E0B]/50 bg-[#FFF7DA] text-[#92400E]"
              : "border-[#2A2A2A] bg-black text-[#007eff]"
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
        </span>

        <span className="min-w-0 flex-1 pl-1">
          <span className="flex items-start justify-between gap-3">
            <span className="min-w-0">
              <span
                className={cn(
                  "block truncate font-sans text-sm font-semibold",
                  isWarning ? "text-[#141414]" : "text-white"
                )}
              >
                {title}
              </span>
              <span
                className={cn(
                  "mt-1 block text-sm leading-6",
                  isWarning ? "text-[#3A3121]" : "text-[#BDBDBD]"
                )}
              >
                {message}
              </span>
              {timestamp ? (
                <span className="mt-2 block font-sans text-[11px] font-medium tracking-[0.02em] text-[#2A2A2A]">
                  {timestamp}
                </span>
              ) : null}
            </span>

            {hasAction ? (
              <span
                className={cn(
                  "mt-0.5 inline-flex shrink-0 items-center justify-center rounded-full",
                  isWarning ? "text-[#7C5608]" : "text-[#767676]"
                )}
              >
                <ChevronRight className="size-4" aria-hidden="true" />
              </span>
            ) : null}
          </span>
        </span>
      </motion.button>
    </li>
  );
}

export function NotificationPanel({
  isOpen,
  onClose,
  panelId,
  panelTitleId,
  panelDescriptionId,
  unreadCount,
  onOpenReviewDialog,
}: NotificationPanelProps) {
  const tDashboard = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();
  const panelRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const [pendingNotificationId, setPendingNotificationId] = useState<string | null>(null);
  const { items, isInitialLoading, isError, isFetching, refetch } = useNotificationsList({
    isOpen,
  });
  const { markAsRead } = useMarkNotificationRead();
  const { markAllAsRead, isPending: isMarkAllPending } = useMarkAllNotificationsRead();
  const hasUnreadItems = unreadCount > 0 || items.some((item) => !item.isRead);

  useEffect(() => {
    if (!isOpen) return;

    const previousActiveElement =
      typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;
    const originalBodyOverflow = document.body.style.overflow;
    const isDesktop = window.matchMedia("(min-width: 1024px)").matches;

    if (!isDesktop) {
      document.body.style.overflow = "hidden";
    }

    const focusTimer = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === "Tab") {
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
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
      if (!isDesktop) {
        document.body.style.overflow = originalBodyOverflow;
      }
      previousActiveElement?.focus?.();
    };
  }, [isOpen, onClose]);

  const handleSelectNotification = async (item: NotificationItem) => {
    if (pendingNotificationId === item.id) {
      return;
    }

    setPendingNotificationId(item.id);

    try {
      if (!item.isRead) {
        await markAsRead({ notificationId: item.id });
      }
    } catch {
      toast.error(tDashboard("notifications_action_error"));
    } finally {
      setPendingNotificationId(null);
    }

    if (!item.isRead && !prefersReducedMotion && item.data.action?.kind !== "none") {
      await wait(140);
    }

    if (item.data.action?.kind === "navigate") {
      onClose();
      router.push(item.data.action.href as never);
      return;
    }

    if (item.data.action?.kind === "open_review_dialog") {
      onClose();

      if (onOpenReviewDialog) {
        await onOpenReviewDialog({
          bookId: item.data.action.bookId,
          bookTitle:
            typeof item.data.params?.bookTitle === "string" ? item.data.params.bookTitle : null,
        });
        return;
      }

      router.push("/dashboard/reviews" as never);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllAsRead();
    } catch {
      toast.error(tDashboard("notifications_action_error"));
    }
  };

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={
            prefersReducedMotion ? { duration: 0.01 } : { duration: 0.18, ease: "easeOut" }
          }
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              onClose();
            }
          }}
          className="fixed inset-0 z-50 flex justify-end bg-black/65 backdrop-blur-sm lg:absolute lg:inset-auto lg:right-0 lg:top-full lg:mt-3 lg:block lg:bg-transparent lg:backdrop-blur-0"
        >
          <motion.section
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-labelledby={panelTitleId}
            aria-describedby={panelDescriptionId}
            aria-label={tDashboard("notifications_panel_aria")}
            data-notification-panel-surface="true"
            data-lenis-prevent
            initial={prefersReducedMotion ? false : { x: "100%", opacity: 0.96 }}
            animate={prefersReducedMotion ? { x: 0, opacity: 1 } : { x: 0, opacity: 1 }}
            exit={prefersReducedMotion ? { x: 0, opacity: 0 } : { x: "100%", opacity: 0.96 }}
            transition={prefersReducedMotion ? { duration: 0.01 } : PANEL_TRANSITION}
            className="relative flex h-full w-full flex-col overflow-hidden border-l border-[#2A2A2A] bg-black shadow-[0_24px_80px_rgba(0,0,0,0.62)] sm:max-w-[30rem] lg:h-auto lg:w-[28rem] lg:max-w-none lg:rounded-[28px] lg:border lg:border-[#2A2A2A] lg:bg-[#111111]"
          >
            <div className="flex items-start justify-between gap-3 border-b border-[#2A2A2A] px-4 py-4 sm:px-5 lg:px-6">
              <div className="min-w-0">
                <h2
                  id={panelTitleId}
                  className="font-display text-xl font-semibold tracking-tight text-white"
                >
                  {tDashboard("notifications")}
                </h2>
                <p id={panelDescriptionId} className="mt-1 font-sans text-xs text-[#A9A9A9]">
                  {tDashboard("notifications_panel_description")}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  aria-label={tDashboard("notifications_mark_all_read_aria")}
                  onClick={() => void handleMarkAllRead()}
                  disabled={!hasUnreadItems || isMarkAllPending}
                  className="font-sans inline-flex min-h-11 items-center rounded-full px-3 text-xs font-semibold text-[#007eff] transition-opacity duration-150 hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isMarkAllPending
                    ? tDashboard("notifications_mark_all_read_loading")
                    : tDashboard("notifications_mark_all_read")}
                </button>

                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={onClose}
                  aria-label={tDashboard("notifications_close_panel_aria")}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#111111] text-white transition-colors duration-150 hover:border-[#007eff] hover:bg-[#1A1A1A] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            <ScrollArea className="min-h-0 flex-1" data-lenis-prevent>
              <div className="px-4 py-4 sm:px-5 sm:py-5 lg:px-6">
                {isInitialLoading ? (
                  <NotificationLoadingState label={tDashboard("notifications_loading")} />
                ) : null}

                {!isInitialLoading && isError && items.length === 0 ? (
                  <DashboardErrorState
                    className="min-h-72 rounded-[24px]"
                    title={tDashboard("notifications")}
                    description={tDashboard("notifications_unavailable")}
                    retryLabel={tCommon("retry")}
                    loadingLabel={tCommon("loading")}
                    onRetry={() => {
                      void refetch();
                    }}
                    isRetrying={isFetching}
                  />
                ) : null}

                {!isInitialLoading && !isError && items.length === 0 ? (
                  <NotificationEmptyState label={tDashboard("notifications_empty")} />
                ) : null}

                {!isInitialLoading && items.length > 0 ? (
                  <ul
                    aria-label={tDashboard("notifications_list_aria")}
                    aria-busy={pendingNotificationId !== null || isMarkAllPending}
                    className="space-y-3"
                  >
                    {items.map((item) => (
                      <NotificationListItem
                        key={item.id}
                        item={item}
                        locale={locale}
                        isPending={pendingNotificationId === item.id}
                        prefersReducedMotion={prefersReducedMotion}
                        translate={t}
                        onSelect={handleSelectNotification}
                      />
                    ))}
                  </ul>
                ) : null}
              </div>
            </ScrollArea>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
