# umami_router

## Project Overview

`umami_router` is a monorepo project that provides a proxy server and a client SDK for integrating [Umami Analytics](https://umami.is/) into frontend applications. It helps bridge frontend clients (via a tRPC-powered SDK and script proxy) and an Umami backend.

The project consists of the following main components:
- **`sdk/`** (`@umami_router/sdk`): A TypeScript client SDK that provides core tracking capabilities along with dedicated integrations for **Vue 3** and **Next.js 14+**. It uses `@trpc/client` for communicating with the proxy server.
- **`server/`** (`@umami_router/server`): A Node.js/Bun server using `@trpc/server` and `zod`. It serves as a proxy for Umami's tracking script (`/umami/script.js`) and tracking endpoint (`/umami/api/send`), handling CORS, origin validation, and forwarding requests securely.
- **`demo/`**: Contains demonstration apps using the SDK.
  - `demo/vue/`: A Vue 3 + Vite application.
  - `demo/nextjs/`: A Next.js 14 (App Router) application.

**Main Technologies**: TypeScript, Bun, tRPC, Zod, Vue 3, Next.js, tsup (for SDK bundling).

## Building and Running

The project heavily relies on **Bun** (`bun@1.3.9`) as its primary package manager and task runner.

### SDK (`sdk/`)
- **Install dependencies**: `bun install`
- **Development (Watch mode)**: `bun run dev` (uses `tsup --watch`)
- **Build**: `bun run build` (uses `tsup`)
- **Typecheck**: `bun run typecheck`

### Server (`server/`)
- **Install dependencies**: `bun install`
- **Development**: `bun run dev` (watches `src/index.ts`)
- **Build**: `bun run build` (uses `tsc`)
- **Start**: `bun run start`
- **Typecheck**: `bun run typecheck`

### Demos (`demo/vue/` and `demo/nextjs/`)
Navigate to the respective directory and run:
- **Install**: `bun install` (or `npm install`)
- **Run dev server**: `bun run dev`

## Development Conventions

- **Package Manager**: Use `bun` for installing packages and running scripts across the repository.
- **Typing**: The project is strictly typed using TypeScript. Run `bun run typecheck` to ensure no typing regressions.
- **Formatting / Linting**: Currently no specific linter is defined at the root, but ensure code follows modern TypeScript conventions.
- **Server Architecture**: The server acts as a middleware. Any new proxy logic or endpoints should be added following the existing robust patterns (checking CORS, validating origins, logging requests). It makes use of `http` and `@trpc/server/adapters/standalone`. Note that cross-origin requests are **denied by default**; you must explicitly configure the `UMAMI_ALLOWED_ORIGINS` environment variable to allow frontend clients to connect.
- **SDK Exports**: The SDK exposes core functions, as well as specific entry points for frameworks (`@umami_router/sdk/vue` and `@umami_router/sdk/nextjs`). Be careful to maintain these exports when refactoring.
