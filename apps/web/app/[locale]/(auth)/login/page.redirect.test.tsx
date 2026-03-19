import { render, screen, waitFor } from "@testing-library/react";
import { resolvePostLoginRedirect } from "@/lib/auth/redirect-policy";
import LoginPage from "./page";

const useAuthSessionMock = jest.fn();

let mockLocale = "en";
let mockSearchParams = new URLSearchParams();
const routerReplaceMock = jest.fn();
let getPathnameMock: jest.Mock;

jest.mock("@/lib/auth/redirect-policy", () => {
  const actual = jest.requireActual("@/lib/auth/redirect-policy");
  return {
    ...actual,
    resolvePostLoginRedirect: jest.fn(actual.resolvePostLoginRedirect),
  };
});

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => mockLocale,
}));

jest.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
}));

jest.mock("@/hooks/use-auth-session", () => ({
  AUTH_SESSION_QUERY_KEY: ["auth", "session"],
  useAuthSession: () => useAuthSessionMock(),
}));

jest.mock("@/components/shared/RecaptchaProvider", () => ({
  RecaptchaProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("react-google-recaptcha-v3", () => ({
  useGoogleReCaptcha: () => ({ executeRecaptcha: undefined }),
}));

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    cancelQueries: jest.fn(),
    setQueryData: jest.fn(),
    invalidateQueries: jest.fn(),
  }),
}));

jest.mock("framer-motion", () => ({
  motion: {
    section: ({
      children,
      whileHover: _whileHover,
      whileTap: _whileTap,
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      ...props
    }: React.HTMLAttributes<HTMLElement> & {
      whileHover?: unknown;
      whileTap?: unknown;
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
      transition?: unknown;
    }) => <section {...props}>{children}</section>,
    button: ({
      children,
      whileHover: _whileHover,
      whileTap: _whileTap,
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
      whileHover?: unknown;
      whileTap?: unknown;
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
      transition?: unknown;
    }) => <button {...props}>{children}</button>,
  },
}));

jest.mock("lucide-react", () => ({
  Eye: () => <span data-testid="icon-eye" />,
  EyeOff: () => <span data-testid="icon-eyeoff" />,
  Loader2: () => <span data-testid="icon-loader" />,
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ alt }: { alt: string }) => <div data-testid="next-image" title={alt} />,
}));

jest.mock("@/lib/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => "/login",
  useRouter: () => ({
    replace: routerReplaceMock,
  }),
  getPathname: (...args: [{ href: string; locale: string }]) => getPathnameMock(...args),
}));

