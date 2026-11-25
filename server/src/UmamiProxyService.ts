import { SlidingWindowRateLimiter } from "./rate-limiter.js";
import { createLogger } from "./logger.js";

const log = createLogger("umami-proxy");

export interface UmamiConfig {
  websiteId: string;
  apiPath: string;
  scriptPath: string;
  recorderPath: string;
  proxyPath: string;
}

export interface ProxyHealth {
  upstreamReachable: boolean;
  upstreamLatencyMs: number | null;
  rateLimitRemaining: number;
  managedWebsites: string[];
}

export interface ScriptResult {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}

export interface SendResult {
  status: number;
  headers?: Record<string, string>;
  body: Buffer;
}

export interface DataForwardHeaders {
  umamiCache?: string;
  umamiWebsiteId?: string;
  umamiHostname?: string;
}

interface UpstreamHealthStatus {
  upstreamReachable: boolean;
  upstreamLatencyMs: number | null;
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }
  const code = Reflect.get(error, "code");
  return typeof code === "string" ? code : undefined;
}

export class UmamiProxyService {
  private upstreamBase!: string;
  private scriptPath = "/script.js";
  private recorderPath = "/recorder.js";
  private sendPath = "/api/send";
  private recordPath = "/api/record";
  private timeoutMs!: number;
  private rateLimitWindowMs = 60000;
  private healthCacheTtlMs = 15000;
  private healthCache: (UpstreamHealthStatus & { checkedAt: number }) | null = null;
  private inflightHealthCheck: Promise<UpstreamHealthStatus> | null = null;
  private originWhitelist!: Set<string>;
  private rateLimiter!: SlidingWindowRateLimiter;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private _initialized = false;
  private websiteIds: string[] = [];

  constructor() {
    // Delayed initialization
  }

  private ensureInitialized(): void {
    if (this._initialized) return;

    const upstreamHost = process.env.UMAMI_UPSTREAM_HOST;
    if (!upstreamHost) {
      throw new Error("UMAMI_UPSTREAM_HOST environment variable is required");
    }

    this.upstreamBase = `http://${upstreamHost}`;
    const parsedTimeout = Number.parseInt(process.env.UMAMI_TIMEOUT_MS || "5000", 10);
    this.timeoutMs = Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 5000;

    const parsedHealthTtl = Number.parseInt(
      process.env.UMAMI_HEALTH_CACHE_TTL_MS ?? "15000",
      10
    );
    this.healthCacheTtlMs =
      Number.isFinite(parsedHealthTtl) && parsedHealthTtl >= 0 ? parsedHealthTtl : 15000;

    // Support multiple website IDs (comma-separated)
    const websiteIdsEnv =
      process.env.UMAMI_WEBSITE_IDS || process.env.UMAMI_WEBSITE_ID || "";
    this.websiteIds = websiteIdsEnv
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    // Custom script paths if provided
    this.scriptPath = process.env.UMAMI_SCRIPT_PATH || "/script.js";
    this.recorderPath = process.env.UMAMI_RECORDER_PATH || "/recorder.js";

    const whitelistEnv = process.env.UMAMI_ALLOWED_ORIGINS || "";
    this.originWhitelist = new Set(
      whitelistEnv.split(",").map((o) => o.trim()).filter(Boolean)
    );

    const parsedRateLimitWindow = Number.parseInt(
      process.env.UMAMI_RATE_LIMIT_WINDOW_MS || "60000",
      10
    );
    const rateLimitWindow =
      Number.isFinite(parsedRateLimitWindow) && parsedRateLimitWindow > 0
        ? parsedRateLimitWindow
        : 60000;
    this.rateLimitWindowMs = rateLimitWindow;

    const parsedRateLimitMax = Number.parseInt(
      process.env.UMAMI_RATE_LIMIT_MAX || "100",
      10
    );
    const rateLimitMax =
      Number.isFinite(parsedRateLimitMax) && parsedRateLimitMax > 0
        ? parsedRateLimitMax
        : 100;

    this.rateLimiter = new SlidingWindowRateLimiter({
      windowMs: rateLimitWindow,
      maxRequests: rateLimitMax,
    });

    this.cleanupInterval = setInterval(
      () => this.rateLimiter.cleanup(),
      rateLimitWindow
    );
    this._initialized = true;

    log("info", "service_initialized", {
      upstreamBase: this.upstreamBase,
      websiteIds: this.websiteIds,
      timeoutMs: this.timeoutMs,
      healthCacheTtlMs: this.healthCacheTtlMs,
    });
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.healthCache = null;
    this.inflightHealthCheck = null;
    this._initialized = false;
  }

