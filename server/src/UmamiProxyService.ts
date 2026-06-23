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
  body: Buffer;
}

export class UmamiProxyService {
  private upstreamBase!: string;
  private scriptPath = "/script.js";
  private recorderPath = "/recorder.js";
  private sendPath = "/api/send";
  private recordPath = "/api/record";
  private timeoutMs!: number;
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
    this.timeoutMs = Number.parseInt(process.env.UMAMI_TIMEOUT_MS || "5000", 10);

    // Support multiple website IDs (comma-separated)
    const websiteIdsEnv =
      process.env.UMAMI_WEBSITE_IDS || process.env.UMAMI_WEBSITE_ID || "";
    this.websiteIds = websiteIdsEnv
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    // Custom script paths if provided
    if (process.env.UMAMI_SCRIPT_PATH) {
      this.scriptPath = process.env.UMAMI_SCRIPT_PATH;
    }
    if (process.env.UMAMI_RECORDER_PATH) {
      this.recorderPath = process.env.UMAMI_RECORDER_PATH;
    }

    const whitelistEnv = process.env.UMAMI_ALLOWED_ORIGINS || "";
    this.originWhitelist = new Set(
      whitelistEnv.split(",").map((o) => o.trim()).filter(Boolean)
    );

    const rateLimitWindow = Number.parseInt(
      process.env.UMAMI_RATE_LIMIT_WINDOW_MS || "60000",
      10
    );
    const rateLimitMax = Number.parseInt(
      process.env.UMAMI_RATE_LIMIT_MAX || "100",
      10
    );
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
    });
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
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

  getHealth(): ProxyHealth {
    this.ensureInitialized();
    return {
      upstreamReachable: true,
      upstreamLatencyMs: null,
      rateLimitRemaining: this.rateLimiter.getGlobalRemaining(),
      managedWebsites: this.websiteIds,
    };
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
        code: (error as NodeJS.ErrnoException).code,
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
    umamiCache?: string
  ): Promise<SendResult> {
    return this.proxyDataRequest(body, clientIp, userAgent, origin, "record", this.recordPath, websiteId, umamiCache);
  }

  async proxySendRequest(
    body: string,
    clientIp: string,
    userAgent: string,
    origin: string | undefined,
    websiteId?: string,
    umamiCache?: string
  ): Promise<SendResult> {
    return this.proxyDataRequest(body, clientIp, userAgent, origin, "send", this.sendPath, websiteId, umamiCache);
  }

  private async proxyDataRequest(
    body: string,
    clientIp: string,
    userAgent: string,
    origin: string | undefined,
    logLabel: string,
    assetPath: string,
    websiteId?: string,
    umamiCache?: string
  ): Promise<SendResult> {
    this.ensureInitialized();

    // Rate limit check
    if (!this.rateLimiter.isAllowed(clientIp)) {
      log("warn", "rate_limited", { clientIp, origin });
      return {
        status: 429,
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
      // Forward x-umami-cache header if present (required for session identification)
      if (umamiCache) {
        headers["x-umami-cache"] = umamiCache;
      }

      const response = await fetch(upstreamUrl, {
        method: "POST",
        signal: controller.signal,
        headers,
        body,
      });

      const responseBuffer = await response.arrayBuffer();
      const responseBody = Buffer.from(responseBuffer);

      log("info", "proxy_success", {
        type: logLabel,
        status: response.status,
        responseSize: responseBody.length,
      });

      return { status: response.status, body: responseBody };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log("error", "proxy_error", {
        type: logLabel,
        error: err.message,
        code: (error as NodeJS.ErrnoException).code,
      });
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

// Singleton instance
export const umamiProxyService = new UmamiProxyService();
