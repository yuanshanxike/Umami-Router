import { SlidingWindowRateLimiter } from "./rate-limiter.js";
import { createLogger } from "./logger.js";

const log = createLogger("umami-proxy");

export interface UmamiConfig {
  websiteId: string;
  apiPath: string;
  scriptPath: string;
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
  private sendPath = "/api/send";
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

    // Custom script path if provided
    if (process.env.UMAMI_SCRIPT_PATH) {
      this.scriptPath = process.env.UMAMI_SCRIPT_PATH;
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

    // Use provided websiteId or fallback to first in list
    const resolvedWebsiteId =
      websiteId || this.websiteIds[0] || process.env.UMAMI_WEBSITE_ID || "";

    return {
      websiteId: resolvedWebsiteId,
      apiPath: "/umami/api/send",
      scriptPath: "/umami/script.js",
      proxyPath: "/umami",
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
    this.ensureInitialized();
    const upstreamUrl = `${this.upstreamBase}${this.scriptPath}`;

    log("info", "proxy_request", {
      type: "script",
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
        type: "script",
        status: response.status,
        bodySize: body.length,
      });

      return { status: response.status, headers, body };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log("error", "proxy_error", {
        type: "script",
        error: err.message,
        code: (error as NodeJS.ErrnoException).code,
      });
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async proxySendRequest(
    body: string,
    clientIp: string,
    userAgent: string,
    origin: string | undefined,
    websiteId?: string
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

    const upstreamUrl = `${this.upstreamBase}${this.sendPath}`;

    log("info", "proxy_request", {
      type: "send",
      upstream: upstreamUrl,
      clientIp,
      hasOrigin: !!origin,
      websiteId,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(upstreamUrl, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": userAgent || "Mozilla/5.0 (compatible; Umami Proxy/1.0)",
          "X-Forwarded-For": clientIp,
          "X-Real-IP": clientIp,
        },
        body,
      });

      const responseBuffer = await response.arrayBuffer();
      const responseBody = Buffer.from(responseBuffer);

      log("info", "proxy_success", {
        type: "send",
        status: response.status,
        responseSize: responseBody.length,
      });

      return { status: response.status, body: responseBody };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log("error", "proxy_error", {
        type: "send",
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
