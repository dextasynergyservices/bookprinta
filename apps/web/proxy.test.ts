jest.mock("next-intl/middleware", () => {
  const middlewareMock = jest.fn();
  return {
    __esModule: true,
    default: jest.fn(() => {
      (globalThis as { __intlMiddlewareMock?: jest.Mock }).__intlMiddlewareMock = middlewareMock;
      return middlewareMock;
    }),
  };
});

jest.mock("next/server", () => ({
  NextResponse: {
    redirect: (...args: unknown[]) => {
      const mockContainer = globalThis as { __nextResponseRedirectMock?: jest.Mock };
      if (!mockContainer.__nextResponseRedirectMock) {
        mockContainer.__nextResponseRedirectMock = jest.fn();
      }

      return mockContainer.__nextResponseRedirectMock(...args);
    },
  },
}));

const getIntlMiddlewareMock = () =>
  (globalThis as { __intlMiddlewareMock?: jest.Mock }).__intlMiddlewareMock as jest.Mock;

const getNextResponseRedirectMock = () =>
  (globalThis as { __nextResponseRedirectMock?: jest.Mock })
    .__nextResponseRedirectMock as jest.Mock;

jest.mock("@/lib/i18n/routing", () => ({
  routing: {
    locales: ["en", "fr", "es"],
    defaultLocale: "en",
    localePrefix: "as-needed",
  },
}));

import proxy from "./proxy";

beforeAll(() => {
  // Ensure the dynamic redirect mock exists before tests execute.
  (globalThis as { __nextResponseRedirectMock?: jest.Mock }).__nextResponseRedirectMock = jest.fn();
});

afterAll(() => {
  delete (globalThis as { __intlMiddlewareMock?: jest.Mock }).__intlMiddlewareMock;
  delete (globalThis as { __nextResponseRedirectMock?: jest.Mock }).__nextResponseRedirectMock;
});

function toBase64Url(value: string): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createJwtWithExp(expMsFromNow: number): string {
  const header = toBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = toBase64Url(
    JSON.stringify({
      sub: "user_1",
      role: "USER",
      exp: Math.floor((Date.now() + expMsFromNow) / 1000),
    })
  );

  return `${header}.${payload}.signature`;
}

function createRequest(input: { pathname: string; search?: string; accessToken?: string }) {
  const search = input.search ?? "";
  const fullPath = `${input.pathname}${search}`;

  return {
    url: `https://bookprinta.test${fullPath}`,
    nextUrl: {
      pathname: input.pathname,
      search,
    },
    cookies: {
      get: (name: string) => {
        if (name !== "access_token" || !input.accessToken) {
          return undefined;
        }

        return { value: input.accessToken };
      },
    },
  } as never;
}

describe("proxy auth boundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getIntlMiddlewareMock().mockReturnValue({ kind: "intl" });
    getNextResponseRedirectMock().mockImplementation((url: URL) => ({
      kind: "redirect",
      to: url.toString(),
    }));
  });

  it("redirects unauthenticated deep links to login with encoded returnTo", () => {
    const request = createRequest({
      pathname: "/dashboard/orders/123",
      search: "?tab=tracking",
    });

    const response = proxy(request);

    expect(getNextResponseRedirectMock()).toHaveBeenCalledTimes(1);
    expect(getIntlMiddlewareMock()).not.toHaveBeenCalled();
    expect(response).toEqual({
      kind: "redirect",
      to: "https://bookprinta.test/login?returnTo=%2Fdashboard%2Forders%2F123%3Ftab%3Dtracking",
    });
  });

  it("preserves locale prefix when redirecting protected routes", () => {
    const request = createRequest({
      pathname: "/fr/dashboard/orders/123",
      search: "?tab=tracking&view=compact",
    });

    const response = proxy(request);

    expect(getNextResponseRedirectMock()).toHaveBeenCalledTimes(1);
    expect(getIntlMiddlewareMock()).not.toHaveBeenCalled();
    expect(response).toEqual({
      kind: "redirect",
      to: "https://bookprinta.test/fr/login?returnTo=%2Ffr%2Fdashboard%2Forders%2F123%3Ftab%3Dtracking%26view%3Dcompact",
    });
  });

  it("redirects unauthenticated admin deep links and preserves locale + query", () => {
    const request = createRequest({
      pathname: "/es/admin/quotes/cm123",
      search: "?status=PENDING&sort=createdAt",
    });

    const response = proxy(request);

    expect(getNextResponseRedirectMock()).toHaveBeenCalledTimes(1);
    expect(getIntlMiddlewareMock()).not.toHaveBeenCalled();
    expect(response).toEqual({
      kind: "redirect",
      to: "https://bookprinta.test/es/login?returnTo=%2Fes%2Fadmin%2Fquotes%2Fcm123%3Fstatus%3DPENDING%26sort%3DcreatedAt",
    });
  });

  it("passes through to intl middleware for public routes", () => {
    const request = createRequest({
      pathname: "/pricing",
      search: "?currency=NGN",
    });

    const response = proxy(request);

    expect(getNextResponseRedirectMock()).not.toHaveBeenCalled();
    expect(getIntlMiddlewareMock()).toHaveBeenCalledWith(request);
    expect(response).toEqual({ kind: "intl" });
  });

  it("passes through to intl middleware when access token is present and unexpired", () => {
    const request = createRequest({
      pathname: "/admin/quotes",
      accessToken: createJwtWithExp(60_000),
    });

    const response = proxy(request);

    expect(getNextResponseRedirectMock()).not.toHaveBeenCalled();
    expect(getIntlMiddlewareMock()).toHaveBeenCalledWith(request);
    expect(response).toEqual({ kind: "intl" });
  });

  it("treats expired tokens as unauthorized and redirects to login", () => {
    const request = createRequest({
      pathname: "/admin/quotes",
      search: "?status=PENDING",
      accessToken: createJwtWithExp(-60_000),
    });

    const response = proxy(request);

    expect(getNextResponseRedirectMock()).toHaveBeenCalledTimes(1);
    expect(getIntlMiddlewareMock()).not.toHaveBeenCalled();
    expect(response).toEqual({
      kind: "redirect",
      to: "https://bookprinta.test/login?returnTo=%2Fadmin%2Fquotes%3Fstatus%3DPENDING",
    });
  });
});
