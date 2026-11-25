---
name: umami-sdk
description: |
  Integration guide for @umami_router/sdk - the TypeScript SDK for Umami Analytics (v3.5.0+ ready).
  Use this skill when users ask about:
  - How to integrate @umami_router/sdk with Vue 3, Next.js 14+, Vanilla TS/Vite, or static HTML sites
  - How to track pageviews, custom events, user identity, browser errors, performance, and Session Replay/Heatmaps
  - How to configure the Umami tracker options (TrackerOptions, RecorderOptions, ErrorTrackingOptions)
  - How to use createUmamiPlugin, useTracker, usePageTrack, useEventTrack in Vue
  - How to use useUmami, usePageviewTracking, useEventTracking in Next.js
  - How to use initBrowserTracker (@umami_router/sdk/core) or the standalone IIFE script (@umami_router/sdk/browser)
  - How to set up @umami_router/server and same-origin reverse proxies (Next.js rewrites, Nginx, Node.js)
  - Troubleshooting tracker initialization, replay/recorder config, CSP, or tracking failures
version: 2.0.0
tags: [analytics, umami, vue, nextjs, vanilla-ts, session-replay, error-tracking, typescript, sdk]
---

# @umami_router/sdk Integration Guide

This skill covers integration patterns and API usage for `@umami_router/sdk` (`v0.3.0+`) and `@umami_router/server` (`v0.2.0+`), supporting **Umami v3.5.0+** (analytics, Session Replay, Heatmaps, browser Error Tracking, and Core Web Vitals performance).

## SDK Source Policy (must follow)

When the SDK is not available locally, agents must fetch SDK artifacts from the project GitHub Releases only:

- Repository: `https://github.com/yuanshanxike/Umami-Router.git`
- Releases: `https://github.com/yuanshanxike/Umami-Router/releases`

Mandatory rules:

- Do not install `@umami_router/sdk` from npm.
- Do not install from any third-party registry or mirrored repository.
- Prefer local SDK package tarball first: search project root for `umami_router-sdk*.tgz` (version matched by wildcard).
- If no local `umami_router-sdk*.tgz` is found, download the latest `.tgz` asset from GitHub Releases and use that artifact.

### SDK acquisition workflow (required)

1. Check local project path first:
   - Look for: `./umami_router-sdk*.tgz` (version is dynamic, wildcard required).
   - If multiple files are found, prefer the newest one.
2. If not found locally:
   - Open Releases: `https://github.com/yuanshanxike/Umami-Router/releases`
   - Select the latest release.
   - Find asset by pattern `umami_router-sdk*.tgz` (do not use fixed filename).
   - Download the matched `.tgz` SDK asset from that latest release.
3. Use the downloaded/local `.tgz` package for integration.
4. For standard apps whose lockfile does not need the `.tgz` during remote Docker builds, delete the temporary `.tgz` after install succeeds; for Dockerized apps that `COPY umami_router-sdk-*.tgz ./` before `bun install` / `npm ci`, keep the `.tgz` referenced by `package.json` and `Dockerfile`.

### Example latest release download (dynamic filename)

```bash
ASSET_URL=$(curl -fsSL https://api.github.com/repos/yuanshanxike/Umami-Router/releases/latest \
  | jq -r '.assets[] | select(.name | test("^umami_router-sdk.*\\.tgz$")) | .browser_download_url' \
  | head -n 1)

SDK_TGZ="$(basename "$ASSET_URL")"
curl -fL "$ASSET_URL" -o "$SDK_TGZ"
```

## Package Structure & Entry Points

```typescript
import '@umami_router/sdk'          // Full exports (core + Vue + Next.js)
import '@umami_router/sdk/core'     // Framework-agnostic core (initBrowserTracker, mountUmamiScripts, UmamiTracker, RetryQueue, createUmamiRouterClient)
import '@umami_router/sdk/vue'      // Vue 3 integration (no React/Next peer deps required)
import '@umami_router/sdk/nextjs'   // Next.js subpath export
// '@umami_router/sdk/browser'      // Prebuilt minified IIFE bundle (dist/browser.global.js) for static HTML <script src="...">
```

