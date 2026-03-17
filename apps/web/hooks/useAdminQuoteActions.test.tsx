import { renderHook } from "@testing-library/react";
import {
  useAdminGenerateQuotePaymentLinkMutation,
  useAdminQuoteActions,
  useAdminQuotePatchMutation,
  useAdminRevokeQuotePaymentLinkMutation,
} from "./useAdminQuoteActions";

const useMutationMock = jest.fn();
const invalidateQueriesMock = jest.fn();

jest.mock("./useAdminQuotes", () => ({
  adminQuotesQueryKeys: {
    all: ["admin", "quotes"],
    lists: () => ["admin", "quotes", "list"],
    detail: (quoteId: string) => ["admin", "quotes", "detail", quoteId],
  },
}));

jest.mock("@tanstack/react-query", () => ({
  useMutation: (options: unknown) => {
    useMutationMock(options);
    return options;
  },
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
    cancelQueries: jest.fn(),
    getQueryData: jest.fn().mockReturnValue(null),
    setQueryData: jest.fn(),
  }),
}));

type MutationOptionsShape = {
  onSuccess?: (_response: unknown, variables: { quoteId: string }) => Promise<void>;
  onSettled?: (
    _response: unknown,
    _error: unknown,
    variables: { quoteId: string }
  ) => Promise<void>;
};

describe("useAdminQuoteActions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    invalidateQueriesMock.mockResolvedValue(undefined);
  });

  it("invalidates quote list/detail queries after patch settles", async () => {
    renderHook(() => useAdminQuotePatchMutation());
    const options = useMutationMock.mock.calls[0]?.[0] as MutationOptionsShape;

    await options.onSettled?.(null, null, { quoteId: "cm1111111111111111111111111" });

    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ["admin", "quotes", "list"],
    });
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ["admin", "quotes", "detail", "cm1111111111111111111111111"],
    });
  });

  it("invalidates quote list/detail queries after generating a payment link", async () => {
    renderHook(() => useAdminGenerateQuotePaymentLinkMutation());
    const options = useMutationMock.mock.calls[0]?.[0] as MutationOptionsShape;

    await options.onSuccess?.(null, { quoteId: "cm1111111111111111111111111" });

    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ["admin", "quotes", "list"],
    });
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ["admin", "quotes", "detail", "cm1111111111111111111111111"],
    });
  });

  it("invalidates quote list/detail queries after revoking a payment link", async () => {
    renderHook(() => useAdminRevokeQuotePaymentLinkMutation());
    const options = useMutationMock.mock.calls[0]?.[0] as MutationOptionsShape;

    await options.onSuccess?.(null, { quoteId: "cm1111111111111111111111111" });

    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ["admin", "quotes", "list"],
    });
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ["admin", "quotes", "detail", "cm1111111111111111111111111"],
    });
  });

  it("returns grouped patch/generate/revoke actions", () => {
    const { result } = renderHook(() => useAdminQuoteActions());

    expect(result.current.patch).toBeTruthy();
    expect(result.current.generate).toBeTruthy();
    expect(result.current.revoke).toBeTruthy();
  });
});