  getConfig(websiteId?: string): UmamiConfig {
    this.ensureInitialized();

    // Use provided websiteId if valid, otherwise fallback to first managed ID
    let resolvedWebsiteId = websiteId;
    if (!resolvedWebsiteId || !this.isValidWebsite(resolvedWebsiteId)) {
      resolvedWebsiteId = this.websiteIds[0] || process.env.UMAMI_WEBSITE_ID || "";
    }

    return {
      websiteId: resolvedWebsiteId,
      apiPath: "/umami/api/send",
      scriptPath: "/umami/script.js",
      recorderPath: "/umami/recorder.js",
      proxyPath: "/trpc", // This should match TRPC_ROUTE in index.ts
    };
  }

  async getHealth(): Promise<ProxyHealth> {
    this.ensureInitialized();
    const upstreamStatus = await this.checkUpstreamHealth();
    return {
      upstreamReachable: upstreamStatus.upstreamReachable,
      upstreamLatencyMs: upstreamStatus.upstreamLatencyMs,
      rateLimitRemaining: this.rateLimiter.getGlobalRemaining(),
      managedWebsites: this.websiteIds,
    };
  }

  private async checkUpstreamHealth(): Promise<UpstreamHealthStatus> {
    if (
      this.healthCacheTtlMs > 0 &&
      this.healthCache &&
      Date.now() - this.healthCache.checkedAt < this.healthCacheTtlMs
    ) {
      return {
        upstreamReachable: this.healthCache.upstreamReachable,
        upstreamLatencyMs: this.healthCache.upstreamLatencyMs,
      };
    }

    if (this.inflightHealthCheck) {
      return this.inflightHealthCheck;
    }

    this.inflightHealthCheck = this.probeUpstreamHeartbeat().finally(() => {
      this.inflightHealthCheck = null;
    });

    return this.inflightHealthCheck;
  }

