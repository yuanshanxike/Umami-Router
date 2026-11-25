import type {
  CaptureExceptionContext,
  HealthStatus,
  TrackerConfig,
  TrackerOptions,
  TrackOptions,
} from '../types';
import { RetryQueue } from './RetryQueue';
import { createUmamiRouterClient, type UmamiRouterClient } from './trpc';

interface TrackPayload extends Record<string, unknown> {
  type: 'event' | 'identify' | 'error';
  payload: Record<string, unknown>;
}

interface WindowUmamiHandle {
  track?: () => unknown;
  getSessionCache?: () => string | null;
  captureException?: (error: unknown, context?: CaptureExceptionContext) => unknown;
}

const DEFAULT_SEND_ENDPOINT = '/umami/api/send';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function generateEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getWindowUmami(): WindowUmamiHandle | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const umamiValue: unknown = Reflect.get(window, 'umami');
  if (!isRecord(umamiValue)) {
    return null;
  }

  const trackProp: unknown = Reflect.get(umamiValue, 'track');
  const getSessionProp: unknown = Reflect.get(umamiValue, 'getSession');
  const captureProp: unknown = Reflect.get(umamiValue, 'captureException');

  return {
    track:
      typeof trackProp === 'function'
        ? () => Reflect.apply(trackProp, umamiValue, [])
        : undefined,
    getSessionCache:
      typeof getSessionProp === 'function'
        ? () => {
            const session: unknown = Reflect.apply(getSessionProp, umamiValue, []);
            if (!isRecord(session)) {
              return null;
            }
            const cache = Reflect.get(session, 'cache');
            return typeof cache === 'string' && cache.length > 0 ? cache : null;
          }
        : undefined,
    captureException:
      typeof captureProp === 'function'
        ? (error: unknown, context?: CaptureExceptionContext) =>
            Reflect.apply(captureProp, umamiValue, [error, context])
        : undefined,
  };
}

export function readWindowUmamiCache(): string | null {
  try {
    return getWindowUmami()?.getSessionCache?.() ?? null;
  } catch {
    return null;
  }
}

export class UmamiTracker {
  private websiteId: string;
  private proxyPath: string;
  private config: TrackerConfig | null = null;
  private health: HealthStatus | null = null;
  private autoTrack: boolean;
  private retryQueue: RetryQueue;
  private client: UmamiRouterClient | null = null;
  private initialized = false;
  private sessionCache: string | null = null;
  private disabledByServer = false;
  private skipNextAutoPageview = false;
  private options: TrackerOptions;

  constructor(options: TrackerOptions) {
    this.options = options;
    this.websiteId = options.websiteId;
    this.proxyPath = options.proxyPath ?? '/trpc';
    this.autoTrack = options.autoTrack ?? true;
    this.retryQueue = new RetryQueue(this.sendBeacon.bind(this), {
      maxSize: options.retryQueueSize ?? 100,
      maxAttempts: options.retryAttempts ?? 3,
      retryDelay: options.retryDelay ?? 1000,
    });
  }

  async configure(): Promise<TrackerConfig> {
    this.client = createUmamiRouterClient(this.proxyPath);
    this.config = await this.client.getConfig(this.websiteId);
    this.initialized = true;
    return this.config;
  }

  async getHealth(): Promise<HealthStatus | null> {
    if (!this.client) {
      return null;
    }
    this.health = await this.client.getHealth();
    return this.health;
  }

  getConfig(): TrackerConfig | null {
    return this.config;
  }

  getWebsiteId(): string {
    return this.config?.websiteId ?? this.websiteId;
  }

  getSessionCache(): string | null {
    return this.sessionCache ?? readWindowUmamiCache();
  }

  markInitialPageviewManagedByScript(): void {
    this.skipNextAutoPageview = true;
  }

  consumeInitialPageviewSkip(): boolean {
    if (!this.skipNextAutoPageview) {
      return false;
    }
    this.skipNextAutoPageview = false;
    return true;
  }