### Import Path Policy (required)

- **Next.js**: always import from `@umami_router/sdk` (root entry). If existing code imports from `@umami_router/sdk/nextjs` and build/lint shows module resolution errors, rewrite imports to `@umami_router/sdk`.
- **Vanilla TS / Vite / non-React/non-Vue SPAs**: import from `@umami_router/sdk/core` (`initBrowserTracker`, `UmamiTracker`, etc.) so React/Vue peer dependencies are not pulled in.
- **Static HTML / No-bundler projects**: copy `node_modules/@umami_router/sdk/dist/browser.global.js` (or extract `package/dist/browser.global.js` from the release `.tgz`) to a static asset path such as `public/umami-tracker.js` or `libs/umami-tracker.js` and load via `<script src="/umami-tracker.js" data-umami-router-website-id="..." defer></script>`.

## Core Options & Umami v3.5.0+ Behavior

### TrackerOptions
```typescript
interface TrackerOptions {
  websiteId: string;                        // Required: Umami website UUID
  proxyPath?: string;                       // Optional: tRPC proxy path (default: '/trpc')
  autoTrack?: boolean;                      // Optional: auto pageviews (default: true)
  recorder?: RecorderOptions | boolean;     // Optional: enable Session Replay / Heatmaps
  errors?: ErrorTrackingOptions | boolean;  // Optional: Umami v3.5.0+ automatic JS error tracking (data-errors="true")
  performance?: boolean;                    // Optional: Core Web Vitals tracking (data-performance="true")
  retryQueueSize?: number;                  // Optional: max queued retries (default: 100)
  retryAttempts?: number;                   // Optional: retry attempts (default: 3)
  retryDelay?: number;                      // Optional: delay between retries in ms (default: 1000)
}
```

### Important: Umami v3.5.0+ Session Replay & Heatmaps Configuration
- Starting in **Umami v3.5.0**, `recorder.js` fetches recording & heatmap parameters dynamically from `GET /umami/api/websites/:websiteId/recorder` (`enabled`, `replayEnabled`, `heatmapEnabled`, `sampleRate`, `heatmapSampleRate`, `maskLevel`, `maxDuration`, `blockSelector`).
- Client-side `data-sample-rate`, `data-mask-level`, `data-max-duration`, and `data-block-selector` attributes (`RecorderOptions`) are **ignored by Umami v3.5+ `recorder.js`** (kept in the SDK only for Umami `<= 3.4` backward compatibility).
- To change sampling rate, mask level (`moderate` vs `strict`), or block selector in Umami `v3.5+`, configure the website in the **Umami dashboard / database (`website.recorder_enabled` and `website.replay_config`)**, and add `data-umami-replay-block` directly to sensitive DOM containers (e.g., `<dialog id="modal" data-umami-replay-block>`).
- Session Replay uses an inline Web Worker via Blob URLs; sites with strict `Content-Security-Policy` headers **must include `worker-src 'self' blob:;`**.

## Integrations

### 1. Vanilla TypeScript / Vite (No Framework)

```typescript
// src/analytics.ts
import { initBrowserTracker } from '@umami_router/sdk/core';

const analytics = initBrowserTracker({
  websiteId: import.meta.env.VITE_UMAMI_WEBSITE_ID,
  proxyPath: import.meta.env.VITE_UMAMI_PROXY_PATH || '/trpc',
  autoTrack: true,
  recorder: true,
  errors: { release: '1.0.0', environment: 'production' },
  performance: true,
});

export const trackEvent = analytics.trackEvent;
export const captureException = analytics.captureException;
export const identifyUser = analytics.identify;
```

### 2. Static HTML (No Build Step)

Copy `dist/browser.global.js` to `/umami-tracker.js` and add it to `<head>`:

```html
<script
  src="/umami-tracker.js"
  data-umami-router-website-id="your-website-id"
  data-umami-router-proxy-path="/trpc"
  data-umami-router-errors="true"
  data-umami-router-performance="true"
  defer
></script>
```

