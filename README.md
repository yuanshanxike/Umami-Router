[English](./README.md) | [简体中文](./README_zh.md) | [日本語](./README_ja.md)

# Umami Router

This project is a secondary development based on [Umami](https://github.com/umami-software/umami) (`v3.5.0+` compatible).

## Overview

**Umami Router** is a proxy server and client SDK designed to help frontend applications securely and efficiently integrate with Umami Analytics.

The **main purpose** of this project is to provide a convenient way to route tracking data from various independent websites to a single, designated upstream server.

### Typical Use Case

For personal use, it makes tracking data from cloud-deployed websites extremely simple and secure. You can deploy this `router server` on your cloud server alongside your web applications. The router collects the tracking data and securely forwards it to a local server running the Umami database within the same **Tailscale** private network. This allows you to easily monitor your websites' traffic and data behaviors locally, without exposing your Umami database instance directly to the public internet.

## Project Structure

The project is structured as a monorepo utilizing **Bun**:

- **`server/`**: A Node.js/Bun proxy server (`@umami_router/server`) that routes Umami scripts, recorder config, analytics events, error tracking, performance metrics, and Session Replay/Heatmap payloads. Features include CORS & origin validation, `x-umami-*` header forwarding, request logging, rate-limiting (`Retry-After`), and real `/api/heartbeat` health probing.
- **`sdk/`**: A TypeScript client SDK (`@umami_router/sdk`) providing a framework-agnostic core (`@umami_router/sdk/core`), a standalone minified browser IIFE bundle (`@umami_router/sdk/browser`), and dedicated integrations for **Vue 3** (`@umami_router/sdk/vue`) and **Next.js 14+** (`@umami_router/sdk`).
- **`demo/`**: Demonstration apps using the SDK.
  - `demo/vue/`: Vue 3 + Vite integration example.
  - `demo/nextjs/`: Next.js 14 App Router integration example.

## AI Agent Skill Integration

This project includes an **AI Agent skill** (`skills/umami-sdk/`) that provides contextual guidance when integrating `@umami_router/sdk` into your applications. It is compatible with agent CLIs like Claude Code and Gemini CLI.

### What the Skill Provides

The skill automatically activates when working on:
- SDK integration with Vue 3, Next.js, Vanilla TS/Vite, or static HTML sites
- Tracking pageviews, events, user identity, browser errors, Core Web Vitals, and Session Replay / Heatmaps
- Configuring `TrackerOptions`, `RecorderOptions`, and `ErrorTrackingOptions`
- Setting up `@umami_router/server` and production reverse proxies (Next.js rewrites, Nginx `^~`, Node.js)
- Troubleshooting tracker initialization, Umami `v3.5.0+` replay config, or CSP issues

### Installation

**1. Quick Installation (Recommended)**

```bash
npx skills install yuanshanxike/Umami-Router
```

**2. Manual Installation**

Copy `skills/umami-sdk/` into your agent's skills directory (e.g., `~/.claude/skills/` or `~/.gemini/skills/`).

## Usage / Integration

### Important Note for Umami v3.5.0+

- **Session Replay & Heatmaps Configuration**: Starting in Umami `v3.5.0`, `recorder.js` fetches its configuration dynamically from `GET /umami/api/websites/:id/recorder` (`enabled`, `replayEnabled`, `heatmapEnabled`, `sampleRate`, `heatmapSampleRate`, `maskLevel`, `maxDuration`, `blockSelector`). Client-side `RecorderOptions` attributes (`sampleRate`, `maskLevel`, `maxDuration`, `blockSelector`) are ignored by Umami `v3.5+` and preserved only for Umami `<= 3.4` compatibility. Manage sampling/masking in the Umami dashboard and mark sensitive elements with `data-umami-replay-block`.
- **Content Security Policy (CSP)**: Session Replay uses Blob Web Workers, so strict CSP headers must allow `worker-src 'self' blob:;`.

### Vue 3

**1. Setup Plugin**
```typescript
import { createApp } from 'vue';
import { createUmamiPlugin } from '@umami_router/sdk/vue';
import App from './App.vue';
import router from './router';

const app = createApp(App);

app.use(createUmamiPlugin({
  websiteId: import.meta.env.VITE_UMAMI_WEBSITE_ID,
  proxyPath: '/trpc', // Path to the proxy server
  autoTrack: true,
  useRouter: true,    // Automatically tracks pageviews on route change
  recorder: true,     // Enable Session Replay / Heatmaps (configured in Umami v3.5+ dashboard)
  errors: true,       // Optional: Umami v3.5.0+ browser error tracking
  performance: true,  // Optional: Core Web Vitals tracking
}));

app.use(router);
app.mount('#app');
```

**2. Track Events in Components**
```vue
<script setup lang="ts">
import { useEventTrack } from '@umami_router/sdk/vue';

const { trackEvent } = useEventTrack();

const handleClick = () => {
  trackEvent('button_click', { buttonName: 'submit' });
};
</script>
```

**3. Configure Development Proxy (`vite.config.ts`) & Production Nginx**
To avoid CORS issues during local development, configure the Vite proxy:

```ts
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const umamiServerOrigin = env.VITE_UMAMI_SERVER_ORIGIN || 'http://localhost:3000';

  return {
    server: {
      proxy: {
        '/trpc': { target: umamiServerOrigin, changeOrigin: true },
        '/umami': { target: umamiServerOrigin, changeOrigin: true },
      },
    },
  };
});
```

In production with Nginx, use **`location ^~`** so static `.js` caching regex rules do not intercept `/umami/script.js` or `/umami/recorder.js`:

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
}

