import { createServer, IncomingMessage, ServerResponse } from "http";
import { fileURLToPath } from "url";
import path from "path";
import { createHTTPHandler } from "@trpc/server/adapters/standalone";
import { umamiRouter } from "./trpc.js";
import { umamiProxyService } from "./UmamiProxyService.js";
import { createLogger } from "./logger.js";

const log = createLogger("umami-server");

const SCRIPT_ROUTE = "/umami/script.js";
const RECORDER_ROUTE = "/umami/recorder.js";
const SEND_ROUTE = "/umami/api/send";
const RECORD_ROUTE = "/umami/api/record";
const TRPC_ROUTE = "/trpc";
const SEND_MAX_BODY_SIZE = 64 * 1024;
const RECORD_MAX_BODY_SIZE = 1024 * 1024;

// Create tRPC HTTP handler
const trpcHandler = createHTTPHandler({
  router: umamiRouter,
  createContext: () => ({}),
});

function getClientIp(req: IncomingMessage): string {
  return (
    req.headers["x-forwarded-for"]?.toString().split(",")[0] ||
    req.socket.remoteAddress?.replace(/^::ffff:/, "") ||
    "unknown"
  );
}

async function handleScriptRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  const urlPath = req.url?.split("?")[0] || "";
  if (urlPath !== SCRIPT_ROUTE) return false;

  const clientIp = getClientIp(req);
  const origin = req.headers.origin;
  const userAgent = req.headers["user-agent"] || "";

  log("info", "script_request", { clientIp, origin, userAgent });

  if (!umamiProxyService.checkOrigin(origin)) {
    log("warn", "script_origin_rejected", { clientIp, origin });
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Forbidden origin" }));
    return true;
  }

  // Set CORS header if origin present
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  try {
    const result = await umamiProxyService.proxyScriptJs();
    log("info", "script_response", {
      clientIp,
      status: result.status,
      bodySize: result.body.length,
    });
    res.writeHead(result.status, result.headers);
    res.end(result.body);
    return true;
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    log("error", "script_error", { clientIp, error: error.message });
    res.writeHead(502, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin || "*",
      "Vary": "Origin",
    });
    res.end(JSON.stringify({ error: "Bad Gateway" }));
    return true;
  }
}

async function handleRecorderRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  const urlPath = req.url?.split("?")[0] || "";
  if (urlPath !== RECORDER_ROUTE) return false;

  const clientIp = getClientIp(req);
  const origin = req.headers.origin;
  const userAgent = req.headers["user-agent"] || "";

  log("info", "recorder_request", { clientIp, origin, userAgent });

  if (!umamiProxyService.checkOrigin(origin)) {
    log("warn", "recorder_origin_rejected", { clientIp, origin });
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Forbidden origin" }));
    return true;
  }

  // Set CORS header if origin present
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  try {
    const result = await umamiProxyService.proxyRecorderJs();
    log("info", "recorder_response", {
      clientIp,
      status: result.status,
      bodySize: result.body.length,
    });
    res.writeHead(result.status, result.headers);
    res.end(result.body);
    return true;
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    log("error", "recorder_error", { clientIp, error: error.message });
    res.writeHead(502, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin || "*",
      "Vary": "Origin",
    });
    res.end(JSON.stringify({ error: "Bad Gateway" }));
    return true;
  }
}

async function handleRecordRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  const urlPath = req.url?.split("?")[0] || "";
  if (urlPath !== RECORD_ROUTE) return false;

  return handleDataRequest(req, res, "record");
}

