import type { UmamiTracker } from '../core/UmamiTracker';

// tRPC getConfig response
export interface TrackerConfig {
  websiteId: string;
  apiPath: string;
  scriptPath: string;
  recorderPath: string;
  proxyPath: string;
}

/**
 * Umami Replays recorder configuration options.
 *
 * Note: Starting in Umami v3.5.0+, `recorder.js` fetches these settings from the
 * server (`GET /api/websites/:id/recorder`) and ignores client-side `data-sample-rate`,
 * `data-mask-level`, `data-max-duration`, and `data-block-selector` attributes.
 * These fields remain supported for Umami <= 3.4 backward compatibility.
 */
export interface RecorderOptions {
  /** Legacy (Umami <= 3.4): recording sample rate between 0 and 1 (default: 0.15). Ignored in Umami v3.5+. */
  sampleRate?: number;
  /** Legacy (Umami <= 3.4): privacy mask level ('moderate' | 'strict'). Ignored in Umami v3.5+. */
  maskLevel?: 'moderate' | 'strict';
  /** Legacy (Umami <= 3.4): max recording duration in ms (default: 300000). Ignored in Umami v3.5+. */
  maxDuration?: number;
  /** Legacy (Umami <= 3.4): CSS selector for elements excluded from recording. Ignored in Umami v3.5+. */
  blockSelector?: string;
}

/** Umami v3.5.0+ browser error tracking options */
export interface ErrorTrackingOptions {
  /** Application release version sent via `data-release` */
  release?: string;
  /** Deployment environment sent via `data-environment` (e.g. 'production') */
  environment?: string;
}

/** Additional script-powered capabilities provided by upstream script.js / recorder.js */
export interface ScriptFeatureOptions {
  recorder?: RecorderOptions | boolean;
  errors?: ErrorTrackingOptions | boolean;
  performance?: boolean;
}

/** Context for manual error reporting via `captureException()` */
export interface CaptureExceptionContext {
  release?: string;
  environment?: string;
  tags?: Record<string, string | number | boolean>;
  fingerprint?: string[];
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
  eventName?: string;
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
  /** Enable Session Replays / Heatmaps (object or true). Note: in Umami v3.5+, sampling/masking come from server config. */
  recorder?: RecorderOptions | boolean;
  /** Enable Umami v3.5.0+ automatic browser error tracking (`data-errors="true"`) */
  errors?: ErrorTrackingOptions | boolean;
  /** Enable Core Web Vitals performance tracking (`data-performance="true"`) */
  performance?: boolean;
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

/** Options for framework-agnostic `initBrowserTracker()` */
export interface BrowserTrackerOptions extends TrackerOptions {
  /** Invoked once upstream `script.js` has loaded */
  onScriptLoaded?: () => void;
  /** Invoked if upstream `script.js` fails to load */
  onScriptError?: () => void;
}

/** Handle returned by `initBrowserTracker()` */
export interface BrowserTrackerHandle {
  tracker: UmamiTracker;
  ready: Promise<boolean>;
  trackEvent: (name: string, data?: Record<string, unknown>) => Promise<void>;
  trackPageview: (url: string, referrer?: string) => Promise<void>;
  identify: (
    idOrData: string | Record<string, unknown>,
    data?: Record<string, unknown>
  ) => Promise<void>;
  captureException: (error: unknown, context?: CaptureExceptionContext) => Promise<void>;
  destroy: () => void;
}