location ^~ /umami/ {
    set $umami_upstream "https://your-router-server.example.com";
    proxy_pass $umami_upstream;
    proxy_ssl_server_name on;
    proxy_ssl_name your-router-server.example.com;
    proxy_set_header Host your-router-server.example.com;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

### Next.js 14+ (App Router)

**1. Create a Provider Component (`components/TrackerProvider.tsx`)**
```tsx
'use client';

import { usePathname } from 'next/navigation';
import { useUmami, usePageviewTracking, useEventTracking } from '@umami_router/sdk';

export function TrackerProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useUmami({
    websiteId: process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID!,
    proxyPath: '/trpc',
    autoTrack: true,
    recorder: true,
    errors: true,
  });

  usePageviewTracking(() => pathname);
  useEventTracking();

  return <>{children}</>;
}
```

**2. Configure API Rewrites (`next.config.mjs`)**
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const target = process.env.UMAMI_SERVER_ORIGIN ?? 'http://localhost:3000';
    return [
      { source: '/trpc/:path*', destination: `${target}/trpc/:path*` },
      { source: '/umami/:path*', destination: `${target}/umami/:path*` },
    ];
  },
};
export default nextConfig;
```

### Vanilla TypeScript / Static HTML

**1. Vanilla TS (`@umami_router/sdk/core`)**
```typescript
import { initBrowserTracker } from '@umami_router/sdk/core';

export const analytics = initBrowserTracker({
  websiteId: import.meta.env.VITE_UMAMI_WEBSITE_ID,
  proxyPath: '/trpc',
  autoTrack: true,
  recorder: true,
  errors: true,
});

// Track events / errors / identity
await analytics.trackEvent('button_click', { id: 'cta' });
await analytics.captureException(new Error('Something failed'));
```

**2. Static HTML (`@umami_router/sdk/browser` -> `dist/browser.global.js`)**
Copy `dist/browser.global.js` to `/umami-tracker.js`:
```html
<script
  src="/umami-tracker.js"
  data-umami-router-website-id="your-website-id"
  data-umami-router-errors="true"
  defer
