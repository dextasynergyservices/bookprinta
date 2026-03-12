import {
  ADMIN_NAV_ITEMS,
  canAdminAccessPath,
  getActiveAdminNavigationItem,
  getAdminNavigationForRole,
  getAdminNavigationSectionsForRole,
  getDefaultAdminHref,
  isAdminNavItemActive,
} from "./admin-navigation";

describe("admin navigation config", () => {
  it("keeps admin navigation limited to analytics, operations, and top-level system sections", () => {
    expect(getAdminNavigationForRole("ADMIN").map((item) => item.href)).toEqual([
      "/admin",
      "/admin/orders",
      "/admin/books",
      "/admin/payments",
      "/admin/users",
      "/admin/quotes",
      "/admin/packages",
      "/admin/coupons",
      "/admin/system-settings",
      "/admin/audit-logs",
    ]);
  });

  it("filters manager navigation to analytics and operational sections", () => {
    expect(getAdminNavigationForRole("MANAGER").map((item) => item.href)).toEqual([
      "/admin",
      "/admin/orders",
      "/admin/books",
      "/admin/payments",
      "/admin/users",
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

  it("resolves the active item and route access from the same config", () => {
    expect(getActiveAdminNavigationItem("/admin/resources/article-1")?.href).toBe(
      "/admin/resources"
    );
    expect(canAdminAccessPath("EDITOR", "/admin/resources/article-1")).toBe(true);
    expect(canAdminAccessPath("EDITOR", "/admin/payments")).toBe(false);
    expect(canAdminAccessPath("SUPER_ADMIN", "/admin/unknown")).toBe(true);
  });

  it("falls back to the first allowed route for restricted admin roles", () => {
    expect(getDefaultAdminHref("EDITOR")).toBe("/admin/showcase");
    expect(getDefaultAdminHref("MANAGER")).toBe("/admin");
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
        hrefs: ["/admin"],
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
        labelKey: "section_control",
        hrefs: ["/admin/system-settings", "/admin/audit-logs"],
      },
    ]);
  });
});
