/**
 * Concurrent 401s must trigger exactly ONE token refresh.
 *
 * The API rotates refresh tokens, so each `/auth/refresh` invalidates the
 * previous one. Without coordination, the dashboard's parallel queries all 401
 * together, each refreshes with the same token, and the last database write and
 * the last response-set cookie can disagree — leaving a cookie that no longer
 * matches the stored digest. The user keeps working for 15 minutes on the access
 * token they got, then gets logged out at the next refresh, with no obvious
 * cause.
 */
import { fetchWithRefreshRetry } from "./fetch-with-refresh";

const REQUEST_URL = "https://api.test/api/v1/books";
const REFRESH_URL = "https://api.test/api/v1/auth/refresh";

function response(status: number): Response {
  return { status, ok: status >= 200 && status < 300 } as Response;
}

/** Defers resolution so several callers can pile up on one in-flight refresh. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("fetchWithRefreshRetry", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(async () => {
    // Let any in-flight refresh settle so module state does not leak between
    // tests (the single-flight promise is module-scoped by design).
    await Promise.resolve();
    jest.resetAllMocks();
  });

  it("passes through a successful response without refreshing", async () => {
    fetchMock.mockResolvedValueOnce(response(200));

    const result = await fetchWithRefreshRetry(REQUEST_URL, REFRESH_URL, {});

    expect(result.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refreshes once and retries the original request on 401", async () => {
    fetchMock
      .mockResolvedValueOnce(response(401)) // original
      .mockResolvedValueOnce(response(200)) // refresh
      .mockResolvedValueOnce(response(200)); // retry

    const result = await fetchWithRefreshRetry(REQUEST_URL, REFRESH_URL, {});

    expect(result.status).toBe(200);
    const refreshCalls = fetchMock.mock.calls.filter(([url]) => url === REFRESH_URL);
    expect(refreshCalls).toHaveLength(1);
  });

  it("issues ONE refresh for many simultaneous 401s", async () => {
    const refresh = deferred<Response>();

    fetchMock.mockImplementation((url: string) => {
      if (url === REFRESH_URL) return refresh.promise;
      // Every original request 401s; every retry succeeds.
      const priorOriginals = fetchMock.mock.calls.filter(([u]) => u === REQUEST_URL).length;
      return Promise.resolve(response(priorOriginals <= 4 ? 401 : 200));
    });

    const inFlight = [
      fetchWithRefreshRetry(REQUEST_URL, REFRESH_URL, {}),
      fetchWithRefreshRetry(REQUEST_URL, REFRESH_URL, {}),
      fetchWithRefreshRetry(REQUEST_URL, REFRESH_URL, {}),
      fetchWithRefreshRetry(REQUEST_URL, REFRESH_URL, {}),
    ];

    // Let all four reach the refresh step before it resolves.
    await Promise.resolve();
    await Promise.resolve();

    refresh.resolve(response(200));
    await Promise.all(inFlight);

    const refreshCalls = fetchMock.mock.calls.filter(([url]) => url === REFRESH_URL);
    // The whole point: four concurrent 401s, one rotation. Four would race and
    // leave the cookie out of step with the stored digest.
    expect(refreshCalls).toHaveLength(1);
  });

  it("starts a NEW refresh for a later, separate expiry", async () => {
    // The shared promise must be cleared once settled, or the session could
    // never be refreshed again after the first time.
    fetchMock
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(200))
      .mockResolvedValueOnce(response(200));
    await fetchWithRefreshRetry(REQUEST_URL, REFRESH_URL, {});

    fetchMock
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(200))
      .mockResolvedValueOnce(response(200));
    await fetchWithRefreshRetry(REQUEST_URL, REFRESH_URL, {});

    const refreshCalls = fetchMock.mock.calls.filter(([url]) => url === REFRESH_URL);
    expect(refreshCalls).toHaveLength(2);
  });

  it("returns the original 401 when the refresh is rejected", async () => {
    fetchMock.mockResolvedValueOnce(response(401)).mockResolvedValueOnce(response(401)); // refresh refused

    const result = await fetchWithRefreshRetry(REQUEST_URL, REFRESH_URL, {});

    expect(result.status).toBe(401);
    // No retry — the session is genuinely gone.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns the original 401 when the refresh call throws", async () => {
    fetchMock.mockResolvedValueOnce(response(401)).mockRejectedValueOnce(new Error("network down"));

    // Must not surface a network error to the UI as an unhandled rejection.
    await expect(fetchWithRefreshRetry(REQUEST_URL, REFRESH_URL, {})).resolves.toMatchObject({
      status: 401,
    });
  });

  it("does not loop when the retry also 401s", async () => {
    fetchMock
      .mockResolvedValueOnce(response(401)) // original
      .mockResolvedValueOnce(response(200)) // refresh succeeded
      .mockResolvedValueOnce(response(401)); // retry still rejected

    const result = await fetchWithRefreshRetry(REQUEST_URL, REFRESH_URL, {});

    expect(result.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
