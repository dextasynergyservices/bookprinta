import { act, renderHook, waitFor } from "@testing-library/react";
import { useAdminBooksFilters } from "./use-admin-books-filters";

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

describe("useAdminBooksFilters", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    usePathnameMock.mockReturnValue("/admin/books");
  });

  it("normalizes active filters and clears cursor state when sorting changes", async () => {
    useSearchParamsMock.mockReturnValue(
      new URLSearchParams("status=FORMATTING&cursor=cursor_2&trail=root,cursor_1")
    );

    const { result } = renderHook(() => useAdminBooksFilters());

    expect(result.current.status).toBe("FORMATTING");
    expect(result.current.cursor).toBe("cursor_2");
    expect(result.current.trail).toEqual([null, "cursor_1"]);
    expect(result.current.currentPage).toBe(3);
    expect(result.current.activeFilterCount).toBe(1);
    expect(result.current.hasActiveFilters).toBe(true);

    act(() => {
      result.current.setSort("title", "asc");
    });

    await waitFor(() => {
      expect(routerReplaceMock).toHaveBeenCalled();
    });

    const nextHref = routerReplaceMock.mock.calls[0]?.[0] as string;
    expect(nextHref).toContain("/admin/books?");
    expect(nextHref).toContain("status=FORMATTING");
    expect(nextHref).toContain("sortBy=title");
    expect(nextHref).toContain("sortDirection=asc");
    expect(nextHref).not.toContain("cursor=");
    expect(nextHref).not.toContain("trail=");
    expect(routerReplaceMock.mock.calls[0]?.[1]).toEqual({ scroll: false });
  });

  it("moves forward and backward through cursor pagination using a stable trail", async () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams(""));

    const { result, rerender } = renderHook(() => useAdminBooksFilters());

    act(() => {
      result.current.goToNextCursor("cursor_2");
    });

    await waitFor(() => {
      expect(routerReplaceMock).toHaveBeenCalledWith("/admin/books?cursor=cursor_2&trail=root", {
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
      expect(routerReplaceMock).toHaveBeenCalledWith("/admin/books?cursor=cursor_2&trail=root", {
        scroll: false,
      });
    });
  });
});
