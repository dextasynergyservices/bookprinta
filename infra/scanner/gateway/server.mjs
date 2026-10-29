// BookPrinta scan gateway — a token-protected HTTPS front for clamd.
//
// clamd's TCP protocol has no authentication or encryption, so it must never be
// exposed to the internet. This tiny service (no dependencies) is the only thing
// Caddy forwards to: it checks a shared bearer token, streams the upload into
// clamd with INSTREAM, and answers with JSON.
//
//   POST /scan    body = raw file bytes  → 200 { clean: true }
//                                         → 200 { clean: false, signature: "Eicar-Test-Signature" }
//                                         → 4xx/5xx { error }   (scan did NOT happen)
//   GET  /health                         → 200 { ok: true } when clamd answers PING
//
// Both routes require `Authorization: Bearer <SCANNER_TOKEN>`.

import { timingSafeEqual } from "node:crypto";
import http from "node:http";
import net from "node:net";

const PORT = Number(process.env.PORT ?? 8080);
const CLAMD_HOST = process.env.CLAMD_HOST ?? "clamav";
const CLAMD_PORT = Number(process.env.CLAMD_PORT ?? 3310);
const TOKEN = process.env.SCANNER_TOKEN ?? "";
const MAX_BYTES = Number(process.env.MAX_SCAN_BYTES ?? 15 * 1024 * 1024);
const SCAN_TIMEOUT_MS = Number(process.env.SCAN_TIMEOUT_MS ?? 60_000);

if (TOKEN.length < 32) {
  console.error("SCANNER_TOKEN must be set to at least 32 characters (openssl rand -hex 32)");
  process.exit(1);
}

function authorized(req) {
  const header = req.headers.authorization ?? "";
  const presented = Buffer.from(header.startsWith("Bearer ") ? header.slice(7).trim() : "");
  const expected = Buffer.from(TOKEN);
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function clamdCommand(command, timeoutMs = 5_000) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(CLAMD_PORT, CLAMD_HOST);
    let reply = "";
    socket.setTimeout(timeoutMs, () => socket.destroy(new Error("clamd timeout")));
    socket.on("connect", () => socket.write(`z${command}\0`));
    socket.on("data", (d) => (reply += d.toString()));
    socket.on("end", () => resolve(reply.replace(/\0/g, "").trim()));
    socket.on("error", reject);
  });
}

/** Stream the request body into clamd INSTREAM. Resolves with clamd's verdict line. */
function scanStream(req) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(CLAMD_PORT, CLAMD_HOST);
    let reply = "";
    let received = 0;
    let failed = false;
    const fail = (error) => {
      if (failed) return;
      failed = true;
      socket.destroy();
      req.destroy();
      reject(error);
    };

    socket.setTimeout(SCAN_TIMEOUT_MS, () => fail(new Error("scan timed out")));
    socket.on("error", fail);
    socket.on("data", (d) => (reply += d.toString()));
    socket.on("end", () => !failed && resolve(reply.replace(/\0/g, "").trim()));

    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      req.on("data", (chunk) => {
        received += chunk.length;
        if (received > MAX_BYTES)
          return fail(Object.assign(new Error("file too large"), { status: 413 }));
        const header = Buffer.alloc(4);
        header.writeUInt32BE(chunk.length, 0);
        socket.write(header);
        socket.write(chunk);
      });
      req.on("end", () => socket.write(Buffer.alloc(4))); // zero-length chunk = end of stream
      req.on("error", fail);
    });
  });
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? "/", "http://gateway");

  if (!authorized(req)) return send(res, 401, { error: "unauthorized" });

  if (req.method === "GET" && pathname === "/health") {
    try {
      const pong = await clamdCommand("PING");
      return send(res, pong === "PONG" ? 200 : 503, { ok: pong === "PONG" });
    } catch {
      return send(res, 503, { ok: false });
    }
  }

  if (req.method === "POST" && pathname === "/scan") {
    const declared = Number(req.headers["content-length"] ?? 0);
    if (declared > MAX_BYTES) return send(res, 413, { error: "file too large" });
    try {
      const verdict = await scanStream(req);
      // clamd: "stream: OK" | "stream: <Signature> FOUND" | "<reason> ERROR"
      if (/\bOK$/.test(verdict)) return send(res, 200, { clean: true });
      const found = verdict.match(/^stream:\s*(.+)\s+FOUND$/);
      if (found) return send(res, 200, { clean: false, signature: found[1] });
      // An ERROR is NOT a virus — the file was not scanned. Fail closed upstream.
      return send(res, 502, { error: `clamd error: ${verdict.slice(0, 200)}` });
    } catch (error) {
      return send(res, error.status ?? 502, { error: String(error.message ?? error) });
    }
  }

  return send(res, 404, { error: "not found" });
});

server.requestTimeout = SCAN_TIMEOUT_MS + 10_000;
server.listen(PORT, () =>
  console.log(`scan gateway listening on :${PORT} → clamd ${CLAMD_HOST}:${CLAMD_PORT}`)
);