  async track(options: TrackOptions = {}): Promise<void> {
    const data = this.buildTrackData({
      websiteId: options.websiteId ?? this.getWebsiteId(),
      url: options.url,
      referrer: options.referrer,
      screenWidth: options.screenWidth,
      screenHeight: options.screenHeight,
      language: options.language,
      eventName: options.eventName,
      data: options.data,
    });

    try {
      await this.sendBeacon(data);
    } catch {
      await this.retryQueue.add(data);
    }
  }

  async pageview(url: string, referrer?: string): Promise<void> {
    await this.track({
      url,
      referrer,
    });
  }

  async event(name: string, data?: Record<string, unknown>): Promise<void> {
    await this.track({
      eventName: name,
      data,
    });
  }

  async identify(
    idOrData: string | Record<string, unknown>,
    data?: Record<string, unknown>
  ): Promise<void> {
    const url = this.getCurrentUrl();
    const distinctId =
      typeof idOrData === 'string'
        ? idOrData
        : typeof idOrData.id === 'string'
          ? idOrData.id
          : undefined;
    const customData =
      typeof idOrData === 'object' && idOrData !== null ? idOrData : data;

    const payload: Record<string, unknown> = {
      website: this.getWebsiteId(),
      url,
      hostname: this.getHostname(url),
      referrer: this.getReferrer(),
      language: this.getLanguage(),
      screen: this.getScreenSize(
        typeof window !== 'undefined' ? window.screen?.width : undefined,
        typeof window !== 'undefined' ? window.screen?.height : undefined
      ),
      title: this.getDocumentTitle(),
      id: distinctId,
      data: customData,
      timestamp: Math.floor(Date.now() / 1000),
    };

    const body: TrackPayload = { type: 'identify', payload };
    try {
      await this.sendBeacon(body);
    } catch {
      await this.retryQueue.add(body);
    }
  }

  async captureException(
    error: unknown,
    context: CaptureExceptionContext = {}
  ): Promise<void> {
    const windowUmami = getWindowUmami();
    if (windowUmami?.captureException) {
      await Promise.resolve(windowUmami.captureException(error, context));
      return;
    }

    const errorOptions =
      typeof this.options.errors === 'object' ? this.options.errors : undefined;
    const errorRecord = isRecord(error) ? error : null;
    const errorName =
      error instanceof Error
        ? error.name
        : typeof errorRecord?.name === 'string'
          ? errorRecord.name
          : 'Error';
    const errorMessage =
      error instanceof Error
        ? error.message
        : typeof errorRecord?.message === 'string'
          ? errorRecord.message
          : typeof error === 'string'
            ? error
            : 'Non-Error exception';
    const errorStack =
      error instanceof Error && typeof error.stack === 'string'
        ? error.stack
        : typeof errorRecord?.stack === 'string'
          ? errorRecord.stack
          : '';

    const currentUrl = this.getCurrentUrl();
    let pathname = '/';
    try {
      pathname = new URL(currentUrl || '/', 'https://localhost').pathname;
    } catch {
      pathname = '/';
    }

    const payload: Record<string, unknown> = {
      version: 1,
      website: this.getWebsiteId(),
      eventId: generateEventId(),
      timestamp: Date.now(),
      name: errorName.slice(0, 200) || 'Error',
      message: errorMessage.slice(0, 2000),
      stack: errorStack.slice(0, 16000),
      handled: true,
      url: pathname,
      hostname: this.getHostname(currentUrl),
      screen: this.getScreenSize(
        typeof window !== 'undefined' ? window.screen?.width : undefined,
        typeof window !== 'undefined' ? window.screen?.height : undefined
      ),
      language: this.getLanguage(),
      release: (context.release ?? errorOptions?.release ?? '').slice(0, 100),
      environment: (context.environment ?? errorOptions?.environment ?? 'production').slice(0, 50),
      tags: context.tags ?? {},
      ...(context.fingerprint?.length
        ? { fingerprint: context.fingerprint.slice(0, 5) }
        : {}),
    };

    const body: TrackPayload = { type: 'error', payload };
    try {
      await this.sendBeacon(body);
    } catch {
      await this.retryQueue.add(body);
    }
  }

