---
name: umami-sdk
description: |
  Integration guide for @umami_router/sdk - the TypeScript SDK for Umami Analytics.
  Use this skill when users ask about:
  - How to integrate @umami_router/sdk with Vue 3 or Next.js
  - How to track pageviews and events with the SDK
  - How to configure the Umami tracker options
  - How to use createUmamiPlugin, useTracker, usePageTrack, useEventTrack in Vue
  - How to use useUmami, usePageviewTracking, useEventTracking in Next.js
  - Questions about TrackerConfig, HealthStatus, TrackOptions types
  - How to set up the proxy server for Umami
  - Troubleshooting tracker initialization or tracking failures
version: 1.0.0
tags: [analytics, umami, vue, nextjs, typescript, sdk]
---

# @umami_router/sdk Integration Guide

This skill covers the integration patterns and API usage for `@umami_router/sdk`, a TypeScript SDK providing Vue 3 and Next.js 14+ integrations for Umami Analytics.

## Package Structure

```typescript
// Three entry points via package.json exports
import '@umami_router/sdk'              // Core tracking (UmamiTracker, RetryQueue, createUmamiRouterClient)
import '@umami_router/sdk/vue'          // Vue 3 integration
import '@umami_router/sdk/nextjs'       // Next.js 14+ integration
```

## Core Concepts

### UmamiTracker
The central class that handles all tracking operations. It manages:
- Configuration fetching via tRPC
- Pageview and event tracking
- Automatic retry queue for failed requests

### TrackerOptions (base options)
```typescript
interface TrackerOptions {
  websiteId: string;           // Required: Your Umami website ID
  proxyPath?: string;          // Optional: tRPC proxy path (default: '/trpc')
  autoTrack?: boolean;         // Optional: Enable auto pageview tracking (default: true)
  retryQueueSize?: number;     // Optional: Max queued retries (default: 100)
  retryAttempts?: number;      // Optional: Retry attempts (default: 3)
  retryDelay?: number;         // Optional: Delay between retries in ms (default: 1000)
}
```

## Vue 3 Integration

### Quick Start

```typescript
// main.ts
import { createApp } from 'vue';
import { createUmamiPlugin } from '@umami_router/sdk/vue';

const umamiPlugin = createUmamiPlugin({
  websiteId: 'your-website-id',
  proxyPath: '/trpc',
  autoTrack: true,
  useRouter: true,  // Auto-track route changes
});

const app = createApp(App);
app.use(router);
app.use(umamiPlugin);
app.mount('#app');
```

### Vue Plugin Options (VueTrackerOptions)
```typescript
interface VueTrackerOptions extends TrackerOptions {
  useRouter?: boolean;      // Auto-track Vue Router changes (default: false)
  routerPrefix?: string;     // Optional prefix for tracked URLs
  router?: VueRouterLike;    // Explicit router instance
}
```

### Vue Composables

#### useTracker()
Access the tracker instance and control auto-tracking:

```typescript
import { useTracker } from '@umami_router/sdk/vue';

const { tracker, track, autoTrackPageviews, isAutoTrackEnabled, enableAutoTrack, disableAutoTrack } = useTracker();

// Direct tracker access
await tracker.pageview('/page', '/referrer');
await tracker.event('button_click', { button_id: 'submit' });

// Manual pageview
await track.pageview({ url: '/page', referrer: '/referrer' });

// Manual event
await track.event({ name: 'signup', data: { method: 'email' } });

// Auto-track route changes
autoTrackPageviews(() => route.path);
```

#### usePageTrack(getPath)
Automatically track pageviews when a route changes:

```typescript
import { usePageTrack } from '@umami_router/sdk/vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const { trackPageview } = usePageTrack(() => route.path);

// Manual override
await trackPageview('/new-page', '/old-page');
```

#### useEventTrack()
Track custom events:

```typescript
import { useEventTrack } from '@umami_router/sdk/vue';

const { trackEvent } = useEventTrack();

await trackEvent('purchase_complete', {
  product_id: '123',
  amount: 99.99,
  currency: 'USD'
});
```

## Next.js 14 App Router Integration

### Setup with Provider Pattern

```typescript
// components/TrackerProvider.tsx
'use client';

import { usePathname } from 'next/navigation';
import { useUmami, usePageviewTracking, useEventTracking } from '@umami_router/sdk/nextjs';
import type { NextjsTrackerOptions } from '@umami_router/sdk';

export function TrackerProvider({ children, options }: { children: React.ReactNode; options: NextjsTrackerOptions }) {
  const pathname = usePathname();

  // Initialize tracker
  const { tracker, isReady, enableAutoTrack, disableAutoTrack, isAutoTrackEnabled, track } =
    useUmami(options);

  // Auto track pageviews on route change
  usePageviewTracking(() => pathname);

  // Expose event tracking
  useEventTracking();

  return <>{children}</>;
}
```

```typescript
// app/layout.tsx (or page.tsx)
import TrackerProvider from '@/components/TrackerProvider';

const TRACKER_OPTIONS = {
  websiteId: process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID ?? '',
  proxyPath: process.env.NEXT_PUBLIC_UMAMI_PROXY_PATH ?? '/trpc',
  autoTrack: true,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <TrackerProvider options={TRACKER_OPTIONS}>
          {children}
        </TrackerProvider>
      </body>
    </html>
  );
}
```