Optional `<script>` attributes:
- `data-umami-router-auto-track="false"` — disable initial automatic pageview
- `data-umami-router-recorder="false"` — disable `recorder.js` injection (enabled by default in the static bootstrapper)
- `data-umami-router-release="1.0.0"` / `data-umami-router-environment="production"` — error tracking metadata

Global helpers attached to `window`:
- `window.__umamiTrack?.('event_name', { key: 'value' })`
- `window.umamiRouter` — full `BrowserTrackerHandle` (`trackEvent`, `trackPageview`, `identify`, `captureException`, `ready`, `destroy`)

### 3. Vue 3

```typescript
// main.ts
import { createApp } from 'vue';
import { createUmamiPlugin } from '@umami_router/sdk/vue';

const umamiPlugin = createUmamiPlugin({
  websiteId: import.meta.env.VITE_UMAMI_WEBSITE_ID,
  proxyPath: '/trpc',
  autoTrack: true,
  useRouter: true,
  recorder: true,
  errors: true,
  performance: true,
});

const app = createApp(App);
app.use(router);
app.use(umamiPlugin);
app.mount('#app');
```

Composables (`@umami_router/sdk/vue`):
- `useTracker()` -> `{ tracker, track, autoTrackPageviews, readyPromise, isAutoTrackEnabled, enableAutoTrack, disableAutoTrack }`
  (`track` provides `pageview`, `event`, `identify`, `captureException`, `track`)
- `usePageTrack(getPath)` -> `{ trackPageview }`
- `useEventTrack()` -> `{ trackEvent }`

### 4. Next.js 14+ (App Router & Pages Router)

```typescript
// components/TrackerProvider.tsx
'use client';

import { usePathname } from 'next/navigation';
import { useUmami, usePageviewTracking, useEventTracking } from '@umami_router/sdk';
import type { NextjsTrackerOptions } from '@umami_router/sdk';

export function TrackerProvider({ children, options }: { children: React.ReactNode; options: NextjsTrackerOptions }) {
  const pathname = usePathname();
  useUmami(options);
  usePageviewTracking(() => pathname);
  useEventTracking();
  return <>{children}</>;
}
```

```typescript
// app/layout.tsx
import { TrackerProvider } from '@/components/TrackerProvider';

const TRACKER_OPTIONS = {
  websiteId: process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID ?? '',
  proxyPath: process.env.NEXT_PUBLIC_UMAMI_PROXY_PATH ?? '/trpc',
  autoTrack: true,
  recorder: true,
  errors: true,
};
```

Pages Router equivalents from `@umami_router/sdk`:
`useUmamiPagesRouter`, `usePageviewTrackingPagesRouter`, `useEventTrackingPagesRouter`.

## Same-Origin Reverse Proxy Templates (Production)

To avoid CORS issues and ad-blocker rejections, route `/trpc/*` and `/umami/*` through the application's own origin to `@umami_router/server`:

### Next.js (`next.config.mjs` / `next.config.ts`)
```javascript
async rewrites() {
  const target = process.env.UMAMI_SERVER_ORIGIN ?? 'http://localhost:3000';
  return [
    { source: '/trpc/:path*', destination: `${target}/trpc/:path*` },
    { source: '/umami/:path*', destination: `${target}/umami/:path*` },
  ];
}
```

### Nginx (`nginx.conf` for Vite / Static SPAs)
Use **`^~`** so regex static-asset rules (`location ~* \.(js|css|...)$`) do **not** intercept `/umami/script.js` or `/umami/recorder.js`:

