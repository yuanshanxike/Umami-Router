# umami_router

## Project Overview

`umami_router` is a monorepo project that provides a proxy server and a client SDK for integrating [Umami Analytics](https://umami.is/) (`v3.5.0+` compatible) into frontend applications. It bridges frontend clients (via a tRPC-powered SDK and script/data proxy) and a self-hosted Umami backend over a private network such as Tailscale.

The project consists of the following main components:
- **`sdk/`** (`@umami_router/sdk`): A TypeScript client SDK providing framework-agnostic core (`@umami_router/sdk/core`), a standalone minified browser IIFE bundle (`@umami_router/sdk/browser` -> `dist/browser.global.js`) for static HTML sites, plus dedicated integrations for **Vue 3** (`@umami_router/sdk/vue`) and **Next.js 14+** (`@umami_router/sdk` / `@umami_router/sdk/nextjs`). It supports analytics events, `identify()`, Session Replay / Heatmaps, and Umami `v3.5.0+` error tracking & Core Web Vitals performance reporting.
- **`server/`** (`@umami_router/server`): A Node.js/Bun server using `@trpc/server` and `zod`. It proxies `/umami/script.js`, `/umami/recorder.js`, `/umami/api/websites/:id/recorder`, `/umami/api/send`, `/umami/api/record`, and `/trpc/*` (`getConfig`, `getHealth` with live `/api/heartbeat` probing), handling CORS, origin validation, rate limiting (`Retry-After`), and `x-umami-*` header forwarding.
- **`demo/`**: Demonstration apps using the SDK (`demo/vue/` and `demo/nextjs/`).
- **`skills/umami-sdk/`**: AI Agent skill documenting integration patterns and production proxy setup.

**Main Technologies**: TypeScript, Bun, tRPC, Zod, Vue 3, Next.js, tsup (for SDK bundling).

## Building and Running

The project relies on **Bun** (`bun@1.3.9`) as its primary package manager and task runner.

### SDK (`sdk/`)
- **Install dependencies**: `bun install`
- **Development (Watch mode)**: `bun run dev` (uses `tsup --watch`)
- **Build**: `bun run build` (cleans `dist/` and builds ESM/CJS/DTS + `dist/browser.global.js` IIFE with `tsup`)
- **Typecheck**: `bun run typecheck`
- **Tests**: `bun test`

### Server (`server/`)
- **Install dependencies**: `bun install`
- **Development**: `bun run dev` (watches `src/index.ts`)
- **Build**: `bun run build` (uses `tsc`)
- **Start**: `bun run start`
- **Typecheck**: `bun run typecheck`
- **Tests**: `bun test`

### Demos (`demo/vue/` and `demo/nextjs/`)
Navigate to the respective directory and run:
- **Install**: `bun install` (or `npm install`)
- **Run dev server**: `bun run dev`

## Development Conventions

- **Package Manager**: Use `bun` for installing packages and running scripts across the repository.
- **Typing**: Strict TypeScript throughout (avoid `any` and unnecessary `as`). Run `bun run typecheck` and `bun test` to verify no regressions.
- **Server Architecture**: Cross-origin requests and `/umami/api/send` / `/umami/api/record` calls are **denied by default** unless `UMAMI_ALLOWED_ORIGINS` is configured. Origin checks run before CORS header reflection. Forward `x-umami-cache`, `x-umami-website-id`, and `x-umami-hostname` headers upstream.
- **Umami v3.5.0+ Recorder Behavior**: Upstream `recorder.js` fetches replay/heatmap configuration from `GET /umami/api/websites/:id/recorder` and ignores client-side `data-sample-rate` / `data-mask-level` / `data-max-duration` / `data-block-selector` attributes.
- **SDK Exports**: Maintain all exports (`@umami_router/sdk`, `./core`, `./browser`, `./vue`, `./nextjs`) when refactoring.