### Next.js App Router Hooks

#### useUmami(options)
Initialize the tracker with configuration:

```typescript
const { tracker, isReady, track, isAutoTrackEnabled, enableAutoTrack, disableAutoTrack } = useUmami({
  websiteId: 'your-website-id',
  proxyPath: '/trpc',
  autoTrack: true,
});

// Track methods
await track.pageview('/page', '/referrer');
await track.event('signup', { method: 'google' });
```

#### usePageviewTracking(getPath)
Auto-track pageviews when path changes:

```typescript
'use client';
import { usePathname } from 'next/navigation';
import { usePageviewTracking } from '@umami_router/sdk/nextjs';

export function MyComponent() {
  const pathname = usePathname();
  const { trackPageview } = usePageviewTracking(() => pathname);

  return <button onClick={() => trackPageview('/manual')}>Track</button>;
}
```

#### useEventTracking()
Track custom events anywhere:

```typescript
import { useEventTracking } from '@umami_router/sdk/nextjs';

function MyComponent() {
  const { trackEvent } = useEventTracking();

  return (
    <button onClick={() => trackEvent('cta_clicked', { button: 'hero' })}>
      Click me
    </button>
  );
}
```

## Next.js Pages Router Integration

The Pages Router uses the same hooks with `PagesRouter` suffix:

```typescript
import {
  useUmamiPagesRouter,
  usePageviewTrackingPagesRouter,
  useEventTrackingPagesRouter
} from '@umami_router/sdk/nextjs';
```

Pages Router hooks work identically to App Router hooks, but `usePageviewTrackingPagesRouter()` automatically uses `router.asPath` - no callback needed:

```typescript
'use client';
import { usePageviewTrackingPagesRouter, useEventTrackingPagesRouter } from '@umami_router/sdk/nextjs';

export default function MyPage() {
  // Auto-tracks router.asPath changes
  usePageviewTrackingPagesRouter();

  const { trackEvent } = useEventTrackingPagesRouter();

  return <button onClick={() => trackEvent('page_loaded')}>Track</button>;
}
```

## Core API (for advanced usage)

### UmamiTracker Class
Direct usage when you need more control:

```typescript
import { UmamiTracker } from '@umami_router/sdk';

const tracker = new UmamiTracker({
  websiteId: 'your-website-id',
  proxyPath: '/trpc',
  autoTrack: false,
});

// Must call configure() before tracking
await tracker.configure();

// Track methods
await tracker.pageview('/page', '/referrer');
await tracker.event('purchase', { amount: 29.99 });
await tracker.track({
  url: '/custom',
  data: { custom: 'payload' }
});

// Control auto-tracking
tracker.isAutoTrackEnabled();  // boolean
tracker.enableAutoTrack();
tracker.disableAutoTrack();
```

### createUmamiRouterClient (tRPC client)
For server-side or advanced client-side use:

```typescript
import { createUmamiRouterClient } from '@umami_router/sdk';

const client = createUmamiRouterClient('/trpc');

// Fetch tracker config from server
const config = await client.getConfig();
// Returns: { websiteId, apiPath, scriptPath, proxyPath }

// Fetch server health status
const health = await client.getHealth();
// Returns: { upstreamReachable, upstreamLatencyMs, rateLimitRemaining, managedWebsites }
```

## Type Reference

### TrackOptions
```typescript
interface TrackOptions {
  websiteId?: string;
  url?: string;
  referrer?: string;
  screenWidth?: number;
  screenHeight?: number;
  language?: string;
  data?: Record<string, unknown>;
}
```

### PageviewOptions
```typescript
interface PageviewOptions {
  url: string;
  referrer?: string;
}
```

### EventOptions
```typescript
interface EventOptions {
  name: string;
  data?: Record<string, unknown>;
}
```

### TrackerConfig (from tRPC getConfig)
```typescript
interface TrackerConfig {
  websiteId: string;
  apiPath: string;
  scriptPath: string;
  proxyPath: string;
}
```

### HealthStatus (from tRPC getHealth)
```typescript
interface HealthStatus {
  upstreamReachable: boolean;
  upstreamLatencyMs: number | null;
  rateLimitRemaining: number;
  managedWebsites: string[];
}
```

## Environment Variables

For the SDK to work, configure your proxy server via environment variables:

```bash
# Vue (.env)
VITE_UMAMI_WEBSITE_ID=your-website-id
VITE_UMAMI_PROXY_PATH=/trpc

# Next.js (.env.local)
NEXT_PUBLIC_UMAMI_WEBSITE_ID=your-website-id
NEXT_PUBLIC_UMAMI_PROXY_PATH=/trpc
```

## Server-Side Requirements

The SDK requires a running `@umami_router/server` instance. The server exposes:

- `GET /umami/script.js` - Proxied Umami tracking script
- `POST /umami/api/send` - Proxied tracking data endpoint
- `GET /trpc/*` - tRPC API endpoints (getConfig, getHealth)

Required server environment variables:
- `UMAMI_UPSTREAM_HOST` - Your Umami instance host (e.g., `localhost:3000`)
- `UMAMI_ALLOWED_ORIGINS` - CORS whitelist (comma-separated)