describe("login page success redirect routing", () => {
  const resolvePostLoginRedirectMock = resolvePostLoginRedirect as jest.MockedFunction<
    typeof resolvePostLoginRedirect
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLocale = "en";
    mockSearchParams = new URLSearchParams();
    getPathnameMock = jest.fn(({ href, locale }: { href: string; locale: string }) =>
      locale === "en" ? href : `/${locale}${href}`
    );
    useAuthSessionMock.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      isFetching: false,
    });

    getPathnameMock.mockClear();
    resolvePostLoginRedirectMock.mockClear();
  });

  it("redirects authenticated user to localized returnTo path", async () => {
    mockLocale = "fr";
    mockSearchParams = new URLSearchParams("returnTo=%2Fdashboard%2Forders%2F123%3Ftab%3Dtracking");
    useAuthSessionMock.mockReturnValue({
      user: {
        id: "user_1",
        email: "author@example.com",
        role: "USER",
        firstName: "Author",
        lastName: null,
        displayName: "Author",
        initials: "AU",
      },
      isAuthenticated: true,
      isLoading: false,
      isFetching: false,
    });

    render(<LoginPage />);

    await waitFor(() => {
      expect(resolvePostLoginRedirectMock).toHaveBeenCalledWith({
        role: "USER",
        returnTo: "/dashboard/orders/123?tab=tracking",
        adminToUserPolicy: "fallback",
      });
      expect(getPathnameMock).toHaveBeenCalledWith({
        href: "/dashboard/orders/123?tab=tracking",
        locale: "fr",
      });
      expect(routerReplaceMock).toHaveBeenCalledWith("/fr/dashboard/orders/123?tab=tracking");
    });
  });

  it("points the auth footer Terms and Privacy links to the legal pages", () => {
    render(<LoginPage />);

    expect(screen.getByRole("link", { name: "login_footer_terms" })).toHaveAttribute(
      "href",
      "/terms"
    );
    expect(screen.getByRole("link", { name: "login_footer_privacy" })).toHaveAttribute(
      "href",
      "/privacy"
    );
  });

  it("falls back admin attempting user returnTo to admin home", async () => {
    mockLocale = "es";
    mockSearchParams = new URLSearchParams("returnTo=%2Fdashboard%2Forders%2F123");
    useAuthSessionMock.mockReturnValue({
      user: {
        id: "admin_1",
        email: "admin@example.com",
        role: "ADMIN",
        firstName: "Admin",
        lastName: null,
        displayName: "Admin",
        initials: "AD",
      },
      isAuthenticated: true,
      isLoading: false,
      isFetching: false,
    });

    render(<LoginPage />);

    await waitFor(() => {
      expect(resolvePostLoginRedirectMock).toHaveBeenCalledWith({
        role: "ADMIN",
        returnTo: "/dashboard/orders/123",
        adminToUserPolicy: "fallback",
      });
      expect(getPathnameMock).toHaveBeenCalledWith({
        href: "/admin",
        locale: "es",
      });
      expect(routerReplaceMock).toHaveBeenCalledWith("/es/admin");
    });
  });

  it("redirects authenticated admin to localized admin deep-link", async () => {
    mockLocale = "es";
    mockSearchParams = new URLSearchParams("returnTo=%2Fadmin%2Fquotes%3Fstatus%3DPENDING");
    useAuthSessionMock.mockReturnValue({
      user: {
        id: "admin_2",
        email: "manager@example.com",
        role: "MANAGER",
        firstName: "Manager",
        lastName: null,
        displayName: "Manager",
        initials: "MG",
      },
      isAuthenticated: true,
      isLoading: false,
      isFetching: false,
    });

    render(<LoginPage />);

    await waitFor(() => {
      expect(resolvePostLoginRedirectMock).toHaveBeenCalledWith({
        role: "MANAGER",
        returnTo: "/admin/quotes?status=PENDING",
        adminToUserPolicy: "fallback",
      });
      expect(getPathnameMock).toHaveBeenCalledWith({
        href: "/admin/quotes?status=PENDING",
        locale: "es",
      });
      expect(routerReplaceMock).toHaveBeenCalledWith("/es/admin/quotes?status=PENDING");
    });
  });

  it("blocks invalid returnTo and falls back to role default", async () => {
    mockLocale = "fr";
    mockSearchParams = new URLSearchParams("returnTo=https%3A%2F%2Fevil.example%2Fhijack");
    useAuthSessionMock.mockReturnValue({
      user: {
        id: "user_2",
        email: "reader@example.com",
        role: "USER",
        firstName: "Reader",
        lastName: null,
        displayName: "Reader",
        initials: "RD",
      },
      isAuthenticated: true,
      isLoading: false,
      isFetching: false,
    });

    render(<LoginPage />);

    await waitFor(() => {
      expect(resolvePostLoginRedirectMock).toHaveBeenCalledWith({
        role: "USER",
        returnTo: "https://evil.example/hijack",
        adminToUserPolicy: "fallback",
      });
      expect(getPathnameMock).toHaveBeenCalledWith({
        href: "/dashboard",
        locale: "fr",
      });
      expect(routerReplaceMock).toHaveBeenCalledWith("/fr/dashboard");
    });
  });
});
