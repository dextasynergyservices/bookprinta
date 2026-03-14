import { act, renderHook, waitFor } from "@testing-library/react";
import { useAdminUsersFilters } from "./use-admin-users-filters";

const useSearchParamsMock = jest.fn();
const routerReplaceMock = jest.fn();
const usePathnameMock = jest.fn();

jest.mock("next/navigation", () => ({
  useSearchParams: () => useSearchParamsMock(),
}));

jest.mock("@/lib/i18n/navigation", () => ({
  useRouter: () => ({
    replace: routerReplaceMock,
  }),
  usePathname: () => usePathnameMock(),
}));

describe("useAdminUsersFilters", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    usePathnameMock.mockReturnValue("/admin/users");
  });

  it("normalizes active filters and clears cursor state when sorting changes", async () => {
    useSearchParamsMock.mockReturnValue(
      new URLSearchParams("role=EDITOR&isVerified=true&q=Ada&cursor=cursor_2&trail=root,cursor_1")
    );

    const { result } = renderHook(() => useAdminUsersFilters());

    expect(result.current.role).toBe("EDITOR");
    expect(result.current.isVerified).toBe(true);
    expect(result.current.q).toBe("Ada");
    expect(result.current.cursor).toBe("cursor_2");
    expect(result.current.trail).toEqual([null, "cursor_1"]);
    expect(result.current.currentPage).toBe(3);
    expect(result.current.activeFilterCount).toBe(3);
    expect(result.current.hasActiveFilters).toBe(true);

    act(() => {
      result.current.setSort("role", "asc");
    });

    await waitFor(() => {
      expect(routerReplaceMock).toHaveBeenCalled();
    });

    const nextHref = routerReplaceMock.mock.calls[0]?.[0] as string;
    expect(nextHref).toContain("/admin/users?");
    expect(nextHref).toContain("role=EDITOR");
    expect(nextHref).toContain("isVerified=true");
    expect(nextHref).toContain("q=Ada");
    expect(nextHref).toContain("sortBy=role");
    expect(nextHref).toContain("sortDirection=asc");
    expect(nextHref).not.toContain("cursor=");
    expect(nextHref).not.toContain("trail=");
    expect(routerReplaceMock.mock.calls[0]?.[1]).toEqual({ scroll: false });
  });

  it("moves forward and backward through cursor pagination using a stable trail", async () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams(""));

    const { result, rerender } = renderHook(() => useAdminUsersFilters());

    act(() => {
      result.current.goToNextCursor("cursor_2");
    });

    await waitFor(() => {
      expect(routerReplaceMock).toHaveBeenCalledWith("/admin/users?cursor=cursor_2&trail=root", {
        scroll: false,
      });
    });

    routerReplaceMock.mockClear();
    useSearchParamsMock.mockReturnValue(new URLSearchParams("cursor=cursor_3&trail=root,cursor_2"));
    rerender();

    act(() => {
      result.current.goToPreviousCursor();
    });

    await waitFor(() => {
      expect(routerReplaceMock).toHaveBeenCalledWith("/admin/users?cursor=cursor_2&trail=root", {
        scroll: false,
      });
    });
  });
});
