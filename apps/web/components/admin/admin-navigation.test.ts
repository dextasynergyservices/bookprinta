import {
  ADMIN_NAV_ITEMS,
  canAdminAccessPath,
  getActiveAdminNavigationItem,
  getAdminNavigationForRole,
  getAdminNavigationSectionsForRole,
  getDefaultAdminHref,
  isAdminNavItemActive,
  normalizeAdminPathname,
} from "./admin-navigation";

describe("admin navigation config", () => {
  it("keeps admin navigation limited to analytics, operations, and top-level system sections", () => {
    expect(getAdminNavigationForRole("ADMIN").map((item) => item.href)).toEqual([
      "/admin/analytics",
      "/admin/orders",
      "/admin/books",
      "/admin/payments",
      "/admin/users",
      "/admin/quotes",
      "/admin/packages",
      "/admin/coupons",
      "/admin/reviews",
      "/admin/system-settings",
      "/admin/audit-logs",
    ]);
  });

  it("filters manager navigation to analytics and operational sections", () => {
    expect(getAdminNavigationForRole("MANAGER").map((item) => item.href)).toEqual([
      "/admin/analytics",
      "/admin/orders",
      "/admin/books",
      "/admin/payments",
      "/admin/quotes",
      "/admin/packages",
      "/admin/coupons",
    ]);
  });

  it("filters editor navigation to content sections only", () => {
    expect(getAdminNavigationForRole("EDITOR").map((item) => item.href)).toEqual([
      "/admin/showcase",
      "/admin/resources",
    ]);
  });

  it("keeps all items available to super admins", () => {
    expect(getAdminNavigationForRole("SUPER_ADMIN")).toHaveLength(ADMIN_NAV_ITEMS.length);
  });

  it("marks prefix routes active for nested admin pages", () => {
    const ordersItem = ADMIN_NAV_ITEMS.find((item) => item.href === "/admin/orders");

    expect(ordersItem).toBeDefined();
    if (!ordersItem) {
      throw new Error("Expected orders admin navigation item to exist");
    }

    expect(isAdminNavItemActive("/admin/orders/transfer-123", ordersItem)).toBe(true);
  });

  it("normalizes locale-prefixed admin pathnames before matching access rules", () => {
    expect(normalizeAdminPathname("/en/admin")).toBe("/admin");
    expect(normalizeAdminPathname("/fr/admin/users")).toBe("/admin/users");
    expect(normalizeAdminPathname("/es/admin/orders/cm123")).toBe("/admin/orders/cm123");
    expect(canAdminAccessPath("SUPER_ADMIN", "/en/admin")).toBe(true);
    expect(canAdminAccessPath("ADMIN", "/fr/admin/users")).toBe(true);
    expect(getActiveAdminNavigationItem("/es/admin/payments")?.href).toBe("/admin/payments");
  });

  it("resolves the active item and route access from the same config", () => {
    expect(getActiveAdminNavigationItem("/admin/resources/article-1")?.href).toBe(
      "/admin/resources"
    );
    expect(canAdminAccessPath("EDITOR", "/admin/resources/article-1")).toBe(true);
    expect(canAdminAccessPath("EDITOR", "/admin/payments")).toBe(false);
    expect(canAdminAccessPath("MANAGER", "/admin/users")).toBe(false);
    expect(canAdminAccessPath("SUPER_ADMIN", "/admin/unknown")).toBe(true);
  });

  it("falls back to the first allowed route for restricted admin roles", () => {
    expect(getDefaultAdminHref("EDITOR")).toBe("/admin/showcase");
    expect(getDefaultAdminHref("MANAGER")).toBe("/admin/analytics");
  });

  it("groups admin navigation into overview, operations, content, and control sections", () => {
    expect(
      getAdminNavigationSectionsForRole("ADMIN").map((section) => ({
        labelKey: section.labelKey,
        hrefs: section.items.map((item) => item.href),
      }))
    ).toEqual([
      {
        labelKey: "section_overview",
        hrefs: ["/admin/analytics"],
      },
      {
        labelKey: "section_operations",
        hrefs: [
          "/admin/orders",
          "/admin/books",
          "/admin/payments",
          "/admin/users",
          "/admin/quotes",
          "/admin/packages",
          "/admin/coupons",
        ],
      },
      {
        labelKey: "section_content",
        hrefs: ["/admin/reviews"],
      },
      {
        labelKey: "section_control",
        hrefs: ["/admin/system-settings", "/admin/audit-logs"],
      },
    ]);
  });
});
