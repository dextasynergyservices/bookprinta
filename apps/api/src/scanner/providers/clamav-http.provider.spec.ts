/// <reference types="jest" />
import * as net from "node:net";
import { ClamavProvider } from "./clamav.provider.js";
import { ClamavHttpProvider } from "./clamav-http.provider.js";

function json(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

describe("ClamavHttpProvider (remote scan gateway)", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("sends the bytes with the bearer token and reports a clean file", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(json(200, { clean: true })) as unknown as typeof fetch;
    const provider = new ClamavHttpProvider("https://scan.example.com/", "tok");

    await expect(provider.scanBuffer(Buffer.from("hello"), "m.docx")).resolves.toEqual({
      clean: true,
    });

    const [url, init] = (global.fetch as unknown as jest.Mock).mock.calls[0];
    expect(url).toBe("https://scan.example.com/scan");
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe("Bearer tok");
  });

  it("reports an infected file with its signature", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        json(200, { clean: false, signature: "Eicar-Test-Signature" })
      ) as unknown as typeof fetch;
    const provider = new ClamavHttpProvider("https://scan.example.com", "tok");

    await expect(provider.scanBuffer(Buffer.from("x"), "bad.pdf")).resolves.toEqual({
      clean: false,
      reason: "Eicar-Test-Signature",
    });
  });

  it.each([
    [502, { error: "clamd error: INSTREAM size limit exceeded. ERROR" }],
    [401, { error: "unauthorized" }],
    [200, { unexpected: true }],
  ])("throws (upload blocked) when the gateway answers %s", async (status, body) => {
    global.fetch = jest.fn().mockResolvedValue(json(status, body)) as unknown as typeof fetch;
    const provider = new ClamavHttpProvider("https://scan.example.com", "tok");
    await expect(provider.scanBuffer(Buffer.from("x"), "m.docx")).rejects.toThrow(
      "Scan gateway failed"
    );
  });

  it("caches a healthy probe, and re-probes after a failed scan", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(json(200, { ok: true }))
      .mockResolvedValueOnce(json(502, { error: "down" }))
      .mockResolvedValueOnce(json(503, { ok: false }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const provider = new ClamavHttpProvider("https://scan.example.com", "tok");

    await expect(provider.isAvailable()).resolves.toBe(true);
    await expect(provider.isAvailable()).resolves.toBe(true); // cached
    await expect(provider.scanBuffer(Buffer.from("x"), "m")).rejects.toThrow();
    await expect(provider.isAvailable()).resolves.toBe(false); // re-probed
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("treats an unreachable gateway as unavailable", async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error("ECONNREFUSED")) as unknown as typeof fetch;
    await expect(
      new ClamavHttpProvider("https://scan.example.com", "tok").isAvailable()
    ).resolves.toBe(false);
  });
});

describe("ClamavProvider (TCP) error handling", () => {
  // A fake clamd that answers every INSTREAM with a fixed line.
  function fakeClamd(reply: string): Promise<{ port: number; close: () => void }> {
    return new Promise((resolve) => {
      const server = net.createServer((socket) => {
        socket.once("data", () => socket.end(`${reply}\0`));
      });
      server.listen(0, "127.0.0.1", () =>
        resolve({ port: (server.address() as net.AddressInfo).port, close: () => server.close() })
      );
    });
  }

  it("rejects (does NOT report a virus) when clamd answers ERROR", async () => {
    const clamd = await fakeClamd("INSTREAM size limit exceeded. ERROR");
    const provider = new ClamavProvider("127.0.0.1", clamd.port, 5_000);
    await expect(provider.scanBuffer(Buffer.from("x"), "big.pdf")).rejects.toThrow(
      "ClamAV scan error"
    );
    clamd.close();
  });

  it("still reports a real detection as infected", async () => {
    const clamd = await fakeClamd("stream: Eicar-Test-Signature FOUND");
    const provider = new ClamavProvider("127.0.0.1", clamd.port, 5_000);
    await expect(provider.scanBuffer(Buffer.from("x"), "bad.pdf")).resolves.toEqual({
      clean: false,
      reason: "Eicar-Test-Signature",
    });
    clamd.close();
  });
});
