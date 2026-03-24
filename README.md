[English](./README.md) | [简体中文](./README_zh.md) | [日本語](./README_ja.md)

# Umami Router

This project is a secondary development based on [Umami](https://github.com/umami-software/umami).

## Overview

**Umami Router** is a proxy server and client SDK designed to help frontend applications securely and efficiently integrate with Umami Analytics.

The **main purpose** of this project is to provide a convenient way to route tracking data from various independent websites to a single, designated upstream server.

### Typical Use Case

For personal use, it makes tracking data from cloud-deployed websites extremely simple and secure. You can deploy this `router server` on your cloud server alongside your web applications. The router collects the tracking data and securely forwards it to a local server running the Umami database within the same **Tailscale** private network. This allows you to easily monitor your websites' traffic and data behaviors locally, without exposing your Umami database instance directly to the public internet.

## Project Structure

The project is structured as a monorepo utilizing **Bun**:

- **`server/`**: A Node.js/Bun proxy server (`@umami_router/server`) that routes the Umami script and tracking requests. Features include CORS handling, origin validation, request logging, and rate-limiting.
- **`sdk/`**: A TypeScript client SDK (`@umami_router/sdk`) for frontend applications, providing core tracking capabilities with dedicated framework integrations for **Vue 3** and **Next.js 14+**.
- **`demo/`**: Demonstration apps using the SDK.
  - `demo/vue/`: Vue 3 + Vite integration example.
  - `demo/nextjs/`: Next.js 14 App Router integration example.

## AI Agent Skill Integration

This project includes an **AI Agent skill** (`skills/umami-sdk/`) that provides contextual guidance when integrating `@umami_router/sdk` into your applications. It is compatible with agent CLIs like Claude Code and Gemini CLI.

### What the Skill Provides

The skill automatically activates when working on:
- SDK integration with Vue 3 or Next.js
- Tracking pageviews and events implementation
- Tracker options configuration
- Using `createUmamiPlugin`, `useTracker`, `usePageTrack`, `useEventTrack` (Vue)
- Using `useUmami`, `usePageviewTracking`, `useEventTracking` (and their Pages Router variants in Next.js)
- Type definitions (`TrackerConfig`, `HealthStatus`, `TrackOptions`)
- Setting up the proxy server for Umami
- Troubleshooting tracker initialization or tracking failures

### Installation

**1. Quick Installation (Recommended)**

You can quickly install the skill directly from this repository:

```bash
npx skills install yuanshanxike/Umami-Router
```

**2. Manual Installation**

Copy the skill folder into your agent's skills directory (e.g., `~/.claude/skills/` or `~/.gemini/skills/`):

```bash
# The skill is located at:
skills/umami-sdk/
```

### Usage Example

The skill enables AI agents to help with tasks like:

- Track custom events in Vue components
- Configure auto-tracking for Next.js App Router
- Set up the tracker with custom proxy paths
- Implement pageview tracking with route changes
- Debug tracker initialization issues

## Usage / Integration

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

**3. Configure Development Proxy (`vite.config.ts`)**
To avoid CORS issues during local development, configure the Vite proxy to route tracking requests to your router server. 

**Note:** This proxy is only active during development (`vite dev`). In production, you must configure your web server (e.g., Nginx `location` block, Vercel `rewrites`, or Cloudflare) to reverse proxy `/trpc` and `/umami` to the router server.

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

### Next.js 14 (App Router)

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
  });

  // Auto track pageviews on route changes
  usePageviewTracking(() => pathname);
  // Expose event tracking to child components
  useEventTracking();

  return <>{children}</>;
}
```

**2. Wrap your application (`app/layout.tsx`)**
```tsx
import { TrackerProvider } from '@/components/TrackerProvider';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TrackerProvider>
          {children}
        </TrackerProvider>
      </body>
    </html>
  );
}
```

**3. Track Events in Client Components**
```tsx
'use client';

