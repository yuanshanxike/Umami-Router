// tRPC getConfig response
export interface TrackerConfig {
  websiteId: string;
  apiPath: string;
  scriptPath: string;
  proxyPath: string;
}

// tRPC getHealth response
export interface HealthStatus {
  upstreamReachable: boolean;
  upstreamLatencyMs: number | null;
  rateLimitRemaining: number;
  managedWebsites: string[];
}

export interface VueRouterLike {
  afterEach(guard: (to: { fullPath: string }) => void): void;
}

// Track options
export interface TrackOptions {
  websiteId?: string;
  url?: string;
  referrer?: string;
  screenWidth?: number;
  screenHeight?: number;
  language?: string;
  data?: Record<string, unknown>;
}

// Pageview options
export interface PageviewOptions {
  url: string;
  referrer?: string;
}

// Event options
export interface EventOptions {
  name: string;
  data?: Record<string, unknown>;
}

// Tracker initialization options
export interface TrackerOptions {
  websiteId: string;
  proxyPath?: string;
  autoTrack?: boolean;
  retryQueueSize?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

// Vue plugin options
export interface VueTrackerOptions extends TrackerOptions {
  useRouter?: boolean;
  routerPrefix?: string;
  router?: VueRouterLike;
}

// Next.js options
export interface NextjsTrackerOptions extends TrackerOptions {
  appRouter?: boolean;
}
