import { fetchUserBooksPage, userBooksQueryKeys } from "./useUserBooks";

const throwApiErrorMock = jest.fn();

jest.mock("@/lib/api-error", () => ({
  throwApiError: (...args: unknown[]) => throwApiErrorMock(...args),
}));

describe("useUserBooks data layer", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("fetchUserBooksPage requests /books with credentials and normalizes response", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({
        items: [],
        pagination: {
          page: 1,
          pageSize: 10,
          totalItems: 0,
          totalPages: 0,
          hasPreviousPage: false,
          hasNextPage: false,
        },
      }),
    } as unknown as Response);

    const result = await fetchUserBooksPage({ page: 1, pageSize: 10 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/api/v1/books?page=1&limit=10");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    expect(result.pagination.page).toBe(1);
    expect(result.items).toEqual([]);
  });

  it("delegates non-ok responses to throwApiError", async () => {
    const expectedError = new Error("Unable to load your books");
    throwApiErrorMock.mockRejectedValueOnce(expectedError);

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: jest.fn().mockResolvedValue({ message: "Internal Server Error" }),
      headers: { get: jest.fn().mockReturnValue(null) },
    } as unknown as Response);

    await expect(fetchUserBooksPage()).rejects.toThrow(expectedError);
    expect(throwApiErrorMock).toHaveBeenCalledTimes(1);
  });

  it("returns a friendly message for network failures and exposes stable query keys", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Network down"));

    await expect(fetchUserBooksPage()).rejects.toThrow("Unable to load your books right now");
    expect(userBooksQueryKeys.all).toEqual(["user-books"]);
    expect(userBooksQueryKeys.list(2, 5)).toEqual(["user-books", "list", 2, 5]);
  });
});
