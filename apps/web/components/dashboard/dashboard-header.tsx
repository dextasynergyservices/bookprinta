"use client";

import { ChevronDown, CircleUserRound, LogOut, Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { NotificationBell } from "@/components/dashboard/notification-bell";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { useAuthSession } from "@/hooks/use-auth-session";
import { Link, usePathname, useRouter } from "@/lib/i18n/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

function resolveTitle(
  pathname: string,
  dashboardTitle: string,
  tDashboard: (key: string) => string
) {
  if (pathname === "/dashboard" || pathname === "/dashboard/") return dashboardTitle;
  if (pathname.startsWith("/dashboard/books")) return tDashboard("my_books");
  if (pathname.startsWith("/dashboard/orders")) return tDashboard("orders");
  if (pathname.startsWith("/dashboard/profile")) return tDashboard("profile");
  if (pathname.startsWith("/dashboard/settings")) return tDashboard("settings");
  if (pathname.startsWith("/dashboard/reviews")) return tDashboard("reviews");

  return dashboardTitle;
}

function toInitials(value: string, fallback: string) {
  const words = value.split(" ").filter(Boolean);
  if (words.length === 0) return fallback.slice(0, 2).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0].charAt(0)}${words[1].charAt(0)}`.toUpperCase();
}

type DashboardHeaderProps = {
  onOpenMobileMenu?: () => void;
  isMobileMenuOpen?: boolean;
  onOpenReviewDialog?: (target: {
    bookId: string;
    bookTitle: string | null;
  }) => void | Promise<void>;
};

export function DashboardHeader({
  onOpenMobileMenu,
  isMobileMenuOpen = false,
  onOpenReviewDialog,
}: DashboardHeaderProps) {
  const tDashboard = useTranslations("dashboard");
  const tNav = useTranslations("nav");
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, isLoggingOut } = useAuthSession();
  const dashboardTitle = tDashboard("title");
  const guestLabel = tDashboard("header_guest");

  const pageTitle = resolveTitle(pathname, dashboardTitle, tDashboard);
  const displayName = user?.displayName ?? guestLabel;
  const initials = user?.initials ?? toInitials(guestLabel, guestLabel);

  const handleLogout = async () => {
    try {
      await logout();
      toast.success(tNav("logout_success"));
      router.replace("/");
    } catch {
      toast.error(tNav("logout_error"));
    }
  };

  return (
    <header className="sticky top-0 z-30 border-b border-[#2A2A2A] bg-black/90 backdrop-blur-md">
      <div className="flex min-h-14 items-center justify-between gap-2 px-3 py-2 sm:min-h-16 sm:px-4 sm:py-3 lg:min-h-20 lg:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          {onOpenMobileMenu ? (
            <button
              type="button"
              aria-label={tDashboard("header_open_menu_aria")}
              aria-expanded={isMobileMenuOpen}
              aria-controls="dashboard-mobile-drawer"
              onClick={onOpenMobileMenu}
              className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-full border border-[#2A2A2A] bg-[#111111] text-white transition-colors duration-150 hover:border-[#007eff] hover:bg-[#1a1a1a] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2 lg:hidden"
            >
              <Menu className="size-5" aria-hidden="true" />
            </button>
          ) : null}

          <h1 className="font-display truncate text-lg font-semibold tracking-tight text-white sm:text-xl lg:text-3xl">
            {pageTitle}
          </h1>
        </div>

        <div className="ml-2 flex shrink-0 items-center gap-1 sm:gap-2 lg:gap-3">
          <LanguageSwitcher compact />

          <NotificationBell onOpenReviewDialog={onOpenReviewDialog} />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={tDashboard("header_account_menu_aria")}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-[#2A2A2A] bg-[#111111] px-1.5 py-1 pr-2 text-white transition-colors duration-150 hover:border-[#007eff] hover:bg-[#1a1a1a] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2 sm:min-h-11 sm:gap-2 sm:px-2 sm:pr-3"
              >
                <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-[#1f1f1f] font-sans text-[11px] font-semibold text-white sm:size-8 sm:text-xs">
                  {initials}
                </span>
                <span className="hidden max-w-32 truncate font-sans text-sm font-medium lg:inline">
                  {displayName}
                </span>
                <ChevronDown className="hidden size-4 text-[#bdbdbd] sm:block" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
              align="end"
              sideOffset={8}
              className="w-52 border-[#2A2A2A] bg-[#0E0E0E] text-white"
            >
              <div className="border-b border-[#2A2A2A] px-2 py-2">
                <p className="truncate font-sans text-sm font-medium text-white">{displayName}</p>
                <p className="truncate font-sans text-xs text-[#A9A9A9]">{user?.email ?? ""}</p>
              </div>

              <DropdownMenuItem asChild className="font-sans">
                <Link href="/dashboard/profile" aria-label={tDashboard("header_profile_link_aria")}>
                  <CircleUserRound className="size-4" aria-hidden="true" />
                  {tDashboard("menu_profile")}
                </Link>
              </DropdownMenuItem>

              <DropdownMenuItem
                disabled={isLoggingOut}
                aria-label={tDashboard("header_logout_action_aria")}
                onSelect={(event) => {
                  event.preventDefault();
                  void handleLogout();
                }}
                className="font-sans"
              >
                <LogOut className="size-4" aria-hidden="true" />
                {isLoggingOut ? tDashboard("menu_logout_loading") : tDashboard("menu_logout")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
