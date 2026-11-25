# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`umami_router` is a monorepo providing a proxy server and client SDK for integrating [Umami Analytics](https://umami.is/) (`v3.5.0+` compatible) into frontend applications.

### Components

- **`sdk/`** (`@umami_router/sdk`): TypeScript client SDK with framework-agnostic core (`./core`), standalone browser IIFE bundle (`./browser`), Vue 3 (`./vue`), and Next.js 14+ (`./nextjs` / root) integrations
- **`server/`** (`@umami_router/server`): Node.js/Bun proxy server using tRPC and Zod
- **`demo/`**: Demo applications (Vue 3 + Vite, Next.js 14 App Router)
- **`skills/umami-sdk/`**: AI Agent skill for integrating `@umami_router/sdk`

## Commands

### SDK
```bash
cd sdk
bun install          # Install dependencies
bun run build        # Build ESM/CJS/DTS + browser IIFE bundle with tsup
bun run dev          # Watch mode (tsup --watch)
bun run typecheck    # TypeScript validation
bun test             # Run unit tests
```

### Server
```bash
cd server
bun install
bun run dev          # Development with bun --watch
bun run build        # TypeScript compilation
bun run start        # Production server
bun run typecheck    # TypeScript validation
bun test             # Run integration tests
```

### Demos
```bash
cd demo/vue && bun install && bun run dev    # Vue 3 + Vite
cd demo/nextjs && bun install && bun run dev  # Next.js 14
```

## Architecture

### SDK Structure (`sdk/src/`)

```
sdk/src/
├── core/
│   ├── UmamiTracker.ts   # Core tracking class (pageview, event, identify, captureException, x-umami-cache)
│   ├── RetryQueue.ts     # Failed request retry queue
│   ├── trpc.ts           # tRPC client factory (createUmamiRouterClient)
│   ├── recorder.ts       # Shared script.js / recorder.js injection & initBrowserTracker()
│   ├── browser.ts        # Standalone IIFE browser entry (data-umami-router-* & window.__umamiTrack)
│   └── index.ts          # Framework-agnostic core exports
├── vue/
│   ├── plugin.ts         # Vue plugin (createUmamiPlugin)
│   ├── composable.ts     # Composables (useTracker, usePageTrack, useEventTrack)
│   ├── provider.ts       # UmamiProvider component
│   ├── recorder.ts       # Vue reactive wrapper over core mountUmamiScripts
│   └── index.ts          # Vue exports
├── nextjs/
│   ├── app-router.ts     # App Router hooks
│   ├── pages-router.ts   # Pages Router hooks
│   ├── recorder.ts       # React hook wrapper over core mountUmamiScripts
│   └── index.ts          # Next.js exports
├── types/
│   └── index.ts          # Shared TypeScript interfaces
└── index.ts              # Main exports (core + Vue + Next.js)
```

**SDK Exports** via `package.json` `exports`:
- `@umami_router/sdk` (main) - Core + Vue + Next.js
- `@umami_router/sdk/core` - Framework-agnostic core (`initBrowserTracker`, `UmamiTracker`, etc.)
- `@umami_router/sdk/browser` - Minified standalone IIFE bundle (`dist/browser.global.js`) for static HTML sites
- `@umami_router/sdk/vue` - Vue 3 integration
- `@umami_router/sdk/nextjs` - Next.js integration

### Server Structure (`server/src/`)

```
server/src/
├── index.ts              # HTTP server with route handlers & CORS enforcement
├── trpc.ts               # tRPC router definition (getConfig, getHealth)
├── UmamiProxyService.ts  # Umami API proxy logic, heartbeat probe & rate limiting
├── rate-limiter.ts       # Sliding window rate limiter
├── logger.ts             # JSON structured logging utility
└── types/env.ts          # Environment type definitions
```

**Server Routes**:
- `GET /umami/script.js` - Proxied Umami tracking script
- `GET /umami/recorder.js` - Proxied Umami Session Replay / Heatmap recorder script
- `GET /umami/api/websites/:websiteId/recorder` - Proxied Umami `v3.5.0+` server-side recorder config
- `POST /umami/api/send` - Proxied events, pageviews, identify, error tracking, and performance payloads (64 KB limit)
- `POST /umami/api/record` - Proxied session replay and heatmap payloads (1 MB limit)
- `/trpc/*` - tRPC API endpoints (`getConfig`, `getHealth`)

### Key Implementation Notes

- **Package Manager**: Bun (`bun@1.3.9`)
- **TypeScript**: Strict typing throughout (avoid `any` and unnecessary `as`); run `bun run typecheck` and `bun test` before committing
- **Server Origin Validation**: `UmamiProxyService.checkOrigin()` and `checkSendOrigin()` validate origins against the `UMAMI_ALLOWED_ORIGINS` environment variable (comma-separated). Requests with disallowed origins are rejected before setting CORS headers; `/umami/api/send` and `/umami/api/record` also require a valid `Origin` header.
- **Umami v3.5.0 Recorder Config**: `recorder.js` loads replay/heatmap configuration from `GET /umami/api/websites/:id/recorder` and ignores client `data-sample-rate` / `data-mask-level` / `data-max-duration` / `data-block-selector` attributes (`RecorderOptions` remain for Umami `<= 3.4` compatibility).
- **Upstream Health Probe**: `getHealth()` probes `${UMAMI_UPSTREAM_HOST}/api/heartbeat` with an in-memory cache (`UMAMI_HEALTH_CACHE_TTL_MS`, default `15000` ms).
- **SDK Release Process**: Releases are triggered by git tags matching `v*` or `release*`. The CI workflow runs `bun pm pack` to create a `.tgz` package for GitHub releases.
