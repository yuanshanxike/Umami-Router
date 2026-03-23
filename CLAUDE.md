# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`umami_router` is a monorepo providing a proxy server and client SDK for integrating [Umami Analytics](https://umami.is/) into frontend applications.

### Components

- **`sdk/`** (`@umami_router/sdk`): TypeScript client SDK with Vue 3 and Next.js 14+ integrations
- **`server/`** (`@umami_router/server`): Node.js/Bun proxy server using tRPC and Zod
- **`demo/`**: Demo applications (Vue 3 + Vite, Next.js 14 App Router)

## Commands

### SDK
```bash
cd sdk
bun install          # Install dependencies
bun run build        # Build with tsup
bun run dev          # Watch mode (tsup --watch)
bun run typecheck    # TypeScript validation
```

### Server
```bash
cd server
bun install
bun run dev          # Development with bun --watch
bun run build        # TypeScript compilation
bun run start        # Production server
bun run typecheck
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
│   ├── UmamiTracker.ts   # Core tracking class
│   ├── RetryQueue.ts     # Failed request retry queue
│   └── trpc.ts           # tRPC client factory (createUmamiRouterClient)
├── vue/
│   ├── plugin.ts         # Vue plugin (createUmamiPlugin)
│   ├── composable.ts     # Composables (useTracker, usePageTrack, useEventTrack)
│   ├── provider.ts       # UmamiProvider component
│   └── index.ts          # Vue exports
├── nextjs/
│   ├── app-router.ts     # App Router hooks
│   ├── pages-router.ts   # Pages Router hooks
│   └── index.ts          # Next.js exports
└── index.ts              # Main exports (core + Vue + Next.js)
```

**SDK Exports**: Three entry points via `package.json` exports field:
- `@umami_router/sdk` (main) - Core tracking
- `@umami_router/sdk/vue` - Vue 3 integration
- `@umami_router/sdk/nextjs` - Next.js integration

### Server Structure (`server/src/`)

```
server/src/
├── index.ts              # HTTP server with route handlers
├── trpc.ts               # tRPC router definition
├── UmamiProxyService.ts  # Umami API proxy logic
├── rate-limiter.ts       # Rate limiting
├── logger.ts            # Logging utility
└── types/env.ts         # Environment type definitions
```

**Server Routes**:
- `GET /umami/script.js` - Proxied Umami tracking script
- `POST /umami/api/send` - Proxied tracking data endpoint
- `/trpc/*` - tRPC API endpoints

### tRPC Router Pattern

The server uses tRPC for type-safe API communication. Router procedures are defined in `trpc.ts` and called from the SDK via `createUmamiRouterClient()` in `sdk/src/core/trpc.ts`.

### Framework Integration Patterns

**Vue 3**: Uses Vue plugin pattern with `createUmamiPlugin()`. Components use `useTracker()`, `usePageTrack()`, and `useEventTrack()` composables. Wrap app with `UmamiProvider`.

**Next.js 14+**: App Router uses `useUmami()`, `usePageviewTracking()`, `useEventTracking()` hooks. Pages Router has separate hooks with `PagesRouter` suffix.

## Development Notes

- **Package Manager**: Bun (bun@1.3.9 specified in packageManager field)
- **TypeScript**: Strict typing throughout; run `bun run typecheck` before committing
- **Server Origin Validation**: `UmamiProxyService.checkOrigin()` validates CORS origins - add new origins to the allowlist in `UmamiProxyService.ts`
- **SDK Bundling**: Uses tsup for both Node.js and browser builds; Vue plugin is bundled separately