  private async probeUpstreamHeartbeat(): Promise<UpstreamHealthStatus> {
    const heartbeatUrl = `${this.upstreamBase}/api/heartbeat`;
    const probeTimeoutMs = Math.min(this.timeoutMs, 3000);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), probeTimeoutMs);
    const startedAt = performance.now();

    try {
      const response = await fetch(heartbeatUrl, {
        method: "GET",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Umami Proxy Health/1.0)",
        },
      });
      const latencyMs = Math.round(performance.now() - startedAt);
      const status: UpstreamHealthStatus = {
        upstreamReachable: response.ok,
        upstreamLatencyMs: latencyMs,
      };
      if (this.healthCacheTtlMs > 0) {
        this.healthCache = { ...status, checkedAt: Date.now() };
      }
      return status;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log("warn", "health_probe_failed", {
        upstream: heartbeatUrl,
        error: err.message,
        code: getErrorCode(error),
      });
      const status: UpstreamHealthStatus = {
        upstreamReachable: false,
        upstreamLatencyMs: null,
      };
      if (this.healthCacheTtlMs > 0) {
        this.healthCache = { ...status, checkedAt: Date.now() };
      }
      return status;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Check origin for script.js requests.
   * - No origin header (undefined): Allow - browser's same-origin script loading doesn't send Origin
   * - Whitelist configured: Only allow listed origins
   */
  checkOrigin(origin: string | undefined): boolean {
    this.ensureInitialized();
    // No origin header - allow (normal <script> tag loading)
    if (!origin) return true;
    // Check membership in whitelist
    return this.originWhitelist.has(origin);
  }

  /**
   * Check origin for /api/send requests.
   * - No origin: Reject (API calls must have origin)
   * - Whitelist configured: Only allow listed origins
   */
  checkSendOrigin(origin: string | undefined): boolean {
    this.ensureInitialized();
    // API requests must have origin
    if (!origin) return false;
    // Check membership in whitelist
    return this.originWhitelist.has(origin);
  }

  isValidWebsite(websiteId: string): boolean {
    this.ensureInitialized();
    if (this.websiteIds.length === 0) return true; // Allow all if no IDs configured
    return this.websiteIds.includes(websiteId);
  }

  async proxyScriptJs(): Promise<ScriptResult> {
    return this.proxyStaticAsset(this.scriptPath, "script");
  }

  async proxyRecorderJs(): Promise<ScriptResult> {
    return this.proxyStaticAsset(this.recorderPath, "recorder");
  }

  async proxyRecorderConfig(websiteId: string, clientIp = "unknown"): Promise<SendResult> {
    this.ensureInitialized();

    if (!this.rateLimiter.isAllowed(clientIp)) {
      const retryAfterSeconds = String(Math.max(1, Math.ceil(this.rateLimitWindowMs / 1000)));
      log("warn", "rate_limited", { clientIp, type: "recorder_config", websiteId });
      return {
        status: 429,
        headers: {
          "Retry-After": retryAfterSeconds,
        },
        body: Buffer.from(JSON.stringify({ error: "Too Many Requests" })),
      };
    }

    if (!this.isValidWebsite(websiteId)) {
      log("warn", "invalid_website_recorder", { websiteId });
      return {
        status: 400,
        body: Buffer.from(
          JSON.stringify({ error: "Unknown website ID" })
        ),
      };
    }

    const upstreamUrl = `${this.upstreamBase}/api/websites/${encodeURIComponent(websiteId)}/recorder`;

    log("info", "proxy_request", {
      type: "recorder_config",
      upstream: upstreamUrl,
      websiteId,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(upstreamUrl, {
        method: "GET",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Umami Proxy/1.0)",
        },
      });

      const body = Buffer.from(await response.arrayBuffer());
      const headers: Record<string, string> = {
        "Content-Type": response.headers.get("content-type") || "application/json",
        "Cache-Control": response.headers.get("cache-control") || "no-cache",
      };
      const retryAfter = response.headers.get("retry-after");
      if (retryAfter) {
        headers["Retry-After"] = retryAfter;
      }

      log("info", "proxy_success", {
        type: "recorder_config",
        status: response.status,
        bodySize: body.length,
      });

      return { status: response.status, headers, body };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log("error", "proxy_error", {
        type: "recorder_config",
        error: err.message,
        code: getErrorCode(error),
      });
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async proxyStaticAsset(assetPath: string, logLabel: string): Promise<ScriptResult> {
    this.ensureInitialized();
    const upstreamUrl = `${this.upstreamBase}${assetPath}`;

    log("info", "proxy_request", {
      type: logLabel,
      upstream: upstreamUrl,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(upstreamUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Umami Proxy/1.0)",
        },
      });

      const body = Buffer.from(await response.arrayBuffer());
      const headers: Record<string, string> = {};

      const allowedHeaders = [
        "content-type",
        "content-length",
        "cache-control",
        "etag",
        "date",
      ];
      for (const header of allowedHeaders) {
        const value = response.headers.get(header);
        if (value) headers[header] = value;
      }

      log("info", "proxy_success", {
        type: logLabel,
        status: response.status,
        bodySize: body.length,
      });

      return { status: response.status, headers, body };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log("error", "proxy_error", {
        type: logLabel,
        error: err.message,
        code: getErrorCode(error),
      });
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async proxyRecordRequest(
    body: string,
    clientIp: string,
    userAgent: string,
    origin: string | undefined,
    websiteId?: string,
    umamiCache?: string,
    extraHeaders?: Omit<DataForwardHeaders, "umamiCache">
  ): Promise<SendResult> {
    return this.proxyDataRequest(
      body,
      clientIp,
      userAgent,
      origin,
      "record",
      this.recordPath,
      websiteId,
      { umamiCache, ...extraHeaders }
    );
  }

  async proxySendRequest(
    body: string,
    clientIp: string,
    userAgent: string,
    origin: string | undefined,
    websiteId?: string,
    umamiCache?: string,
    extraHeaders?: Omit<DataForwardHeaders, "umamiCache">
  ): Promise<SendResult> {
    return this.proxyDataRequest(
      body,
      clientIp,
      userAgent,
      origin,
      "send",
      this.sendPath,
      websiteId,
      { umamiCache, ...extraHeaders }
    );
  }

  private async proxyDataRequest(
    body: string,
    clientIp: string,
    userAgent: string,
    origin: string | undefined,
    logLabel: string,
    assetPath: string,
    websiteId?: string,
    forwardHeaders: DataForwardHeaders = {}
  ): Promise<SendResult> {
    this.ensureInitialized();

    // Rate limit check
    if (!this.rateLimiter.isAllowed(clientIp)) {
      const retryAfterSeconds = String(Math.max(1, Math.ceil(this.rateLimitWindowMs / 1000)));
      log("warn", "rate_limited", { clientIp, origin, type: logLabel });
      return {
        status: 429,
        headers: {
          "Retry-After": retryAfterSeconds,
        },
        body: Buffer.from(JSON.stringify({ error: "Too Many Requests" })),
      };
    }

    // Validate website ID if provided
    if (websiteId && !this.isValidWebsite(websiteId)) {
      log("warn", "invalid_website", { clientIp, websiteId });
      return {
        status: 400,
        body: Buffer.from(
          JSON.stringify({ error: "Unknown website ID" })
        ),
      };
    }

    const upstreamUrl = `${this.upstreamBase}${assetPath}`;

    log("info", "proxy_request", {
      type: logLabel,
      upstream: upstreamUrl,
      clientIp,
      hasOrigin: !!origin,
      websiteId,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "User-Agent": userAgent || "Mozilla/5.0 (compatible; Umami Proxy/1.0)",
        "X-Forwarded-For": clientIp,
        "X-Real-IP": clientIp,
      };
      // Forward x-umami-* headers when present (session cache & v3.5.0 metadata)
      if (forwardHeaders.umamiCache) {
        headers["x-umami-cache"] = forwardHeaders.umamiCache;
      }
      if (forwardHeaders.umamiWebsiteId) {
        headers["x-umami-website-id"] = forwardHeaders.umamiWebsiteId;
      }
      if (forwardHeaders.umamiHostname) {
        headers["x-umami-hostname"] = forwardHeaders.umamiHostname;
      }

      const response = await fetch(upstreamUrl, {
        method: "POST",
        signal: controller.signal,
        headers,
        body,
      });

      const responseBuffer = await response.arrayBuffer();
      const responseBody = Buffer.from(responseBuffer);
      const responseHeaders: Record<string, string> = {};
      const retryAfter = response.headers.get("retry-after");
      if (retryAfter) {
        responseHeaders["Retry-After"] = retryAfter;
      }

      log("info", "proxy_success", {
        type: logLabel,
        status: response.status,
        responseSize: responseBody.length,
      });

      return {
        status: response.status,
        headers: Object.keys(responseHeaders).length > 0 ? responseHeaders : undefined,
        body: responseBody,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log("error", "proxy_error", {
        type: logLabel,
        error: err.message,
        code: getErrorCode(error),
      });
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

// Singleton instance
export const umamiProxyService = new UmamiProxyService();
