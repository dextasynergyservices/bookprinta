import { type AdminRole, isAdminRole } from "@bookprinta/shared";
import {
  BarChart3,
  BookOpenText,
  CreditCard,
  FileText,
  Images,
  type LucideIcon,
  Newspaper,
  Package,
  Settings,
  Shield,
  ShoppingCart,
  TicketPercent,
  Users,
} from "lucide-react";

export type AdminNavLabelKey =
  | "analytics"
  | "orders"
  | "books"
  | "payments"
  | "users"
  | "quotes"
  | "packages"
  | "coupons"
  | "showcase"
  | "resources"
  | "system_settings"
  | "audit_logs";

export type AdminNavSectionLabelKey =
  | "section_overview"
  | "section_operations"
  | "section_content"
  | "section_control";

export type AdminNavItem = {
  segment: string | null;
  href: string;
  labelKey: AdminNavLabelKey;
  sectionLabelKey: AdminNavSectionLabelKey;
  icon: LucideIcon;
  matchMode: "exact" | "prefix";
  allowedRoles: readonly AdminRole[];
};

export type AdminNavSection = {
  labelKey: AdminNavSectionLabelKey;
  items: AdminNavItem[];
};

const LOCALE_PREFIX_PATTERN = /^\/(?:en|fr|es)(?=\/|$)/;

const TOP_LEVEL_ADMIN_ROLES = ["SUPER_ADMIN", "ADMIN"] as const satisfies readonly AdminRole[];
const OPERATIONS_ADMIN_ROLES = [
  "SUPER_ADMIN",
  "ADMIN",
  "MANAGER",
] as const satisfies readonly AdminRole[];
const CONTENT_ADMIN_ROLES = ["SUPER_ADMIN", "EDITOR"] as const satisfies readonly AdminRole[];
const ANALYTICS_ADMIN_ROLES = [
  "SUPER_ADMIN",
  "ADMIN",
  "MANAGER",
] as const satisfies readonly AdminRole[];

export const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  {
    segment: "analytics",
    href: "/admin/analytics",
    labelKey: "analytics",
    sectionLabelKey: "section_overview",
    icon: BarChart3,
    matchMode: "prefix",
    allowedRoles: ANALYTICS_ADMIN_ROLES,
  },
  {
    segment: "orders",
    href: "/admin/orders",
    labelKey: "orders",
    sectionLabelKey: "section_operations",
    icon: ShoppingCart,
    matchMode: "prefix",
    allowedRoles: OPERATIONS_ADMIN_ROLES,
  },
  {
    segment: "books",
    href: "/admin/books",
    labelKey: "books",
    sectionLabelKey: "section_operations",
    icon: BookOpenText,
    matchMode: "prefix",
    allowedRoles: OPERATIONS_ADMIN_ROLES,
  },
  {
    segment: "payments",
    href: "/admin/payments",
    labelKey: "payments",
    sectionLabelKey: "section_operations",
    icon: CreditCard,
    matchMode: "prefix",
    allowedRoles: OPERATIONS_ADMIN_ROLES,
  },
  {
    segment: "users",
    href: "/admin/users",
    labelKey: "users",
    sectionLabelKey: "section_operations",
    icon: Users,
    matchMode: "prefix",
    allowedRoles: TOP_LEVEL_ADMIN_ROLES,
  },
  {
    segment: "quotes",
    href: "/admin/quotes",
    labelKey: "quotes",
    sectionLabelKey: "section_operations",
    icon: FileText,
    matchMode: "prefix",
    allowedRoles: OPERATIONS_ADMIN_ROLES,
  },
  {
    segment: "packages",
    href: "/admin/packages",
    labelKey: "packages",
    sectionLabelKey: "section_operations",
    icon: Package,
    matchMode: "prefix",
    allowedRoles: OPERATIONS_ADMIN_ROLES,
  },
  {
    segment: "coupons",
    href: "/admin/coupons",
    labelKey: "coupons",
    sectionLabelKey: "section_operations",
    icon: TicketPercent,
    matchMode: "prefix",
    allowedRoles: OPERATIONS_ADMIN_ROLES,
  },
  {
    segment: "showcase",
    href: "/admin/showcase",
    labelKey: "showcase",
    sectionLabelKey: "section_content",
    icon: Images,
    matchMode: "prefix",
    allowedRoles: CONTENT_ADMIN_ROLES,
  },
  {
    segment: "resources",
    href: "/admin/resources",
    labelKey: "resources",
    sectionLabelKey: "section_content",
    icon: Newspaper,
    matchMode: "prefix",
    allowedRoles: CONTENT_ADMIN_ROLES,
  },
  {
    segment: "system-settings",
    href: "/admin/system-settings",
    labelKey: "system_settings",
    sectionLabelKey: "section_control",
    icon: Settings,
    matchMode: "prefix",
    allowedRoles: TOP_LEVEL_ADMIN_ROLES,
  },
  {
    segment: "audit-logs",
    href: "/admin/audit-logs",
    labelKey: "audit_logs",
    sectionLabelKey: "section_control",
    icon: Shield,
    matchMode: "prefix",
    allowedRoles: TOP_LEVEL_ADMIN_ROLES,
  },
] as const;

