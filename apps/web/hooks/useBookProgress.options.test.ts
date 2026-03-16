import { renderHook } from "@testing-library/react";
import { DASHBOARD_POLL_INTERVAL_MS } from "@/lib/dashboard/query-defaults";
import { bookProgressQueryKeys, useBookProgress } from "./useBookProgress";

const useQueryMock = jest.fn();

jest.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => useQueryMock(options),
}));

type QueryOptionsShape = {
  queryKey: unknown;
  enabled: boolean;
  refetchInterval: number;
  refetchOnWindowFocus: boolean;
};

describe("useBookProgress query options", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useQueryMock.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: false,
      isFetching: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  it("applies 30-second auto-refetch behavior for active tracking", () => {
    const bookId = "cm1111111111111111111111111";
    renderHook(() => useBookProgress({ bookId }));

    const options = useQueryMock.mock.calls[0]?.[0] as QueryOptionsShape;
    expect(options.queryKey).toEqual(bookProgressQueryKeys.detail(bookId));
    expect(options.enabled).toBe(true);
    expect(options.refetchInterval).toBe(DASHBOARD_POLL_INTERVAL_MS);
    expect(options.refetchOnWindowFocus).toBe(true);
  });

  it("disables remote query and keeps fallback timeline when book id is missing", () => {
    const { result } = renderHook(() => useBookProgress({ bookId: null }));

    const options = useQueryMock.mock.calls[0]?.[0] as QueryOptionsShape;
    expect(options.queryKey).toEqual(bookProgressQueryKeys.all);
    expect(options.enabled).toBe(false);

    expect(result.current.currentStage).toBe("PAYMENT_RECEIVED");
    expect(result.current.timeline).toHaveLength(11);
    expect(result.current.timeline[0]?.state).toBe("current");
  });
});
