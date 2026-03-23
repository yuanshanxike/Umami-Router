import type {
  TrackerOptions,
  TrackerConfig,
  TrackOptions,
  HealthStatus,
} from '../types';
import { RetryQueue } from './RetryQueue';
import { createUmamiRouterClient, type UmamiRouterClient } from './trpc';

interface TrackPayload extends Record<string, unknown> {
  type: 'event' | 'identify';
  payload: Record<string, unknown>;
}

const DEFAULT_SEND_ENDPOINT = '/umami/api/send';

export class UmamiTracker {
  private websiteId: string;
  private proxyPath: string;
  private config: TrackerConfig | null = null;
  private health: HealthStatus | null = null;
  private autoTrack: boolean;
  private retryQueue: RetryQueue;
  private client: UmamiRouterClient | null = null;
  private initialized = false;

  constructor(options: TrackerOptions) {
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
    this.config = await this.client.getConfig();
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

  async track(options: TrackOptions = {}): Promise<void> {
    const data = this.buildTrackData({
      websiteId: options.websiteId ?? this.websiteId,
      url: options.url,
      referrer: options.referrer,
      screenWidth: options.screenWidth,
      screenHeight: options.screenHeight,
      language: options.language,
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
      data: {
        type: 'event',
        eventName: name,
        ...data,
      },
    });
  }

  private buildTrackData(options: TrackOptions): TrackPayload {
    const website = options.websiteId ?? this.websiteId;
    const url = options.url ?? this.getCurrentUrl();
    const referrer = options.referrer ?? this.getReferrer();
    const language =
      options.language ??
      (typeof document !== 'undefined' ? document.documentElement?.lang : undefined) ??
      (typeof navigator !== 'undefined' ? navigator.language : undefined);
    const screenWidth =
      options.screenWidth ??
      (typeof window !== 'undefined' ? window.screen?.width : undefined);
    const screenHeight =
      options.screenHeight ??
      (typeof window !== 'undefined' ? window.screen?.height : undefined);
    const eventData = options.data ?? {};
    const eventName = typeof eventData.eventName === 'string' ? eventData.eventName : undefined;
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
    const endpoint = this.config?.apiPath ?? DEFAULT_SEND_ENDPOINT;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
      keepalive: true,
    });

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
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
