import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { clearSessionMarkerCookie, setSessionMarkerCookie } from "@/lib/auth/session-cookie";
import { useAuthSession } from "./use-auth-session";

jest.mock("posthog-js", () => ({ __esModule: true, default: { __loaded: false } }));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useAuthSession", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    clearSessionMarkerCookie();
  });

  it("makes no API calls for an anonymous visitor (no session marker)", async () => {
    global.fetch = jest.fn() as unknown as typeof fetch;

    const { result } = renderHook(() => useAuthSession(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("resolves the session when the marker is present", async () => {
    setSessionMarkerCookie();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ user: { id: "u1", email: "a@b.co", role: "USER" } }),
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useAuthSession(), { wrapper });

    await waitFor(() => expect(result.current.user).toMatchObject({ id: "u1" }));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/auth/me",
      expect.objectContaining({ credentials: "include" })
    );
  });
});
