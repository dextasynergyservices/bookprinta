import { act, renderHook, waitFor } from "@testing-library/react";
import { useAdminPaymentsFilters } from "./use-admin-payments-filters";

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

describe("useAdminPaymentsFilters", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    usePathnameMock.mockReturnValue("/admin/payments");
  });

  it("normalizes active filters and clears cursor state when sorting changes", async () => {
    useSearchParamsMock.mockReturnValue(
      new URLSearchParams(
        "status=AWAITING_APPROVAL&provider=BANK_TRANSFER&q=Ada&cursor=cursor_2&trail=root,cursor_1"
      )
    );

    const { result } = renderHook(() => useAdminPaymentsFilters());

    expect(result.current.status).toBe("AWAITING_APPROVAL");
    expect(result.current.provider).toBe("BANK_TRANSFER");
    expect(result.current.q).toBe("Ada");
    expect(result.current.cursor).toBe("cursor_2");
    expect(result.current.trail).toEqual([null, "cursor_1"]);
    expect(result.current.currentPage).toBe(3);
    expect(result.current.activeFilterCount).toBe(3);
    expect(result.current.hasActiveFilters).toBe(true);

    act(() => {
      result.current.setSort("amount", "asc");
    });

    await waitFor(() => {
      expect(routerReplaceMock).toHaveBeenCalled();
    });

    const nextHref = routerReplaceMock.mock.calls[0]?.[0] as string;
    expect(nextHref).toContain("/admin/payments?");
    expect(nextHref).toContain("status=AWAITING_APPROVAL");
    expect(nextHref).toContain("provider=BANK_TRANSFER");
    expect(nextHref).toContain("q=Ada");
    expect(nextHref).toContain("sortBy=amount");
    expect(nextHref).toContain("sortDirection=asc");
    expect(nextHref).not.toContain("cursor=");
    expect(nextHref).not.toContain("trail=");
    expect(routerReplaceMock.mock.calls[0]?.[1]).toEqual({ scroll: false });
  });

  it("moves forward and backward through cursor pagination using a stable trail", async () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams(""));

    const { result, rerender } = renderHook(() => useAdminPaymentsFilters());

    act(() => {
      result.current.goToNextCursor("cursor_2");
    });

    await waitFor(() => {
      expect(routerReplaceMock).toHaveBeenCalledWith("/admin/payments?cursor=cursor_2&trail=root", {
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
      expect(routerReplaceMock).toHaveBeenCalledWith("/admin/payments?cursor=cursor_2&trail=root", {
        scroll: false,
      });
    });
  });
});