import { useEventTracking } from "@umami_router/sdk";

export default function TrackedButton() {
  const { trackEvent } = useEventTracking();

  return (
    <button onClick={() => trackEvent("custom_click", { foo: "bar" })}>
      Track
    </button>
  );
}
```

**4. Configure API Rewrites (`next.config.mjs`)**
To avoid CORS issues and route tracking requests securely as same-origin requests, configure Next.js rewrites to proxy the traffic to your router server. 

**Note:** This works in both development and production (`next start`). However, if you are using static HTML exports (`output: 'export'`), Next.js rewrites are not supported, and you must configure a reverse proxy on your deployment platform.

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

## Environment Variables

### Server Configuration (`server/`)

The proxy server relies on the following environment variables to route traffic securely.

**Important Note on CORS:** For security reasons, if the origin whitelist (`UMAMI_ALLOWED_ORIGINS`) is not configured, **all cross-origin requests will be rejected** with a `403 Forbidden` error by default. You must explicitly configure this whitelist to include the domains from which you expect to receive tracking data.

| Variable | Description | Default / Requirement |
| --- | --- | --- |
| `UMAMI_UPSTREAM_HOST` | The upstream Umami host (e.g., `localhost:3000` or a Tailscale IP). | **Required** |
| `UMAMI_WEBSITE_IDS` | Comma-separated list of allowed Website IDs for tracking. | Optional |
| `UMAMI_WEBSITE_ID` | Fallback single Website ID. | Optional |
| `UMAMI_TIMEOUT_MS` | Proxy request timeout in milliseconds. | `5000` |
| `UMAMI_RATE_LIMIT_WINDOW_MS`| Rate limiting window in milliseconds. | `60000` |
| `UMAMI_RATE_LIMIT_MAX` | Maximum number of requests allowed per window. | `100` |
| `UMAMI_ALLOWED_ORIGINS` | Comma-separated list of allowed origins (CORS). | Optional (Rejects all cross-origin if empty) |
| `UMAMI_SCRIPT_PATH` | Custom path to the upstream Umami tracking script. | `/script.js` |
| `PORT` | The port the proxy server listens on. | `3000` |

### Vue Demo Configuration (`demo/vue/`)

Place these variables in a `.env` file within the `demo/vue` directory.

| Variable | Description |
| --- | --- |
| `VITE_UMAMI_WEBSITE_ID` | The Website ID registered in your Umami dashboard. |
| `VITE_UMAMI_PROXY_PATH` | The path the SDK uses to reach the proxy server (Default: `/trpc`). |
| `VITE_UMAMI_SERVER_ORIGIN` | The origin of the proxy server used in `vite.config.ts` for local proxying (e.g., `http://localhost:3000`). |

### Next.js Demo Configuration (`demo/nextjs/`)

Place these variables in a `.env.local` file within the `demo/nextjs` directory.

| Variable | Description |
| --- | --- |
| `NEXT_PUBLIC_UMAMI_WEBSITE_ID`| The Website ID registered in your Umami dashboard. |
| `NEXT_PUBLIC_UMAMI_PROXY_PATH`| The path the SDK uses to reach the proxy server (Default: `/trpc`). |
| `UMAMI_SERVER_ORIGIN` | The origin of the proxy server used in `next.config.mjs` for routing (e.g., `http://localhost:3000`). |

## Getting Started

The project heavily relies on **Bun** (`bun@1.3.9+`) as its primary package manager and task runner.

**1. Install dependencies**
```bash
# In the root directory
bun install
```

**2. Start the proxy server**
```bash
cd server
# Copy and configure your environment variables
# cp .env.example .env 
bun run dev
```

**3. Run the demos**
```bash
# For Next.js Demo
cd demo/nextjs
bun run dev

# For Vue Demo
cd demo/vue
bun run dev
```

## License

This project is licensed under the [MIT License](./LICENSE).
