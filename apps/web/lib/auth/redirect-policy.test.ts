import {
  ADMIN_PROTECTED_PREFIX,
  AUTH_FALLBACK_ROUTES,
  buildLoginRedirect,
  buildLogoutRedirect,
  DEFAULT_ADMIN_TO_USER_RETURN_POLICY,
  DEFAULT_PRESERVE_RETURN_TO_ON_LOGOUT,
  getProtectedScope,
  getRoleFallbackRoute,
  isInternalReturnPath,
  resolvePostLoginRedirect,
  roleMatchesProtectedScope,
  sanitizeReturnTarget,
  sanitizeReturnTo,
  stripLoginRedirectQueryParams,
  USER_PROTECTED_PREFIX,
} from "./redirect-policy";

describe("redirect-policy", () => {
  let infoSpy: jest.SpyInstance;

  beforeEach(() => {
    infoSpy = jest.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    infoSpy.mockRestore();
  });

  it("defines protected route prefixes and fallback routes", () => {
    expect(USER_PROTECTED_PREFIX).toBe("/dashboard");
    expect(ADMIN_PROTECTED_PREFIX).toBe("/admin");
    expect(AUTH_FALLBACK_ROUTES).toEqual({
      user: "/dashboard",
      admin: "/admin",
      unauth: "/login",
    });
  });

  it("accepts only internal return paths", () => {
    expect(isInternalReturnPath("/dashboard/orders/123?tab=tracking")).toBe(true);
    expect(isInternalReturnPath("/admin/quotes")).toBe(true);

    expect(isInternalReturnPath("https://evil.example/steal")).toBe(false);
    expect(isInternalReturnPath("javascript:alert(1)")).toBe(false);
    expect(isInternalReturnPath("//evil.example/path")).toBe(false);
    expect(isInternalReturnPath("dashboard/orders")).toBe(false);
    expect(isInternalReturnPath("")).toBe(false);
  });

  it("resolves protected scope by route prefix boundaries", () => {
    expect(getProtectedScope("/admin")).toBe("admin");
    expect(getProtectedScope("/admin/users/1")).toBe("admin");
    expect(getProtectedScope("/fr/admin/users/1")).toBe("admin");
    expect(getProtectedScope("/dashboard")).toBe("user");
    expect(getProtectedScope("/dashboard/books/abc")).toBe("user");
    expect(getProtectedScope("/es/dashboard/books/abc")).toBe("user");
    expect(getProtectedScope("/administer")).toBe("none");
    expect(getProtectedScope("/dashboarding")).toBe("none");
    expect(getProtectedScope("/pricing")).toBe("none");
  });

  it("matches role to protected scope strictly", () => {
    expect(roleMatchesProtectedScope("ADMIN", "admin")).toBe(true);
    expect(roleMatchesProtectedScope("SUPER_ADMIN", "admin")).toBe(true);

    expect(roleMatchesProtectedScope("USER", "admin")).toBe(false);
    expect(roleMatchesProtectedScope("USER", "user")).toBe(true);
    expect(roleMatchesProtectedScope("ADMIN", "user")).toBe(false);
    expect(roleMatchesProtectedScope("ADMIN", "none")).toBe(false);
  });

  it("resolves role fallback routes", () => {
    expect(getRoleFallbackRoute("ADMIN")).toBe("/admin");
    expect(getRoleFallbackRoute("SUPER_ADMIN")).toBe("/admin");
    expect(getRoleFallbackRoute("USER")).toBe("/dashboard");
  });

  it("uses explicit admin-to-user policy for cross-role return targets", () => {
    expect(DEFAULT_ADMIN_TO_USER_RETURN_POLICY).toBe("fallback");

    expect(
      resolvePostLoginRedirect({
        role: "ADMIN",
        returnTo: "/dashboard/orders/123?tab=tracking",
      })
    ).toBe(AUTH_FALLBACK_ROUTES.admin);

    expect(
      resolvePostLoginRedirect({
        role: "ADMIN",
        returnTo: "/dashboard/orders/123?tab=tracking",
        adminToUserPolicy: "allow",
      })
    ).toBe("/dashboard/orders/123?tab=tracking");
  });

  it("sanitizes return target with internal-path and role-prefix rules", () => {
    expect(sanitizeReturnTarget("/dashboard/orders/123", "USER")).toBe("/dashboard/orders/123");
    expect(sanitizeReturnTarget("/admin/quotes", "ADMIN")).toBe("/admin/quotes");

    expect(sanitizeReturnTarget("/admin/quotes", "USER")).toBeNull();
    expect(sanitizeReturnTarget("/dashboard/books", "ADMIN")).toBeNull();

    expect(sanitizeReturnTarget("https://evil.example", "USER")).toBeNull();
    expect(sanitizeReturnTarget("javascript:alert(1)", "ADMIN")).toBeNull();
    expect(sanitizeReturnTarget("//evil.example", "USER")).toBeNull();
    expect(sanitizeReturnTarget("/pricing", "USER")).toBeNull();
  });

  it("sanitizes returnTo for encoded, malformed, and external values", () => {
    expect(sanitizeReturnTo("%2Fdashboard%2Forders%2F123%3Ftab%3Dtracking")).toBe(
      "/dashboard/orders/123?tab=tracking"
    );
    expect(sanitizeReturnTo("%2Ffr%2Fadmin%2Fquotes%3Fstatus%3DPENDING")).toBe(
      "/fr/admin/quotes?status=PENDING"
    );

    expect(sanitizeReturnTo("https://evil.example/pwn")).toBeNull();
    expect(sanitizeReturnTo("//evil.example/pwn")).toBeNull();
    expect(sanitizeReturnTo("javascript:alert(1)")).toBeNull();
    expect(sanitizeReturnTo("%E0%A4%A")).toBeNull();
    expect(sanitizeReturnTo("/pricing")).toBeNull();
  });

  it("builds login redirect preserving locale and query params", () => {
    expect(buildLoginRedirect("/dashboard/orders/abc?tab=timeline&view=compact")).toBe(
      "/login?returnTo=%2Fdashboard%2Forders%2Fabc%3Ftab%3Dtimeline%26view%3Dcompact"
    );
    expect(buildLoginRedirect("/fr/admin/quotes?status=PENDING&sort=createdAt")).toBe(
      "/login?returnTo=%2Ffr%2Fadmin%2Fquotes%3Fstatus%3DPENDING%26sort%3DcreatedAt"
    );
    expect(buildLoginRedirect("https://evil.example/path")).toBe("/login");
  });

  it("supports deep-link unauth redirect for both user and admin paths", () => {
    expect(buildLoginRedirect("/dashboard/books/book_42?tab=preview")).toBe(
      "/login?returnTo=%2Fdashboard%2Fbooks%2Fbook_42%3Ftab%3Dpreview"
    );

    expect(buildLoginRedirect("/es/admin/quotes/cm123?status=PENDING&sort=createdAt")).toBe(
      "/login?returnTo=%2Fes%2Fadmin%2Fquotes%2Fcm123%3Fstatus%3DPENDING%26sort%3DcreatedAt"
    );
  });

  it("builds logout redirect with configurable returnTo preservation", () => {
    expect(DEFAULT_PRESERVE_RETURN_TO_ON_LOGOUT).toBe(true);

    expect(buildLogoutRedirect("/dashboard/orders/abc?tab=timeline")).toBe(
      "/login?returnTo=%2Fdashboard%2Forders%2Fabc%3Ftab%3Dtimeline"
    );

    expect(
      buildLogoutRedirect("/dashboard/orders/abc?tab=timeline", {
        preserveReturnToOnLogout: false,
      })
    ).toBe("/login");
  });

  it("preserves exact nested logout return path", () => {
    expect(buildLogoutRedirect("/dashboard/orders/cm123?tab=tracking&view=compact")).toBe(
      "/login?returnTo=%2Fdashboard%2Forders%2Fcm123%3Ftab%3Dtracking%26view%3Dcompact"
    );
    expect(buildLogoutRedirect("/fr/admin/payments/cm999?status=AWAITING_APPROVAL")).toBe(
      "/login?returnTo=%2Ffr%2Fadmin%2Fpayments%2Fcm999%3Fstatus%3DAWAITING_APPROVAL"
    );
  });

  it("strips stale login redirect query params", () => {
    expect(stripLoginRedirectQueryParams("?returnTo=%2Fdashboard%2Forders%2F123")).toBe("");
    expect(stripLoginRedirectQueryParams("?next=%2Fadmin%2Fquotes")).toBe("");
    expect(
      stripLoginRedirectQueryParams("?returnTo=%2Fdashboard%2Forders%2F123&from=expired")
    ).toBe("?from=expired");
    expect(stripLoginRedirectQueryParams("?foo=bar")).toBe("?foo=bar");
  });

  it("resolves post-login redirect with role matching and fallback", () => {
    expect(resolvePostLoginRedirect({ role: "USER", returnTo: "/dashboard/orders/123" })).toBe(
      "/dashboard/orders/123"
    );
    expect(resolvePostLoginRedirect({ role: "ADMIN", returnTo: "/admin/payments" })).toBe(
      "/admin/payments"
    );

    // Role mismatch must fail closed to role fallback.
    expect(resolvePostLoginRedirect({ role: "USER", returnTo: "/admin/payments" })).toBe(
      "/dashboard"
    );
    expect(resolvePostLoginRedirect({ role: "ADMIN", returnTo: "/dashboard/orders" })).toBe(
      "/admin"
    );

    // Encoded values are supported.
    expect(
      resolvePostLoginRedirect({
        role: "USER",
        returnTo: "%2Fdashboard%2Fbooks%2F1%3Ftab%3Dpreview",
      })
    ).toBe("/dashboard/books/1?tab=preview");

    // Malformed/external/unsupported values fallback safely.
    expect(resolvePostLoginRedirect({ role: "USER", returnTo: "%E0%A4%A" })).toBe("/dashboard");
    expect(resolvePostLoginRedirect({ role: "ADMIN", returnTo: "https://evil.example" })).toBe(
      "/admin"
    );
    expect(resolvePostLoginRedirect({ role: "USER", returnTo: "/pricing" })).toBe("/dashboard");
  });

  it("blocks invalid returnTo and falls back safely", () => {
    expect(
      resolvePostLoginRedirect({ role: "USER", returnTo: "https://evil.example/hijack" })
    ).toBe("/dashboard");

    expect(resolvePostLoginRedirect({ role: "ADMIN", returnTo: "javascript:alert(1)" })).toBe(
      "/admin"
    );
  });

  it("emits redirect telemetry for fallback hits", () => {
    resolvePostLoginRedirect({ role: "USER", returnTo: "https://evil.example/hijack" });
    resolvePostLoginRedirect({ role: "ADMIN", returnTo: "/dashboard/orders/123" });

    expect(infoSpy).toHaveBeenCalledWith(
      "[auth-redirect]",
      expect.objectContaining({
        event: "auth.redirect.post-login",
        outcome: "fallback",
        reason: "invalid-or-unsupported-return-to",
      })
    );
    expect(infoSpy).toHaveBeenCalledWith(
      "[auth-redirect]",
      expect.objectContaining({
        event: "auth.redirect.post-login",
        outcome: "fallback",
        reason: "role-mismatch",
      })
    );
  });
});
