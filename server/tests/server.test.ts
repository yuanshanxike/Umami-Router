import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createUmamiServer } from "../src/index.js";
import { umamiProxyService } from "../src/UmamiProxyService.js";

const WEBSITE_ID = "8fb2e01b-4b56-4233-97ca-01ad7eeb6014";
const UNKNOWN_WEBSITE_ID = "11111111-1111-4111-8111-111111111111";
const ALLOWED_ORIGIN = "https://explore.tooyama.dev";
const DISALLOWED_ORIGIN = "https://evil.example.com";

interface CapturedUpstreamRequest {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

function listenServer(server: Server, port = 0): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Unexpected server address"));
        return;
      }
      resolve(address.port);
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

describe("@umami_router/server integration", () => {
  let upstreamServer: Server;
  let proxyInstance: ReturnType<typeof createUmamiServer>;
  let proxyBaseUrl: string;
  let capturedRequests: CapturedUpstreamRequest[] = [];
  let heartbeatStatus = 200;
  let upstreamSendHeaders: Record<string, string> = {};
  let upstreamSendStatus = 200;

  beforeEach(async () => {
    capturedRequests = [];
    heartbeatStatus = 200;
    upstreamSendHeaders = {};
    upstreamSendStatus = 200;

    upstreamServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const body = Buffer.concat(chunks).toString("utf8");
      const url = req.url ?? "/";

      capturedRequests.push({
        method: req.method ?? "GET",
        url,
        headers: req.headers,
        body,
      });

      if (url === "/api/heartbeat") {
        res.writeHead(heartbeatStatus, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: heartbeatStatus < 400 }));
        return;
      }

      if (url === "/script.js") {
        res.writeHead(200, { "Content-Type": "application/javascript" });
        res.end("console.log('script');");
        return;
      }

      if (url === "/recorder.js") {
        res.writeHead(200, { "Content-Type": "application/javascript" });
        res.end("console.log('recorder');");
        return;
      }

      if (url === `/api/websites/${WEBSITE_ID}/recorder`) {
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        });
        res.end(
          JSON.stringify({
            enabled: true,
            replayEnabled: true,
            heatmapEnabled: true,
            sampleRate: 0.25,
            maskLevel: "strict",
          })
        );
        return;
      }

      if (url === "/api/send" || url === "/api/record") {
        res.writeHead(upstreamSendStatus, {
          "Content-Type": "application/json",
          ...upstreamSendHeaders,
        });
        res.end(
          JSON.stringify({
            cache: "cache-token-v350",
            sessionId: "session-123",
            visitId: "visit-123",
          })
        );
        return;
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not Found" }));
    });

    const upstreamPort = await listenServer(upstreamServer, 0);

    process.env.UMAMI_UPSTREAM_HOST = `127.0.0.1:${upstreamPort}`;
    process.env.UMAMI_WEBSITE_IDS = WEBSITE_ID;
    process.env.UMAMI_ALLOWED_ORIGINS = ALLOWED_ORIGIN;
    process.env.UMAMI_HEALTH_CACHE_TTL_MS = "0";
    process.env.UMAMI_RATE_LIMIT_MAX = "5";
    process.env.UMAMI_RATE_LIMIT_WINDOW_MS = "60000";

    umamiProxyService.destroy();
    proxyInstance = createUmamiServer(0);
    const proxyPort = await listenServer(proxyInstance.server, 0);
    proxyBaseUrl = `http://127.0.0.1:${proxyPort}`;
  });

  afterEach(async () => {
    umamiProxyService.destroy();
    await closeServer(proxyInstance.server);
    await closeServer(upstreamServer);
  });

  it("proxies /umami/script.js and /umami/recorder.js and rejects disallowed origins without ACAO", async () => {
    const scriptRes = await fetch(`${proxyBaseUrl}/umami/script.js`);
    expect(scriptRes.status).toBe(200);
    expect(await scriptRes.text()).toContain("script");

    const recorderRes = await fetch(`${proxyBaseUrl}/umami/recorder.js`, {
      headers: { Origin: ALLOWED_ORIGIN },
    });
    expect(recorderRes.status).toBe(200);
    expect(recorderRes.headers.get("access-control-allow-origin")).toBe(ALLOWED_ORIGIN);

    const rejectedRes = await fetch(`${proxyBaseUrl}/umami/script.js`, {
      headers: { Origin: DISALLOWED_ORIGIN },
    });
    expect(rejectedRes.status).toBe(403);
    expect(rejectedRes.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("handles /umami/api/websites/:id/recorder routing, origin checks, and validation", async () => {
    const validRes = await fetch(`${proxyBaseUrl}/umami/api/websites/${WEBSITE_ID}/recorder`, {
      headers: { Origin: ALLOWED_ORIGIN },
    });
    expect(validRes.status).toBe(200);
    expect(validRes.headers.get("access-control-allow-origin")).toBe(ALLOWED_ORIGIN);
    const validJson = await validRes.json();
    expect(validJson).toMatchObject({ enabled: true, replayEnabled: true, heatmapEnabled: true });

    const unknownRes = await fetch(
      `${proxyBaseUrl}/umami/api/websites/${UNKNOWN_WEBSITE_ID}/recorder`
    );
    expect(unknownRes.status).toBe(400);

    const invalidUuidRes = await fetch(`${proxyBaseUrl}/umami/api/websites/not-a-uuid/recorder`);
    expect(invalidUuidRes.status).toBe(404);

    const methodRes = await fetch(`${proxyBaseUrl}/umami/api/websites/${WEBSITE_ID}/recorder`, {
      method: "POST",
    });
    expect(methodRes.status).toBe(405);

    const disallowedRes = await fetch(
      `${proxyBaseUrl}/umami/api/websites/${WEBSITE_ID}/recorder`,
      { headers: { Origin: DISALLOWED_ORIGIN } }
    );
    expect(disallowedRes.status).toBe(403);
    expect(disallowedRes.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("enforces CORS ordering and allows v3.5.0 headers on OPTIONS /umami/api/send", async () => {
    const allowedPreflight = await fetch(`${proxyBaseUrl}/umami/api/send`, {
      method: "OPTIONS",
      headers: { Origin: ALLOWED_ORIGIN },
    });
    expect(allowedPreflight.status).toBe(200);
    expect(allowedPreflight.headers.get("access-control-allow-origin")).toBe(ALLOWED_ORIGIN);
    const allowHeaders = allowedPreflight.headers.get("access-control-allow-headers") || "";
    expect(allowHeaders).toContain("x-umami-cache");
    expect(allowHeaders).toContain("x-umami-website-id");
    expect(allowHeaders).toContain("x-umami-hostname");
    expect(allowedPreflight.headers.get("access-control-expose-headers")).toBe("Retry-After");

    const disallowedPreflight = await fetch(`${proxyBaseUrl}/umami/api/send`, {
      method: "OPTIONS",
      headers: { Origin: DISALLOWED_ORIGIN },
    });
    expect(disallowedPreflight.status).toBe(403);
    expect(disallowedPreflight.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("forwards x-umami-* headers for event/error/performance and enforces validation & rate limits", async () => {
    const sendPayloads = [
      { type: "event", payload: { website: WEBSITE_ID, url: "/" } },
      { type: "error", payload: { website: WEBSITE_ID, message: "Boom", version: 1 } },
      { type: "performance", payload: { website: WEBSITE_ID, lcp: 820 } },
    ];

    for (const payload of sendPayloads) {
      const res = await fetch(`${proxyBaseUrl}/umami/api/send`, {
        method: "POST",
        headers: {
          Origin: ALLOWED_ORIGIN,
          "Content-Type": "application/json",
          "x-umami-cache": "cache-abc",
          "x-umami-website-id": WEBSITE_ID,
          "x-umami-hostname": "explore.tooyama.dev",
        },
        body: JSON.stringify(payload),
      });
      expect(res.status).toBe(200);
    }

    const sendCaptured = capturedRequests.filter((r) => r.url === "/api/send");
    expect(sendCaptured).toHaveLength(3);
    for (const req of sendCaptured) {
      expect(req.headers["x-umami-cache"]).toBe("cache-abc");
      expect(req.headers["x-umami-website-id"]).toBe(WEBSITE_ID);
      expect(req.headers["x-umami-hostname"]).toBe("explore.tooyama.dev");
    }

    const badJsonRes = await fetch(`${proxyBaseUrl}/umami/api/send`, {
      method: "POST",
      headers: { Origin: ALLOWED_ORIGIN, "Content-Type": "application/json" },
      body: "{bad-json",
    });
    expect(badJsonRes.status).toBe(400);

    const unknownSiteRes = await fetch(`${proxyBaseUrl}/umami/api/send`, {
      method: "POST",
      headers: { Origin: ALLOWED_ORIGIN, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "event", payload: { website: UNKNOWN_WEBSITE_ID } }),
    });
    expect(unknownSiteRes.status).toBe(400);

    const noOriginRes = await fetch(`${proxyBaseUrl}/umami/api/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "event", payload: { website: WEBSITE_ID } }),
    });
    expect(noOriginRes.status).toBe(403);

    const largeRes = await fetch(`${proxyBaseUrl}/umami/api/send`, {
      method: "POST",
      headers: { Origin: ALLOWED_ORIGIN, "Content-Type": "application/json" },
      body: "a".repeat(65 * 1024),
    });
    expect(largeRes.status).toBe(413);

    // Exhaust remaining rate limit (5 max; 4 valid/unknown-website requests already counted)
    const fifthRes = await fetch(`${proxyBaseUrl}/umami/api/send`, {
      method: "POST",
      headers: { Origin: ALLOWED_ORIGIN, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "event", payload: { website: WEBSITE_ID } }),
    });
    expect(fifthRes.status).toBe(200);

    const rateLimitedRes = await fetch(`${proxyBaseUrl}/umami/api/send`, {
      method: "POST",
      headers: { Origin: ALLOWED_ORIGIN, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "event", payload: { website: WEBSITE_ID } }),
    });
    expect(rateLimitedRes.status).toBe(429);
    expect(rateLimitedRes.headers.get("retry-after")).toBe("60");
  });

  it("forwards record and heatmap payloads to /api/record", async () => {
    for (const type of ["record", "heatmap"]) {
      const res = await fetch(`${proxyBaseUrl}/umami/api/record`, {
        method: "POST",
        headers: {
          Origin: ALLOWED_ORIGIN,
          "Content-Type": "application/json",
          "x-umami-cache": "cache-record",
        },
        body: JSON.stringify({ type, payload: { website: WEBSITE_ID, events: [] } }),
      });
      expect(res.status).toBe(200);
    }

    const recordCaptured = capturedRequests.filter((r) => r.url === "/api/record");
    expect(recordCaptured).toHaveLength(2);
    expect(recordCaptured[0].headers["x-umami-cache"]).toBe("cache-record");
  });

  it("returns real /api/heartbeat probe results from /trpc/getHealth and serves /trpc/getConfig", async () => {
    const configRes = await fetch(`${proxyBaseUrl}/trpc/getConfig`);
    expect(configRes.status).toBe(200);
    const configJson = await configRes.json();
    expect(configJson.result.data).toEqual({
      websiteId: WEBSITE_ID,
      apiPath: "/umami/api/send",
      scriptPath: "/umami/script.js",
      recorderPath: "/umami/recorder.js",
      proxyPath: "/trpc",
    });

    const healthyRes = await fetch(`${proxyBaseUrl}/trpc/getHealth`);
    expect(healthyRes.status).toBe(200);
    const healthyJson = await healthyRes.json();
    expect(healthyJson.result.data.upstreamReachable).toBe(true);
    expect(typeof healthyJson.result.data.upstreamLatencyMs).toBe("number");
    expect(healthyJson.result.data.managedWebsites).toEqual([WEBSITE_ID]);

    heartbeatStatus = 500;
    const unhealthyRes = await fetch(`${proxyBaseUrl}/trpc/getHealth`);
    expect(unhealthyRes.status).toBe(200);
    const unhealthyJson = await unhealthyRes.json();
    expect(unhealthyJson.result.data.upstreamReachable).toBe(false);
    expect(typeof unhealthyJson.result.data.upstreamLatencyMs).toBe("number");

    await closeServer(upstreamServer);
    const unreachableRes = await fetch(`${proxyBaseUrl}/trpc/getHealth`);
    expect(unreachableRes.status).toBe(200);
    const unreachableJson = await unreachableRes.json();
    expect(unreachableJson.result.data.upstreamReachable).toBe(false);
    expect(unreachableJson.result.data.upstreamLatencyMs).toBeNull();
  });
});