async function handleDataRequest(
  req: IncomingMessage,
  res: ServerResponse,
  type: "send" | "record"
): Promise<boolean> {
  const clientIp = getClientIp(req);
  const origin = req.headers.origin;
  const userAgent = req.headers["user-agent"] || "";
  const umamiCache = req.headers["x-umami-cache"]?.toString();

  log("info", `${type}_request`, { clientIp, origin, userAgent, hasCache: !!umamiCache });

  // Set CORS headers before validation
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-umami-cache");
    res.setHeader("Vary", "Origin");
  }

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    log("info", `${type}_cors_preflight`, { clientIp, origin });
    res.writeHead(200);
    res.end();
    return true;
  }

  if (!umamiProxyService.checkSendOrigin(origin)) {
    log("warn", `${type}_origin_rejected`, { clientIp, origin });
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Forbidden origin" }));
    return true;
  }

  if (req.method !== "POST") {
    log("warn", `${type}_method_rejected`, { clientIp, method: req.method });
    res.writeHead(405, { "Content-Type": "application/json", Allow: "POST" });
    res.end(JSON.stringify({ error: "Method Not Allowed" }));
    return true;
  }

  // Collect body with size limit
  const chunks: Buffer[] = [];
  let totalSize = 0;
  const maxBodySize = type === "record" ? RECORD_MAX_BODY_SIZE : SEND_MAX_BODY_SIZE;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalSize += buf.length;
    if (totalSize > maxBodySize) {
      log("warn", `${type}_body_too_large`, { clientIp, size: totalSize, limit: maxBodySize });
      res.writeHead(413, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Payload Too Large" }));
      return true;
    }
    chunks.push(buf);
  }
  const bodyStr = Buffer.concat(chunks).toString();

  function getWebsiteIdFromParsed(parsed: unknown): string | undefined {
    if (!parsed || typeof parsed !== "object") {
      return undefined;
    }

    const record = parsed as Record<string, unknown>;
    if (typeof record.website === "string") {
      return record.website;
    }

    const payload = record.payload;
    if (!payload || typeof payload !== "object") {
      return undefined;
    }

    const payloadRecord = payload as Record<string, unknown>;
    return typeof payloadRecord.website === "string"
      ? payloadRecord.website
      : undefined;
  }

  // Validate JSON and extract websiteId
  let websiteId: string | undefined;
  try {
    const parsed = JSON.parse(bodyStr);
    websiteId = getWebsiteIdFromParsed(parsed);
  } catch {
    log("warn", `${type}_invalid_json`, { clientIp, bodyLength: bodyStr.length });
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON" }));
    return true;
  }

  try {
    const result = type === "send"
      ? await umamiProxyService.proxySendRequest(bodyStr, clientIp, userAgent, origin, websiteId, umamiCache)
      : await umamiProxyService.proxyRecordRequest(bodyStr, clientIp, userAgent, origin, websiteId, umamiCache);

    log("info", `${type}_response`, {
      clientIp,
      status: result.status,
      bodySize: result.body.length,
    });
    res.writeHead(result.status, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin || "*",
      "Vary": "Origin",
    });
    res.end(result.body);
    return true;
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    log("error", `${type}_error`, { clientIp, error: error.message });
    res.writeHead(502, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin || "*",
      "Vary": "Origin",
    });
    res.end(JSON.stringify({ error: "Bad Gateway" }));
    return true;
  }
}

export function createUmamiServer(port?: number) {
  function stripTrpcPrefix(url: string): string {
    if (!url.startsWith(TRPC_ROUTE)) {
      return url;
    }

    const withoutPrefix = url.slice(TRPC_ROUTE.length);
    if (withoutPrefix.startsWith("/")) {
      return withoutPrefix;
    }
    if (withoutPrefix.startsWith("?")) {
      return `/${withoutPrefix}`;
    }
    return withoutPrefix.length > 0 ? `/${withoutPrefix}` : "/";
  }

  const server = createServer(async (req, res) => {
    const urlPath = req.url?.split("?")[0] || "";

    // Handle /umami/script.js
    if (urlPath === SCRIPT_ROUTE) {
      await handleScriptRequest(req, res);
      return;
    }

    // Handle /umami/recorder.js
    if (urlPath === RECORDER_ROUTE) {
      await handleRecorderRequest(req, res);
      return;
    }

    // Handle /umami/api/send
    if (urlPath === SEND_ROUTE) {
      await handleDataRequest(req, res, "send");
      return;
    }

    // Handle /umami/api/record
    if (urlPath === RECORD_ROUTE) {
      await handleRecordRequest(req, res);
      return;
    }

    // Handle tRPC routes
    if (urlPath.startsWith(TRPC_ROUTE)) {
      const origin = req.headers.origin;
      const clientIp = getClientIp(req);

      if (origin) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        res.setHeader("Vary", "Origin");
      }

      if (req.method === "OPTIONS") {
        res.writeHead(200);
        res.end();
        return;
      }

      // Allow if no origin (same-origin GET) or if origin is in whitelist
      if (!umamiProxyService.checkOrigin(origin)) {
        log("warn", "trpc_origin_rejected", { clientIp, origin });
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Forbidden origin" }));
        return;
      }

      req.url = stripTrpcPrefix(req.url ?? "/");
      trpcHandler(req, res);
      return;
    }

    // 404 for unmatched routes
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found" }));
  });

  const listenPort = port || Number.parseInt(process.env.PORT || "3000");

  return {
    server,
    listen() {
      server.listen(listenPort);
      log("info", "server_started", { port: listenPort });
    },
    close() {
      umamiProxyService.destroy();
      server.close();
    },
  };
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }

  const currentFile = fileURLToPath(import.meta.url);
  return path.resolve(entry) === path.resolve(currentFile);
}

async function main(): Promise<void> {
  const serverInstance = createUmamiServer();
  serverInstance.listen();
}

// Auto-start only when executed as the program entrypoint.
if (isDirectExecution()) {
  void main();
}
