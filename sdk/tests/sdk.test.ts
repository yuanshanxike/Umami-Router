import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { RetryQueue } from '../src/core/RetryQueue';
import { UmamiTracker } from '../src/core/UmamiTracker';
import { createUmamiRouterClient } from '../src/core/trpc';
import { mountUmamiScripts } from '../src/core/recorder';

interface RecordedFetchCall {
  url: string;
  init?: RequestInit;
}

class MockScriptElement {
  tagName = 'SCRIPT';
  defer = false;
  src = '';
  parentNode: MockHead | null = null;
  attributes: Record<string, string> = {};
  listeners: Record<string, Array<() => void>> = {};

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  addEventListener(event: string, listener: () => void): void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(listener);
  }

  dispatch(event: string): void {
    for (const listener of this.listeners[event] ?? []) {
      listener();
    }
  }
}

class MockHead {
  children: MockScriptElement[] = [];

  appendChild(el: MockScriptElement): MockScriptElement {
    el.parentNode = this;
    this.children.push(el);
    return el;
  }

  removeChild(el: MockScriptElement): MockScriptElement {
    this.children = this.children.filter((child) => child !== el);
    el.parentNode = null;
    return el;
  }
}

describe('@umami_router/sdk', () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;

  beforeEach(() => {
    Reflect.set(globalThis, 'window', {
      location: {
        href: 'https://app.example.com/dashboard?tab=1',
        hostname: 'app.example.com',
      },
      screen: { width: 1440, height: 900 },
    });
    Reflect.set(globalThis, 'document', {
      title: 'Dashboard',
      referrer: 'https://app.example.com/',
      documentElement: { lang: 'en' },
    });
    Reflect.set(globalThis, 'navigator', { language: 'en-US' });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) {
      Reflect.deleteProperty(globalThis, 'window');
    } else {
      Reflect.set(globalThis, 'window', originalWindow);
    }
    if (originalDocument === undefined) {
      Reflect.deleteProperty(globalThis, 'document');
    } else {
      Reflect.set(globalThis, 'document', originalDocument);
    }
  });

  it('UmamiTracker.event() omits eventName and does not emit stray type: "event"', async () => {
    const calls: RecordedFetchCall[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({ cache: 'cache-1' }), { status: 200 });
    }) satisfies typeof fetch;

    const tracker = new UmamiTracker({
      websiteId: 'site-123',
      proxyPath: '/trpc',
      autoTrack: true,
    });

    await tracker.event('cards_export', { format: 'zip', count: 4 });

    expect(calls).toHaveLength(1);
    const parsed = JSON.parse(String(calls[0].init?.body));
    expect(parsed.type).toBe('event');
    expect(parsed.payload.name).toBe('cards_export');
    expect(parsed.payload.data).toEqual({ format: 'zip', count: 4 });
    expect(parsed.payload.data.type).toBeUndefined();
    expect(parsed.payload.data.eventName).toBeUndefined();
  });

  it('sends x-umami-website-id, x-umami-hostname, persists x-umami-cache, and respects disabled', async () => {
    const calls: RecordedFetchCall[] = [];
    let responseIndex = 0;

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      responseIndex += 1;
      if (responseIndex === 1) {
        return new Response(JSON.stringify({ cache: 'cache-from-server' }), { status: 200 });
      }
      return new Response(JSON.stringify({ cache: 'cache-2', disabled: true }), { status: 200 });
    }) satisfies typeof fetch;

    const tracker = new UmamiTracker({ websiteId: 'site-abc' });
    await tracker.pageview('/step-1');
    await tracker.pageview('/step-2');
    await tracker.pageview('/step-3'); // skipped because disabled: true

    expect(calls).toHaveLength(2);
    const firstHeaders = new Headers(calls[0].init?.headers);
    expect(firstHeaders.get('x-umami-website-id')).toBe('site-abc');
    expect(firstHeaders.get('x-umami-hostname')).toBe('app.example.com');
    expect(firstHeaders.get('x-umami-cache')).toBeNull();

    const secondHeaders = new Headers(calls[1].init?.headers);
    expect(secondHeaders.get('x-umami-cache')).toBe('cache-from-server');
    expect(tracker.getSessionCache()).toBe('cache-2');
  });

  it('supports identify() and captureException() with delegation and fallback', async () => {
    const calls: RecordedFetchCall[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) satisfies typeof fetch;

    const tracker = new UmamiTracker({
      websiteId: 'site-err',
      errors: { release: '1.2.3', environment: 'staging' },
    });

    await tracker.identify('user-42', { plan: 'pro' });
    await tracker.captureException(new TypeError('Invalid coord'), {
      tags: { page: 'map' },
      fingerprint: ['coord', 'nan'],
    });

    expect(calls).toHaveLength(2);
    const identifyBody = JSON.parse(String(calls[0].init?.body));
    expect(identifyBody.type).toBe('identify');
    expect(identifyBody.payload.id).toBe('user-42');
    expect(identifyBody.payload.data).toEqual({ plan: 'pro' });

    const errorBody = JSON.parse(String(calls[1].init?.body));
    expect(errorBody.type).toBe('error');
    expect(errorBody.payload.version).toBe(1);
    expect(errorBody.payload.name).toBe('TypeError');
    expect(errorBody.payload.message).toBe('Invalid coord');
    expect(errorBody.payload.release).toBe('1.2.3');
    expect(errorBody.payload.environment).toBe('staging');
    expect(errorBody.payload.url).toBe('/dashboard');
    expect(errorBody.payload.tags).toEqual({ page: 'map' });
    expect(errorBody.payload.fingerprint).toEqual(['coord', 'nan']);

    // Delegate to window.umami.captureException when present
    const delegated: Array<{ err: unknown; ctx: unknown }> = [];
    Reflect.set(globalThis.window, 'umami', {
      captureException: (err: unknown, ctx: unknown) => {
        delegated.push({ err, ctx });
      },
    });

    const boom = new Error('Handled via window.umami');
    await tracker.captureException(boom, { release: '2.0.0' });
    expect(delegated).toHaveLength(1);
    expect(delegated[0].err).toBe(boom);
    expect(calls).toHaveLength(2);
  });

  it('consumeInitialPageviewSkip() only suppresses once', () => {
    const tracker = new UmamiTracker({ websiteId: 'site-1' });
    expect(tracker.consumeInitialPageviewSkip()).toBe(false);

    tracker.markInitialPageviewManagedByScript();
    expect(tracker.consumeInitialPageviewSkip()).toBe(true);
    expect(tracker.consumeInitialPageviewSkip()).toBe(false);
  });

  it('RetryQueue retries failed items and respects maxSize drop limit', async () => {
    const dropped: Array<Record<string, unknown>> = [];
    let attempts = 0;
    const processed: Array<Record<string, unknown>> = [];

    const queue = new RetryQueue(
      async (data) => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error('temporary network error');
        }
        processed.push(data);
      },
      {
        maxSize: 2,
        maxAttempts: 3,
        retryDelay: 5,
        onDrop: (data) => dropped.push(data),
      }
    );

    await queue.add({ id: 1 });
    await queue.add({ id: 2 });
    await queue.add({ id: 3 });

    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(dropped).toEqual([{ id: 1 }]);
    expect(processed).toEqual([{ id: 2 }, { id: 3 }]);
    expect(queue.size).toBe(0);
  });

  it('createUmamiRouterClient resolves proxy URLs and validates config & health payloads', async () => {
    const requestedUrls: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      requestedUrls.push(url);
      if (url.includes('getConfig')) {
        return new Response(
          JSON.stringify({
            result: {
              data: {
                websiteId: 'site-1',
                apiPath: '/umami/api/send',
                scriptPath: '/umami/script.js',
                recorderPath: '/umami/recorder.js',
                proxyPath: '/trpc',
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({
          result: {
            data: {
              upstreamReachable: true,
              upstreamLatencyMs: 12,
              rateLimitRemaining: 98,
              managedWebsites: ['site-1'],
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) satisfies typeof fetch;

    const client = createUmamiRouterClient('https://example.com/analytics/');
    const config = await client.getConfig('site-1');
    const health = await client.getHealth();

    expect(requestedUrls[0]).toStartWith('https://example.com/analytics/trpc/getConfig');
    expect(config.recorderPath).toBe('/umami/recorder.js');
    expect(health).toEqual({
      upstreamReachable: true,
      upstreamLatencyMs: 12,
      rateLimitRemaining: 98,
      managedWebsites: ['site-1'],
    });
  });

  it('mountUmamiScripts injects script.js with error/performance attrs, awaits session track, injects recorder.js, and cleans up', async () => {
    const mockHead = new MockHead();
    Reflect.set(globalThis, 'document', {
      head: mockHead,
      createElement: () => new MockScriptElement(),
    });

    let resolveTrack: (() => void) | null = null;
    Reflect.set(globalThis.window, 'umami', {
      track: () =>
        new Promise<void>((resolve) => {
          resolveTrack = resolve;
        }),
    });

    let loadedCount = 0;
    let errorCount = 0;

    const cleanup = mountUmamiScripts({
      scriptUrl: '/umami/script.js',
      recorderUrl: '/umami/recorder.js',
      websiteId: 'site-dom',
      recorder: { sampleRate: 0.2, maskLevel: 'strict' },
      errors: { release: '0.3.0', environment: 'prod' },
      performance: true,
      onScriptLoaded: () => {
        loadedCount += 1;
      },
      onScriptError: () => {
        errorCount += 1;
      },
    });

    expect(mockHead.children).toHaveLength(1);
    const scriptEl = mockHead.children[0];
    expect(scriptEl.src).toBe('/umami/script.js');
    expect(scriptEl.getAttribute('data-auto-track')).toBe('false');
    expect(scriptEl.getAttribute('data-errors')).toBe('true');
    expect(scriptEl.getAttribute('data-release')).toBe('0.3.0');
    expect(scriptEl.getAttribute('data-environment')).toBe('prod');
    expect(scriptEl.getAttribute('data-performance')).toBe('true');

    scriptEl.dispatch('load');
    expect(loadedCount).toBe(1);
    // recorder.js waits until track() settles
    expect(mockHead.children).toHaveLength(1);

    resolveTrack?.();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockHead.children).toHaveLength(2);
    const recorderEl = mockHead.children[1];
    expect(recorderEl.src).toBe('/umami/recorder.js');
    expect(recorderEl.getAttribute('data-website-id')).toBe('site-dom');
    expect(recorderEl.getAttribute('data-sample-rate')).toBe('0.2');
    expect(recorderEl.getAttribute('data-mask-level')).toBe('strict');

    scriptEl.dispatch('error');
    expect(errorCount).toBe(1);

    cleanup();
    expect(mockHead.children).toHaveLength(0);
  });
});