```nginx
resolver 8.8.8.8 1.1.1.1 valid=300s ipv6=off;

location ^~ /trpc/ {
    set $umami_upstream "https://your-router-server.example.com";
    proxy_pass $umami_upstream;
    proxy_ssl_server_name on;
    proxy_ssl_name your-router-server.example.com;
    proxy_set_header Host your-router-server.example.com;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location ^~ /umami/ {
    set $umami_upstream "https://your-router-server.example.com";
    proxy_pass $umami_upstream;
    proxy_ssl_server_name on;
    proxy_ssl_name your-router-server.example.com;
    proxy_set_header Host your-router-server.example.com;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

### Custom Node.js HTTP Proxy
When proxying `/trpc` and `/umami` inside a custom Node server:
- Forward request headers: `origin`, `user-agent`, `content-type`, `x-umami-cache`, `x-umami-website-id`, `x-umami-hostname`, `x-forwarded-for`.
- Forward response headers: `content-type`, `cache-control`, `etag`, `vary`, `retry-after`, and CORS headers if present.
- Ensure body size limit allows `>= 1MB` for `/umami/api/record` replay chunks.

## Router Server Routes & Environment (`server/`)

`@umami_router/server` exposes:
- `GET /umami/script.js` — proxied Umami tracking script
- `GET /umami/recorder.js` — proxied Umami replay/heatmap recorder script
- `GET /umami/api/websites/:websiteId/recorder` — proxied Umami `v3.5.0+` server-side recorder config
- `POST /umami/api/send` — proxied events, pageviews, identify, error tracking, and performance payloads (64 KB limit)
- `POST /umami/api/record` — proxied session replay and heatmap payloads (1 MB limit)
- `GET|POST /trpc/*` — tRPC API (`getConfig`, `getHealth` with cached upstream `/api/heartbeat` probe)

### Router Server Variables (`server/.env`)
- `UMAMI_UPSTREAM_HOST` (required): upstream Umami host (`host:port`, e.g. `100.x.x.x:3000`).
- `UMAMI_WEBSITE_IDS` (optional): comma-separated allowed Website IDs.
- `UMAMI_WEBSITE_ID` (optional): fallback single Website ID.
- `UMAMI_ALLOWED_ORIGINS` (strongly recommended): comma-separated CORS origin allowlist (also checked for same-origin proxies forwarding the `Origin` header). Empty rejects all cross-origin and `/api/send` / `/api/record` requests with `403`.
- `UMAMI_TIMEOUT_MS` (optional, default `5000`): upstream request timeout in ms.
- `UMAMI_HEALTH_CACHE_TTL_MS` (optional, default `15000`): cache TTL for `/api/heartbeat` checks in `getHealth()` (`0` disables caching).
- `UMAMI_RATE_LIMIT_WINDOW_MS` (optional, default `60000`): rate-limit window in ms.
- `UMAMI_RATE_LIMIT_MAX` (optional, default `100`): max requests per IP per window (increase if enabling Replay + Heatmaps heavily).
- `UMAMI_SCRIPT_PATH` (optional, default `/script.js`): upstream script path.
- `UMAMI_RECORDER_PATH` (optional, default `/recorder.js`): upstream recorder script path.
- `PORT` (optional, default `3000`): listen port.

## Agent Post-Task Handoff (required)

After integration/configuration work, agents must guide users through next steps:

1. List every required environment variable with exact file location (`.env`, `.env.local`, `server/.env`).
2. Mark each variable as required or optional and include default values where applicable.
3. Explain how to configure same-origin routing to the router server (Vite dev proxy / Nginx `location ^~` / Next.js rewrites / custom Node proxy).
4. Remind the user to register the Website ID in Umami, enable `recorder_enabled` / configure `replay_config` in Umami UI/DB if using Session Replay or Heatmaps (Umami `v3.5+`), and add all deployed origins to `UMAMI_ALLOWED_ORIGINS` + `UMAMI_WEBSITE_IDS` on the router server.

## Agent Post-Task Validation (required)

After code/config updates, agents must run project checks before finishing:

1. Run lint/type checks in the target project.
2. Run tests (if defined) and build in the target project.
3. If checks fail due to import path resolution for Next.js APIs:
   - replace `@umami_router/sdk/nextjs` imports with `@umami_router/sdk`
   - rerun lint/build until pass or report a concrete blocker
4. Include validation result summary in the final response (passed commands and any remaining blockers).

Validation command policy:
- If `package.json` has scripts, run available checks in order: `lint`, `typecheck` (if exists), `test` (if exists), `build`.
- Use the project's package manager consistently (`bun`, `pnpm`, `npm`, or `yarn`).
- Do not skip checks unless the project has no corresponding script; if skipped, state the reason explicitly.
