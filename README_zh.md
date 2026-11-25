[English](./README.md) | [简体中文](./README_zh.md) | [日本語](./README_ja.md)

# Umami Router

本项目基于 [Umami](https://github.com/umami-software/umami)（兼容 `v3.5.0+`）进行二次开发。

## 简介

**Umami Router** 是一个代理服务器和客户端 SDK，旨在帮助前端应用程序更安全、便捷地集成 Umami 数据分析服务。

本项目的**主要目的**是：方便地将来自不同网站的打点数据统一路由到自己所指定的某一台服务器上。

### 典型使用场景

对于个人使用，你可以用它极大地简化云端网页的数据统计流程。通过将本项目的 `router server` 部署在云服务器上，它可以接收各个暴露在公网的前端页面的打点请求，并将打点数据统一转发到处于同一 **Tailscale** 内网中的本地服务器的 Umami 数据库中。这样，你就可以在本地轻松且安全地查看网页的数据行为，而无需将 Umami 的数据库服务直接暴露在公网环境中。

## 项目结构

本项目使用 **Bun** 作为包管理器，采用 Monorepo 结构：

- **`server/`**: 基于 Node.js/Bun 编写的代理服务器 (`@umami_router/server`)。负责代理 Umami 的脚本、录制配置、事件上报、错误追踪、性能指标与 Session Replay/Heatmap 数据，内置 CORS 与 Origin 校验、`x-umami-*` 请求头转发、结构化日志、限流保护（含 `Retry-After`）以及真实的 `/api/heartbeat` 上游健康探测。
- **`sdk/`**: 供前端应用使用的 TypeScript 客户端 SDK (`@umami_router/sdk`)。包含无框架核心入口 (`@umami_router/sdk/core`)、纯静态站点开箱即用 IIFE 包 (`@umami_router/sdk/browser`)，以及 **Vue 3** (`@umami_router/sdk/vue`) 和 **Next.js 14+** (`@umami_router/sdk`) 的框架集成。
- **`demo/`**: 演示如何接入 SDK 的示例应用（`demo/vue/` 与 `demo/nextjs/`）。

## AI Agent Skill 集成

本项目包含一个 **AI Agent skill**（`skills/umami-sdk/`），用于在使用 `@umami_router/sdk` 集成时提供上下文指导，兼容 Claude Code、Gemini CLI 等 Agent 工具。

### 安装方法

**1. 快速安装（推荐）**
```bash
npx skills install yuanshanxike/Umami-Router
```

**2. 手动安装**
将 `skills/umami-sdk/` 复制到你的 Agent skills 目录（如 `~/.claude/skills/` 或 `~/.gemini/skills/`）。

## 接入 / 框架集成

### Umami v3.5.0+ 重要变更说明

- **Session Replay & Heatmaps 配置机制**：从 Umami `v3.5.0` 起，`recorder.js` 会向 `GET /umami/api/websites/:id/recorder` 拉取服务端录制配置（`enabled`、`replayEnabled`、`heatmapEnabled`、`sampleRate`、`heatmapSampleRate`、`maskLevel`、`maxDuration`、`blockSelector`）。前端传递的 `RecorderOptions` 属性（`sampleRate`、`maskLevel`、`maxDuration`、`blockSelector`）在 `v3.5+` 中会被忽略，仅保留用于兼容 Umami `<= 3.4`。请在 Umami 后台管理采样率与遮罩级别，并在敏感 DOM 元素上添加 `data-umami-replay-block`。
- **CSP 策略**：Session Replay 会使用 Blob Web Worker，启用严格 CSP 的站点须放行 `worker-src 'self' blob:;`。

### Vue 3 项目

**1. 注册插件**
```typescript
import { createApp } from 'vue';
import { createUmamiPlugin } from '@umami_router/sdk/vue';
import App from './App.vue';
import router from './router';

const app = createApp(App);

app.use(createUmamiPlugin({
  websiteId: import.meta.env.VITE_UMAMI_WEBSITE_ID,
  proxyPath: '/trpc', // 代理服务器路径
  autoTrack: true,
  useRouter: true,    // 监听路由变化自动上报 pageview
  recorder: true,     // 启用 Replays / Heatmaps（v3.5+ 由服务端控制参数）
  errors: true,       // 可选：Umami v3.5.0+ 前端异常自动捕获
  performance: true,  // 可选：Core Web Vitals 性能指标采集
}));

app.use(router);
app.mount('#app');
```

**2. 在组件中追踪自定义事件**
```vue
<script setup lang="ts">
import { useEventTrack } from '@umami_router/sdk/vue';

const { trackEvent } = useEventTrack();

const handleClick = () => {
  trackEvent('button_click', { buttonName: 'submit' });
};
</script>
```

**3. 配置开发代理 (`vite.config.ts`) 与生产 Nginx**
本地开发可在 `vite.config.ts` 配置代理：

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

生产环境使用 Nginx 时，务必使用 **`location ^~`** 前缀匹配，避免被静态资源正则（如 `.js` 缓存规则）误拦截 `/umami/script.js` 和 `/umami/recorder.js`：

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

### Next.js 14+ 项目 (App Router)

**1. 创建 Provider 组件 (`components/TrackerProvider.tsx`)**
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

**2. 配置 API 路由重写 (`next.config.mjs`)**
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

### Vanilla TypeScript / 纯静态 HTML 站点

**1. Vanilla TS（`@umami_router/sdk/core`）**
```typescript
import { initBrowserTracker } from '@umami_router/sdk/core';

export const analytics = initBrowserTracker({
  websiteId: import.meta.env.VITE_UMAMI_WEBSITE_ID,
  proxyPath: '/trpc',
  autoTrack: true,
  recorder: true,
  errors: true,
});

await analytics.trackEvent('button_click', { id: 'cta' });
await analytics.captureException(new Error('Something failed'));
```

**2. 纯静态 HTML（`@umami_router/sdk/browser` -> `dist/browser.global.js`）**
将 `dist/browser.global.js` 复制到静态目录（如 `/umami-tracker.js`）：
```html
<script
  src="/umami-tracker.js"
  data-umami-router-website-id="your-website-id"
  data-umami-router-errors="true"
  defer
></script>
```
脚本会自动暴露 `window.__umamiTrack(name, data)` 与 `window.umamiRouter`。

## 服务器路由 (`@umami_router/server`)

| 方法与路径 | 说明 |
| --- | --- |
| `GET /umami/script.js` | 代理上游 Umami 追踪脚本 |
| `GET /umami/recorder.js` | 代理上游 Session Replay / Heatmap 录制脚本 |
| `GET /umami/api/websites/:id/recorder` | 代理 Umami `v3.5.0+` 服务端录制配置接口 |
| `POST /umami/api/send` | 代理 pageview、事件、identify、错误追踪与性能上报（上限 64 KB） |
| `POST /umami/api/record` | 代理 Session Replay 与 Heatmap 数据（上限 1 MB） |
| `GET / POST /trpc/*` | tRPC 接口（`getConfig`、`getHealth` 含带缓存的 `/api/heartbeat` 探活） |

## 环境变量配置

### 服务器配置 (`server/`)

**关于 CORS 的重要说明：** 若未配置 `UMAMI_ALLOWED_ORIGINS`，默认情况下**所有跨域请求以及 `/umami/api/send` / `/umami/api/record` 请求都将被拒绝**并返回 `403 Forbidden`。

| 环境变量 | 说明 | 默认值 / 要求 |
| --- | --- | --- |
| `UMAMI_UPSTREAM_HOST` | 上游真实的 Umami 服务器地址（如 `localhost:3000` 或 Tailscale IP）。 | **必填** |
| `UMAMI_WEBSITE_IDS` | 允许接入的 Website IDs（逗号分隔），用于白名单校验。 | 选填 |
| `UMAMI_WEBSITE_ID` | 兜底的默认 Website ID。 | 选填 |
| `UMAMI_ALLOWED_ORIGINS` | 允许的 Origin 列表（逗号分隔）。 | 选填（为空则拒绝跨域请求） |
| `UMAMI_TIMEOUT_MS` | 代理请求的超时时间（毫秒）。 | `5000` |
| `UMAMI_HEALTH_CACHE_TTL_MS` | `getHealth()` 探活 `/api/heartbeat` 的缓存 TTL（毫秒，`0` 表示不缓存）。 | `15000` |
| `UMAMI_RATE_LIMIT_WINDOW_MS` | 限流窗口时间（毫秒）。 | `60000` |
| `UMAMI_RATE_LIMIT_MAX` | 每个限流窗口内允许的最大请求数。 | `100` |
| `UMAMI_SCRIPT_PATH` | 上游 Umami 脚本路径。 | `/script.js` |
| `UMAMI_RECORDER_PATH` | 上游 Umami 录制脚本路径。 | `/recorder.js` |
| `PORT` | 代理服务器监听端口。 | `3000` |

### Vue 演示项目配置 (`demo/vue/`)

| 环境变量 | 说明 |
| --- | --- |
| `VITE_UMAMI_WEBSITE_ID` | 在 Umami 后台申请的 Website ID。 |
| `VITE_UMAMI_PROXY_PATH` | SDK 用于请求代理服务器的路径（默认：`/trpc`）。 |
| `VITE_UMAMI_SERVER_ORIGIN` | 在 `vite.config.ts` 中用于本地开发代理的服务器 Origin。 |

### Next.js 演示项目配置 (`demo/nextjs/`)

| 环境变量 | 说明 |
| --- | --- |
| `NEXT_PUBLIC_UMAMI_WEBSITE_ID` | 在 Umami 后台申请的 Website ID。 |
| `NEXT_PUBLIC_UMAMI_PROXY_PATH` | SDK 用于请求代理服务器的路径（默认：`/trpc`）。 |
| `UMAMI_SERVER_ORIGIN` | 在 `next.config.mjs` 中用于路由重写的服务器 Origin。 |

## 快速开始

本项目依赖 **Bun** (`bun@1.3.9+`)。

**1. 安装依赖并运行校验**
```bash
cd server && bun install && bun run typecheck && bun test
cd ../sdk && bun install && bun run typecheck && bun test && bun run build
```

**2. 启动代理服务器**
```bash
cd server
cp .env.example .env
bun run dev
```

**3. 运行演示项目**
```bash
# 启动 Next.js 演示
cd demo/nextjs && bun run dev

# 或者启动 Vue 演示
cd demo/vue && bun run dev
```

## 开源协议

本项目基于 [MIT 协议](./LICENSE) 开放源代码。
