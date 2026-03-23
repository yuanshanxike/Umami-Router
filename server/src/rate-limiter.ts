export interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

export class SlidingWindowRateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private requests: Map<string, number[]> = new Map();
  private globalRequestCount = 0;

  constructor(options: RateLimiterOptions) {
    this.windowMs = options.windowMs;
    this.maxRequests = options.maxRequests;
  }

  isAllowed(key: string): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    const userRequests = this.requests.get(key) || [];
    const recentRequests = userRequests.filter((time) => time > windowStart);

    if (recentRequests.length >= this.maxRequests) {
      this.requests.set(key, recentRequests);
      return false;
    }

    recentRequests.push(now);
    this.requests.set(key, recentRequests);
    this.globalRequestCount++;
    return true;
  }

  getRemaining(key: string): number {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const userRequests = this.requests.get(key) || [];
    const recentRequests = userRequests.filter((time) => time > windowStart);

    return Math.max(0, this.maxRequests - recentRequests.length);
  }

  getGlobalRemaining(): number {
    // Use global counter for O(1) performance
    return Math.max(0, this.maxRequests - this.globalRequestCount);
  }

  cleanup(): void {
    const windowStart = Date.now() - this.windowMs;
    let expiredCount = 0;
    for (const [key, times] of this.requests.entries()) {
      const expired = times.filter((t) => t <= windowStart);
      const recent = times.filter((t) => t > windowStart);
      expiredCount += expired.length;
      if (recent.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, recent);
      }
    }
    // Decrement global counter by expired request count
    this.globalRequestCount = Math.max(0, this.globalRequestCount - expiredCount);
  }
}
