"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Link, usePathname } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import {
  type AdminNavItem,
  getAdminNavigationSectionsForRole,
  isAdminNavItemActive,
} from "./admin-navigation";

type AdminSidebarProps = {
  className?: string;
  onNavigate?: () => void;
  userRole?: string | null;
  isCollapsed?: boolean;
};

function AdminSidebarLink({
  item,
  itemLabel,
  isActive,
  onNavigate,
  isCollapsed = false,
}: {
  item: AdminNavItem;
  itemLabel: string;
  isActive: boolean;
  onNavigate?: () => void;
  isCollapsed?: boolean;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-label={itemLabel}
      title={isCollapsed ? itemLabel : undefined}
      aria-current={isActive ? "page" : undefined}
      onClick={() => {
        onNavigate?.();
      }}
      className={cn(
        "font-sans group flex min-h-11 items-center py-2 text-sm font-medium text-white transition-all duration-150 focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2",
        isCollapsed
          ? isActive
            ? "justify-center rounded-[1rem] border border-[#1B3654] bg-[#1A1A1A] px-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
            : "justify-center rounded-[1rem] border border-transparent px-2 hover:border-[#2A2A2A] hover:bg-[#141414]"
          : isActive
            ? "gap-3 rounded-r-[1.1rem] border-l-2 border-l-[#007eff] px-3 bg-[#1A1A1A] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
            : "gap-3 rounded-r-[1.1rem] border-l-2 border-l-transparent px-3 hover:bg-[#141414]"
      )}
    >
      <span
        className={cn(
          "inline-flex size-8 shrink-0 items-center justify-center rounded-[0.95rem] border transition-colors duration-150",
          isActive
            ? "border-[#1B3654] bg-[#07111B] text-[#D7E8FF]"
            : "border-[#1D1D1D] bg-[#101010] text-[#C5C5C5] group-hover:border-[#2A2A2A] group-hover:text-white"
        )}
      >
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className={cn("truncate", isCollapsed ? "sr-only" : undefined)}>{itemLabel}</span>
    </Link>
  );
}

export function AdminSidebar({
  className,
  onNavigate,
  userRole,
  isCollapsed = false,
}: AdminSidebarProps) {
  const tAdmin = useTranslations("admin");
  const pathname = usePathname();
  const visibleSections = getAdminNavigationSectionsForRole(userRole);

  return (
    <div className={cn("relative flex h-full flex-col overflow-hidden bg-[#0A0A0A]", className)}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.028) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.028) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          maskImage:
            "linear-gradient(180deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.2) 55%, transparent 100%)",
        }}
      />

      <div
        className={cn(
          "relative border-b border-[#1F1F1F] bg-[linear-gradient(180deg,rgba(255,255,255,0.03)_0%,rgba(255,255,255,0)_100%)]",
          isCollapsed ? "px-3 py-4" : "px-5 py-5"
        )}
      >
        <Link
          href="/admin"
          onClick={() => {
            onNavigate?.();
          }}
          className={cn(
            "block rounded-[1.4rem] border border-[#161616] bg-[#0D0D0D] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2",
            isCollapsed ? "mx-auto w-fit p-3" : "p-4"
          )}
          aria-label={tAdmin("panel_label")}
        >
          <Image
            src={isCollapsed ? "/favicon.png" : "/logo-main-white.png"}
            alt={tAdmin("panel_label")}
            width={isCollapsed ? 32 : 154}
            height={isCollapsed ? 32 : 42}
            priority
            className={cn(isCollapsed ? "h-8 w-8" : "h-8 w-auto")}
          />
        </Link>
      </div>

      <TooltipProvider delayDuration={120}>
        <nav
          aria-label={tAdmin("navigation_aria")}
          className={cn(
            "relative flex-1 overflow-y-auto py-4 md:py-5",
            isCollapsed ? "px-2" : "px-3"
          )}
        >
          <div className={cn(isCollapsed ? "space-y-3" : "space-y-5")}>
            {visibleSections.map((section) => (
              <div key={section.labelKey} className={cn(isCollapsed ? "space-y-1.5" : "space-y-2")}>
                {isCollapsed ? null : (
                  <div className="px-3">
                    <p className="font-sans text-[10px] font-medium uppercase tracking-[0.28em] text-[#6F6F6F]">
                      {tAdmin(section.labelKey)}
                    </p>
                  </div>
                )}

                <ul className="space-y-1">
                  {section.items.map((item) => {
                    const itemLabel = tAdmin(item.labelKey);
                    const isActive = isAdminNavItemActive(pathname, item);
                    const link = (
                      <AdminSidebarLink
                        item={item}
                        itemLabel={itemLabel}
                        isActive={isActive}
                        onNavigate={onNavigate}
                        isCollapsed={isCollapsed}
                      />
                    );

                    return (
                      <li key={item.href}>
                        {isCollapsed ? (
                          <Tooltip>
                            <TooltipTrigger asChild>{link}</TooltipTrigger>
                            <TooltipContent side="right" sideOffset={10}>
                              {itemLabel}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          link
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </nav>
      </TooltipProvider>
    </div>
  );
}
