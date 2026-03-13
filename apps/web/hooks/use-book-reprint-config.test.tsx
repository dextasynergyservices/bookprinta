import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { fetchBookReprintConfig, useBookReprintConfig } from "./use-book-reprint-config";

const throwApiErrorMock = jest.fn();

jest.mock("@/lib/api-error", () => ({
  throwApiError: (...args: unknown[]) => throwApiErrorMock(...args),
}));

const reprintConfig = {
  bookId: "cm1111111111111111111111111",
  canReprintSame: true,
  disableReason: null,
  finalPdfUrlPresent: true,
  pageCount: 128,
  minCopies: 25,
  defaultBookSize: "A5",
  defaultPaperColor: "white",
  defaultLamination: "gloss",
  allowedBookSizes: ["A4", "A5", "A6"],
  allowedPaperColors: ["white", "cream"],
  allowedLaminations: ["matt", "gloss"],
  costPerPageBySize: {
    A4: 20,
    A5: 10,
    A6: 5,
  },
  enabledPaymentProviders: ["PAYSTACK", "STRIPE"],
} as const;

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("use-book-reprint-config data layer", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("fetchBookReprintConfig requests the dedicated reprint-config endpoint and normalizes the payload", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({
        data: reprintConfig,
      }),
    } as unknown as Response);

    const result = await fetchBookReprintConfig({
      bookId: reprintConfig.bookId,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/api/v1/books/${reprintConfig.bookId}/reprint-config`),
      expect.objectContaining({
        method: "GET",
        credentials: "include",
        cache: "no-store",
      })
    );
    expect(result).toEqual(reprintConfig);
  });

  it("delegates failed reprint-config fetches to throwApiError", async () => {
    const expectedError = new Error("Unable to load your reprint settings");
    throwApiErrorMock.mockRejectedValueOnce(expectedError);

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: jest.fn().mockResolvedValue({ message: "Internal Server Error" }),
      headers: { get: jest.fn().mockReturnValue(null) },
    } as unknown as Response);

    await expect(
      fetchBookReprintConfig({
        bookId: reprintConfig.bookId,
      })
    ).rejects.toThrow(expectedError);
    expect(throwApiErrorMock).toHaveBeenCalledTimes(1);
  });

  it("returns normalized config data through the query hook", async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({
        data: reprintConfig,
      }),
    } as unknown as Response);

    const { result } = renderHook(
      () =>
        useBookReprintConfig({
          bookId: reprintConfig.bookId,
        }),
      {
        wrapper: createWrapper(client),
      }
    );

    await waitFor(() => {
      expect(result.current.config).toEqual(reprintConfig);
    });
    expect(result.current.isInitialLoading).toBe(false);
  });
});