></script>
```
Exposes `window.__umamiTrack(name, data)` and `window.umamiRouter`.

## Server Routes (`@umami_router/server`)

| Method & Path | Description |
| --- | --- |
| `GET /umami/script.js` | Proxied Umami tracking script |
| `GET /umami/recorder.js` | Proxied Umami Session Replay / Heatmap recorder script |
| `GET /umami/api/websites/:id/recorder` | Proxied Umami `v3.5.0+` server-side recorder config |
| `POST /umami/api/send` | Proxied pageviews, events, identify, errors, and performance metrics (64 KB max) |
| `POST /umami/api/record` | Proxied session replay & heatmap chunks (1 MB max) |
| `GET / POST /trpc/*` | tRPC API (`getConfig`, `getHealth` with live `/api/heartbeat` check) |

## Environment Variables

### Server Configuration (`server/`)

**Important Note on CORS:** If `UMAMI_ALLOWED_ORIGINS` is not configured, **all cross-origin requests and `/api/send` / `/api/record` requests are rejected** with `403 Forbidden`.

| Variable | Description | Default / Requirement |
| --- | --- | --- |
| `UMAMI_UPSTREAM_HOST` | The upstream Umami host (e.g., `localhost:3000` or a Tailscale IP). | **Required** |
| `UMAMI_WEBSITE_IDS` | Comma-separated list of allowed Website IDs for tracking. | Optional |
| `UMAMI_WEBSITE_ID` | Fallback single Website ID. | Optional |
| `UMAMI_ALLOWED_ORIGINS` | Comma-separated list of allowed origins (CORS). | Optional (Rejects cross-origin if empty) |
| `UMAMI_TIMEOUT_MS` | Proxy request timeout in milliseconds. | `5000` |
| `UMAMI_HEALTH_CACHE_TTL_MS` | Upstream `/api/heartbeat` probe cache TTL in ms (`0` disables caching). | `15000` |
| `UMAMI_RATE_LIMIT_WINDOW_MS` | Rate limiting window in milliseconds. | `60000` |
| `UMAMI_RATE_LIMIT_MAX` | Maximum number of requests allowed per window. | `100` |
| `UMAMI_SCRIPT_PATH` | Custom path to the upstream Umami tracking script. | `/script.js` |
| `UMAMI_RECORDER_PATH` | Custom path to the upstream Umami recording script. | `/recorder.js` |
| `PORT` | The port the proxy server listens on. | `3000` |

### Vue Demo Configuration (`demo/vue/`)

| Variable | Description |
| --- | --- |
| `VITE_UMAMI_WEBSITE_ID` | The Website ID registered in your Umami dashboard. |
| `VITE_UMAMI_PROXY_PATH` | The path the SDK uses to reach the proxy server (Default: `/trpc`). |
| `VITE_UMAMI_SERVER_ORIGIN` | The origin of the proxy server used in `vite.config.ts` for local proxying. |

### Next.js Demo Configuration (`demo/nextjs/`)

| Variable | Description |
| --- | --- |
| `NEXT_PUBLIC_UMAMI_WEBSITE_ID` | The Website ID registered in your Umami dashboard. |
| `NEXT_PUBLIC_UMAMI_PROXY_PATH` | The path the SDK uses to reach the proxy server (Default: `/trpc`). |
| `UMAMI_SERVER_ORIGIN` | The origin of the proxy server used in `next.config.mjs` for routing. |

## Getting Started

The project relies on **Bun** (`bun@1.3.9+`) as its primary package manager and task runner.

**1. Install dependencies & run checks**
```bash
cd server && bun install && bun run typecheck && bun test
cd ../sdk && bun install && bun run typecheck && bun test && bun run build
```

**2. Start the proxy server**
```bash
cd server
cp .env.example .env
bun run dev
```

**3. Run the demos**
```bash
# For Next.js Demo
cd demo/nextjs && bun run dev

# For Vue Demo
cd demo/vue && bun run dev
```

## License

This project is licensed under the [MIT License](./LICENSE).
