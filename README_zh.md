[English](./README.md) | [简体中文](./README_zh.md) | [日本語](./README_ja.md)

# Umami Router

本项目基于 [Umami](https://github.com/umami-software/umami) 进行二次开发。

## 简介

**Umami Router** 是一个代理服务器和客户端 SDK，旨在帮助前端应用程序更安全、便捷地集成 Umami 数据分析服务。

本项目的**主要目的**是：方便地将来自不同网站的打点数据统一路由到自己所指定的某一台服务器上。

### 典型使用场景

对于个人使用，你可以用它极大地简化云端网页的数据统计流程。通过将本项目的 `router server` 部署在云服务器上，它可以接收各个暴露在公网的前端页面的打点请求，并将打点数据统一转发到处于同一 **Tailscale** 内网中的本地服务器的 Umami 数据库中。这样，你就可以在本地轻松且安全地查看网页的数据行为，而无需将 Umami 的数据库服务直接暴露在公网环境中。

## 项目结构

本项目使用 **Bun** 作为包管理器，采用 Monorepo 结构：

- **`server/`**: 基于 Node.js/Bun 编写的代理服务器 (`@umami_router/server`)。负责代理 Umami 的 JS 脚本和上报请求，内置了 CORS 校验、域名白名单、请求日志以及限流保护。
- **`sdk/`**: 供前端应用使用的 TypeScript 客户端 SDK (`@umami_router/sdk`)。提供了核心的埋点功能，并针对 **Vue 3** 和 **Next.js 14+** 提供了开箱即用的框架集成。
- **`demo/`**: 演示如何接入 SDK 的示例应用。
  - `demo/vue/`: Vue 3 + Vite 的集成演示。
  - `demo/nextjs/`: Next.js 14 (App Router) 的集成演示。

## 接入 / 框架集成

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

**3. 配置开发代理 (`vite.config.ts`)**
为了在开发环境下避免跨域问题并使请求表现为同源请求，需要在 Vite 中配置代理。

**注意：** 这里的代理配置仅在本地开发 (`vite dev`) 时生效。在生产环境中部署时，你必须在你的 Web 服务器（如 Nginx 配置 `location` 块，或者配置 Vercel、Cloudflare 的反向代理）中设置路由，将 `/trpc` 和 `/umami` 转发到 router server。

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

### Next.js 14 项目 (App Router)

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
  });

  // 监听路由变化自动上报 pageview
  usePageviewTracking(() => pathname);
  // 向子组件暴露事件打点函数
  useEventTracking();

  return <>{children}</>;
}
```

**2. 包裹应用 (`app/layout.tsx`)**
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

**3. 在客户端组件中追踪自定义事件**
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

**4. 配置 API 路由重写 (`next.config.mjs`)**
为了避免跨域问题并将所有请求作为同源请求安全地代理给 router server，需要在 Next.js 中配置路由重写。

**注意：** 路由重写在开发环境和生产环境 (`next start`) 中均有效。但如果你使用的是静态导出 (`output: 'export'`)，则不支持该功能，你需要直接在部署平台（如 Nginx、Vercel 等）上配置反向代理。

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

## 环境变量配置

### 服务器配置 (`server/`)

在启动代理服务器前，需要配置以下环境变量：

**关于 CORS 的重要说明：** 出于安全考虑，如果没有配置 Origin 白名单（`UMAMI_ALLOWED_ORIGINS`），默认情况下**所有跨域请求都将被拒绝**并返回 `403 Forbidden` 错误。你必须显式配置此白名单，将你期望接收打点数据的域名加入其中。

| 环境变量 | 说明 | 默认值 / 要求 |
| --- | --- | --- |
| `UMAMI_UPSTREAM_HOST` | 上游真实的 Umami 服务器地址（例如 `localhost:3000` 或是 Tailscale 内网 IP）。 | **必填** |
| `UMAMI_WEBSITE_IDS` | 允许接入的 Website IDs（多个用逗号分隔），用于白名单校验。 | 选填 |
| `UMAMI_WEBSITE_ID` | 兜底的默认 Website ID。 | 选填 |
| `UMAMI_TIMEOUT_MS` | 代理请求的超时时间（毫秒）。 | `5000` |
| `UMAMI_RATE_LIMIT_WINDOW_MS`| 限流窗口时间（毫秒）。 | `60000` |
| `UMAMI_RATE_LIMIT_MAX` | 每个限流窗口内允许的最大请求数。 | `100` |
| `UMAMI_ALLOWED_ORIGINS` | 允许跨域的 Origin 列表（多个用逗号分隔）。 | 选填（为空则拒绝所有跨域请求） |
| `UMAMI_SCRIPT_PATH` | 上游 Umami 脚本的具体路径。 | `/script.js` |
| `PORT` | 代理服务器的监听端口。 | `3000` |

### Vue 演示项目配置 (`demo/vue/`)

在 `demo/vue` 目录下创建 `.env` 文件并配置：

| 环境变量 | 说明 |
| --- | --- |
| `VITE_UMAMI_WEBSITE_ID` | 在 Umami 后台申请的 Website ID。 |
| `VITE_UMAMI_PROXY_PATH` | SDK 用于请求代理服务器的路径（默认：`/trpc`）。 |
| `VITE_UMAMI_SERVER_ORIGIN` | 在 `vite.config.ts` 中用于配置本地开发代理的服务器 Origin（如 `http://localhost:3000`）。 |

### Next.js 演示项目配置 (`demo/nextjs/`)

在 `demo/nextjs` 目录下创建 `.env.local` 文件并配置：

| 环境变量 | 说明 |
| --- | --- |
| `NEXT_PUBLIC_UMAMI_WEBSITE_ID`| 在 Umami 后台申请的 Website ID。 |
| `NEXT_PUBLIC_UMAMI_PROXY_PATH`| SDK 用于请求代理服务器的路径（默认：`/trpc`）。 |
| `UMAMI_SERVER_ORIGIN` | 在 `next.config.mjs` 中用于路由重写的服务器 Origin（如 `http://localhost:3000`）。 |

## 快速开始

本项目依赖 **Bun** (`bun@1.3.9+`)。

**1. 安装依赖**
```bash
# 在项目根目录下执行
bun install
```

**2. 启动代理服务器**
```bash
cd server
# 复制并配置你的环境变量
# cp .env.example .env 
bun run dev
```

**3. 运行演示项目**
```bash
# 启动 Next.js 演示
cd demo/nextjs
bun run dev

# 或者启动 Vue 演示
cd demo/vue
bun run dev
```

## 开源协议

本项目基于 [MIT 协议](./LICENSE) 开放源代码。