  private buildTrackData(options: TrackOptions): TrackPayload {
    const website = options.websiteId ?? this.getWebsiteId();
    const url = options.url ?? this.getCurrentUrl();
    const referrer = options.referrer ?? this.getReferrer();
    const language = options.language ?? this.getLanguage();
    const screenWidth =
      options.screenWidth ??
      (typeof window !== 'undefined' ? window.screen?.width : undefined);
    const screenHeight =
      options.screenHeight ??
      (typeof window !== 'undefined' ? window.screen?.height : undefined);
    const eventData = options.data ?? {};
    const eventName =
      options.eventName ??
      (typeof eventData.eventName === 'string' ? eventData.eventName : undefined);
    const customData = this.omitEventName(eventData);

    return {
      type: 'event',
      payload: {
        website,
        url,
        hostname: this.getHostname(url),
        referrer,
        language,
        screen: this.getScreenSize(screenWidth, screenHeight),
        title: this.getDocumentTitle(),
        name: eventName,
        data: Object.keys(customData).length > 0 ? customData : undefined,
        timestamp: Math.floor(Date.now() / 1000),
      },
    };
  }

  private async sendBeacon(data: Record<string, unknown>): Promise<void> {
    if (this.disabledByServer) {
      return;
    }

    const endpoint = this.config?.apiPath ?? DEFAULT_SEND_ENDPOINT;
    const payloadRecord = isRecord(data.payload) ? data.payload : null;
    const website =
      typeof payloadRecord?.website === 'string' && payloadRecord.website.length > 0
        ? payloadRecord.website
        : this.getWebsiteId();
    const hostname =
      typeof payloadRecord?.hostname === 'string' && payloadRecord.hostname.length > 0
        ? payloadRecord.hostname
        : this.getHostname(this.getCurrentUrl());

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-umami-website-id': website,
    };
    if (hostname) {
      headers['x-umami-hostname'] = hostname;
    }

    const cache = this.getSessionCache();
    if (cache) {
      headers['x-umami-cache'] = cache;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
      keepalive: true,
    });

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    try {
      const responseText = await response.text();
      if (responseText) {
        const parsed: unknown = JSON.parse(responseText);
        if (isRecord(parsed)) {
          if (typeof parsed.cache === 'string' && parsed.cache.length > 0) {
            this.sessionCache = parsed.cache;
          }
          if (parsed.disabled === true) {
            this.disabledByServer = true;
          }
        }
      }
    } catch {
      // Ignore empty or non-JSON responses
    }
  }

  private getCurrentUrl(): string {
    if (typeof window === 'undefined') {
      return '';
    }
    return window.location.href;
  }

  private getReferrer(): string {
    if (typeof document === 'undefined') {
      return '';
    }
    return document.referrer;
  }

  private getLanguage(): string | undefined {
    const docLang =
      typeof document !== 'undefined' ? document.documentElement?.lang : undefined;
    if (docLang) {
      return docLang;
    }
    return typeof navigator !== 'undefined' ? navigator.language : undefined;
  }

  private getDocumentTitle(): string | undefined {
    if (typeof document === 'undefined') {
      return undefined;
    }
    return document.title || undefined;
  }

  private getHostname(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      if (typeof window !== 'undefined') {
        return window.location.hostname;
      }
      return '';
    }
  }

  private getScreenSize(width?: number, height?: number): string | undefined {
    if (typeof width !== 'number' || typeof height !== 'number') {
      return undefined;
    }
    return `${width}x${height}`;
  }

  private omitEventName(data: Record<string, unknown>): Record<string, unknown> {
    const { eventName: _, ...rest } = data;
    return rest;
  }

  isAutoTrackEnabled(): boolean {
    return this.autoTrack;
  }

  enableAutoTrack(): void {
    this.autoTrack = true;
  }

  disableAutoTrack(): void {
    this.autoTrack = false;
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}