export function normalizeAdminPathname(pathname: string): string {
  if (!pathname) return "/";

  const strippedPathname = pathname.replace(LOCALE_PREFIX_PATTERN, "") || "/";
  return strippedPathname.startsWith("/") ? strippedPathname : `/${strippedPathname}`;
}

export function isAdminNavItemActive(
  pathname: string,
  item: Pick<AdminNavItem, "href" | "matchMode">
) {
  const normalizedPathname = normalizeAdminPathname(pathname);

  if (item.matchMode === "exact") {
    return normalizedPathname === item.href;
  }

  return normalizedPathname === item.href || normalizedPathname.startsWith(`${item.href}/`);
}

export function getAdminNavigationForRole(role: string | null | undefined): AdminNavItem[] {
  if (!isAdminRole(role)) return [];

  return ADMIN_NAV_ITEMS.filter((item) => item.allowedRoles.includes(role));
}

export function getAdminNavigationSectionsForRole(
  role: string | null | undefined
): AdminNavSection[] {
  const items = getAdminNavigationForRole(role);
  const sections = new Map<AdminNavSectionLabelKey, AdminNavItem[]>([
    ["section_overview", []],
    ["section_operations", []],
    ["section_content", []],
    ["section_control", []],
  ]);

  for (const item of items) {
    sections.get(item.sectionLabelKey)?.push(item);
  }

  return Array.from(sections.entries())
    .filter(([, sectionItems]) => sectionItems.length > 0)
    .map(([labelKey, sectionItems]) => ({
      labelKey,
      items: sectionItems,
    }));
}

export function getActiveAdminNavigationItem(pathname: string): AdminNavItem | null {
  return ADMIN_NAV_ITEMS.find((item) => isAdminNavItemActive(pathname, item)) ?? null;
}

export function canAdminAccessPath(role: string | null | undefined, pathname: string): boolean {
  if (!isAdminRole(role)) return false;

  const normalizedPathname = normalizeAdminPathname(pathname);
  const activeItem = getActiveAdminNavigationItem(pathname);
  if (!activeItem) return normalizedPathname.startsWith("/admin");

  return activeItem.allowedRoles.includes(role);
}

export function getDefaultAdminHref(role: string | null | undefined): string {
  return getAdminNavigationForRole(role)[0]?.href ?? "/admin";
}

export function getAdminNavigationItemBySection(section: string): AdminNavItem | null {
  return ADMIN_NAV_ITEMS.find((item) => item.segment === section) ?? null;
}

export function resolveAdminPageTitle(
  pathname: string,
  tAdmin: (key: AdminNavLabelKey | "title") => string
) {
  const activeItem = getActiveAdminNavigationItem(pathname);

  return activeItem ? tAdmin(activeItem.labelKey) : tAdmin("title");
}
