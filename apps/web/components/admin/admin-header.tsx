"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bell, LogOut, Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { toast } from "sonner";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { useAdminNotificationBellState } from "@/hooks/use-admin-notifications";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { buildLogoutRedirect } from "@/lib/auth/redirect-policy";
import { usePathname, useRouter } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import { resolveAdminPageTitle } from "./admin-navigation";
import { formatAdminRoleLabel } from "./admin-shell.utils";

type AdminHeaderProps = {
  onOpenMobileMenu?: () => void;
  isMobileMenuOpen?: boolean;
  onNotificationsClick?: () => void;
  isNotificationsOpen?: boolean;
  notificationsPanelId?: string;
};

const CONTROL_BUTTON_CLASS_NAME =
  "relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#111111] text-white transition-colors duration-150 hover:border-[#007eff] hover:bg-[#1a1a1a] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2";

const PRESERVE_RETURN_TO_ON_EXPLICIT_LOGOUT = true;

export function AdminHeader({
  onOpenMobileMenu,
  isMobileMenuOpen = false,
  onNotificationsClick,
  isNotificationsOpen = false,
  notificationsPanelId,
}: AdminHeaderProps) {
  const tAdmin = useTranslations("admin");
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, isLoggingOut } = useAuthSession();
  const prefersReducedMotion = useReducedMotion();
  const {
    unreadCount,
    hasUnread,
    isLoading: isNotificationsLoading,
    isError: isNotificationsError,
    isFallback: isNotificationsFallback,
    badgeAnimationKey,
  } = useAdminNotificationBellState();

  const pageTitle = resolveAdminPageTitle(pathname, tAdmin);
  const displayName = user?.displayName ?? tAdmin("title");
  const roleLabel = formatAdminRoleLabel(user?.role, tAdmin);
  const notificationLabel =
    unreadCount > 0
      ? `${tAdmin("notifications_aria")} (${unreadCount > 99 ? "99+" : unreadCount})`
      : tAdmin("notifications_aria");
  const notificationsSrText = useMemo(() => {
    if (isNotificationsLoading) {
      return tAdmin("notifications_loading");
    }

    if (isNotificationsError || isNotificationsFallback) {
      return tAdmin("notifications_unavailable");
    }

    if (hasUnread) {
      return tAdmin("notifications_unread_count", { count: unreadCount });
    }

    return tAdmin("notifications_empty");
  }, [
    hasUnread,
    isNotificationsError,
    isNotificationsFallback,
    isNotificationsLoading,
    tAdmin,
    unreadCount,
  ]);
  const badgeLabel = unreadCount > 99 ? "99+" : unreadCount;

  const handleLogout = async () => {
    try {
      await logout();
      toast.success(tAdmin("logout_success"));
      const currentPathWithQuery =
        typeof window === "undefined" ? pathname : `${pathname}${window.location.search}`;
      router.replace(
        buildLogoutRedirect(currentPathWithQuery, {
          preserveReturnToOnLogout: PRESERVE_RETURN_TO_ON_EXPLICIT_LOGOUT,
        })
      );
    } catch {
      toast.error(tAdmin("logout_error"));
    }
  };

  const renderControls = (desktopOnly: boolean) => (
    <div className={cn("items-center gap-2", desktopOnly ? "hidden lg:flex" : "flex lg:hidden")}>
      <LanguageSwitcher
        compact
        className="rounded-full border border-[#2A2A2A] bg-[#111111] text-white hover:border-[#007eff] hover:bg-[#1a1a1a] hover:text-white"
      />

      <button
        type="button"
        aria-label={notificationLabel}
        aria-haspopup="dialog"
        aria-expanded={isNotificationsOpen}
        aria-controls={isNotificationsOpen ? notificationsPanelId : undefined}
        onClick={() => {
          onNotificationsClick?.();
        }}
        className={CONTROL_BUTTON_CLASS_NAME}
      >
        <Bell className="size-4" aria-hidden="true" />

        <AnimatePresence initial={false}>
          {hasUnread ? (
            <motion.span
              key={badgeAnimationKey}
              initial={{ scale: 1, opacity: 1 }}
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
              data-bounce-seq={badgeAnimationKey}
              aria-hidden="true"
              className="font-sans absolute -top-1 -right-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[#007eff] px-1 text-[10px] font-semibold leading-none text-white"
            >
              {badgeLabel}
            </motion.span>
          ) : null}
        </AnimatePresence>

        <span className="sr-only" aria-live="polite">
          {notificationsSrText}
        </span>
      </button>

      <button
        type="button"
        aria-label={isLoggingOut ? tAdmin("logout_loading") : tAdmin("logout")}
        disabled={isLoggingOut}
        onClick={() => {
          void handleLogout();
        }}
        className={cn(
          CONTROL_BUTTON_CLASS_NAME,
          "font-sans gap-2 px-3 text-sm font-medium",
          isLoggingOut ? "cursor-not-allowed opacity-70" : ""
        )}
      >
        <LogOut className="size-4 shrink-0" aria-hidden="true" />
        <span className="hidden lg:inline">
          {isLoggingOut ? tAdmin("logout_loading") : tAdmin("logout")}
        </span>
      </button>
    </div>
  );

  return (
    <header className="sticky top-0 z-30 border-b border-[#1F1F1F] bg-black/92 backdrop-blur-md">
      <div className="flex flex-col gap-3 px-4 py-3 md:px-6 md:py-4 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            {onOpenMobileMenu ? (
              <button
                type="button"
                aria-label={tAdmin("open_menu_aria")}
                aria-expanded={isMobileMenuOpen}
                aria-controls="admin-mobile-drawer"
                onClick={onOpenMobileMenu}
                className={cn(CONTROL_BUTTON_CLASS_NAME, "shrink-0 lg:hidden")}
              >
                <Menu className="size-5" aria-hidden="true" />
              </button>
            ) : null}

            <div className="min-w-0">
              <p className="font-display truncate text-lg font-semibold tracking-tight text-white md:text-xl lg:text-3xl">
                {pageTitle}
              </p>
              <p className="font-sans mt-1 truncate text-[11px] font-medium uppercase tracking-[0.24em] text-[#7D7D7D]">
                {tAdmin("panel_label")}
              </p>
            </div>
          </div>

          {renderControls(false)}
        </div>

        <div className="flex items-end justify-between gap-3 md:items-center lg:min-w-[22rem] lg:justify-end">
          <div className="min-w-0">
            <p className="font-sans truncate text-sm font-medium text-white md:text-base">
              {displayName}
            </p>
            {roleLabel ? (
              <span className="font-sans mt-1 inline-flex min-h-7 items-center rounded-full bg-[#2A2A2A] px-3 text-[11px] font-medium tracking-[0.08em] text-white md:text-xs">
                {roleLabel}
              </span>
            ) : null}
          </div>

          {renderControls(true)}
        </div>
      </div>
    </header>
  );
}
