// tRPC getConfig response
export interface TrackerConfig {
  websiteId: string;
  apiPath: string;
  scriptPath: string;
  recorderPath: string;
  proxyPath: string;
}

/** Umami Replays recorder 配置选项 */
export interface RecorderOptions {
  /** 录制采样率，0~1 之间，默认 0.15（15% 的会话） */
  sampleRate?: number;
  /** 隐私遮罩级别：'moderate' 遮罩输入框，'strict' 遮罩所有文本 */
  maskLevel?: 'moderate' | 'strict';
  /** 最大录制时长（毫秒），默认 300000（5分钟） */
  maxDuration?: number;
  /** CSS 选择器，匹配的元素将被完全排除在录制之外 */
  blockSelector?: string;
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
  /** 启用 Replays 功能，传入配置对象或 true 使用默认配置 */
  recorder?: RecorderOptions | boolean;
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
