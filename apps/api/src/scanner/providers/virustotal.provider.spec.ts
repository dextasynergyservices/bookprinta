/// <reference types="jest" />
import { VirusTotalProvider } from "./virustotal.provider.js";

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (key: string) => headers[key.toLowerCase()] ?? null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const uploaded = (id: string) => json({ data: { id } });
const completed = (malicious = 0) =>
  json({ data: { attributes: { status: "completed", stats: { malicious, suspicious: 0 } } } });

describe("VirusTotalProvider", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
  });

  it("reports a clean file", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(uploaded("a1"))
      .mockResolvedValueOnce(completed()) as unknown as typeof fetch;

    const provider = new VirusTotalProvider("key", 4);
    await expect(provider.scanBuffer(Buffer.from("x"), "m.docx")).resolves.toEqual({ clean: true });
  });

  it("flags an infected file", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(uploaded("a1"))
      .mockResolvedValueOnce(completed(3)) as unknown as typeof fetch;

    const provider = new VirusTotalProvider("key", 4);
    await expect(provider.scanBuffer(Buffer.from("x"), "m.docx")).resolves.toMatchObject({
      clean: false,
    });
  });

  it("never exceeds the per-minute request budget", async () => {
    const calls: number[] = [];
    global.fetch = jest.fn(async (url: string) => {
      calls.push(Date.now());
      return String(url).endsWith("/files") ? uploaded(`id${calls.length}`) : completed();
    }) as unknown as typeof fetch;

    const provider = new VirusTotalProvider("key", 2);
    // Three scans = 6 requests at 2/min → must span at least two full minutes.
    const scans = Promise.all([1, 2, 3].map((n) => provider.scanBuffer(Buffer.from("x"), `${n}`)));
    await jest.advanceTimersByTimeAsync(180_000);
    await expect(scans).resolves.toHaveLength(3);

    expect(calls).toHaveLength(6);
    for (let i = 2; i < calls.length; i++) {
      expect((calls[i] ?? 0) - (calls[i - 2] ?? 0)).toBeGreaterThanOrEqual(60_000);
    }
  });

  it("waits out a 429 using Retry-After instead of failing the upload", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(json({}, 429, { "retry-after": "20" }))
      .mockResolvedValueOnce(uploaded("a1"))
      .mockResolvedValueOnce(completed()) as unknown as typeof fetch;

    const provider = new VirusTotalProvider("key", 10);
    const scan = provider.scanBuffer(Buffer.from("x"), "m.docx");
    await jest.advanceTimersByTimeAsync(25_000);
    await expect(scan).resolves.toEqual({ clean: true });
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it("keeps processing queued scans after one fails", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(json({ error: "bad" }, 400))
      .mockResolvedValueOnce(uploaded("a2"))
      .mockResolvedValueOnce(completed()) as unknown as typeof fetch;

    const provider = new VirusTotalProvider("key", 10);
    const first = provider.scanBuffer(Buffer.from("x"), "1");
    const second = provider.scanBuffer(Buffer.from("y"), "2");
    await expect(first).rejects.toThrow("upload failed (400)");
    await expect(second).resolves.toEqual({ clean: true });
  });

  it("caches the availability probe", async () => {
    global.fetch = jest.fn().mockResolvedValue(json({})) as unknown as typeof fetch;
    const provider = new VirusTotalProvider("key", 4);
    await provider.isAvailable();
    await provider.isAvailable();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
