[English](./README.md) | [简体中文](./README_zh.md) | [日本語](./README_ja.md)

# Umami Router

本プロジェクトは、[Umami](https://github.com/umami-software/umami)（`v3.5.0+` 対応）をベースに二次開発されたものです。

## 概要

**Umami Router** は、フロントエンドアプリケーションが Umami アナリティクスと安全かつ簡単に統合するためのプロキシサーバーおよびクライアント SDK です。

本プロジェクトの**主な目的**は、様々なウェブサイトからのトラッキングデータを、指定した単一のサーバーに一括ルーティング（転送）することです。

### 典型的な利用シーン

個人利用の場合、クラウドサーバー上に展開された Web ページのトラッキングを安全かつ簡単に行えます。クラウドサーバー上にこの `router server` を配置し、各フロントエンドからのトラッキングデータを受信し、同じ **Tailscale** イントラネット内にあるローカルサーバーの Umami データベースへデータを転送します。これにより、Umami データベースを公開インターネットに晒すことなく、ローカル環境で安全に分析できます。

## プロジェクト構造

本プロジェクトは **Bun** を使用したモノレポ構造を採用しています：

- **`server/`**: Node.js/Bun ベースのプロキシサーバー (`@umami_router/server`)。Umami スクリプト、レコーダー設定、イベント、エラートラッキング、パフォーマンス計測、Session Replay/Heatmap データをプロキシし、CORS チェック、Origin 検証、`x-umami-*` ヘッダー転送、ロギング、レート制限（`Retry-After`）、および `/api/heartbeat` による実疎通ヘルスチェックを行います。
- **`sdk/`**: フロントエンド用の TypeScript クライアント SDK (`@umami_router/sdk`)。フレームワーク非依存のコア (`@umami_router/sdk/core`)、静的 HTML 向け IIFE バンドル (`@umami_router/sdk/browser`)、および **Vue 3** (`@umami_router/sdk/vue`)・**Next.js 14+** (`@umami_router/sdk`) 向け統合を提供します。
- **`demo/`**: SDK を使用したデモアプリケーション（`demo/vue/` と `demo/nextjs/`）。

## AI Agent Skill 統合

本プロジェクトには **`@umami_router/sdk`** の統合時にコンテキストガイドを提供する **AI Agent skill**（`skills/umami-sdk/`）が含まれています。

### インストール方法

**1. クイックインストール（推奨）**
```bash
npx skills install yuanshanxike/Umami-Router
```

**2. 手動インストール**
`skills/umami-sdk/` を Agent ツールの skills ディレクトリ（例：`~/.claude/skills/` または `~/.gemini/skills/`）にコピーします。

## 利用方法 / 組み込み

### Umami v3.5.0+ に関する重要な注意点

- **Session Replay & Heatmaps 設定**: Umami `v3.5.0` 以降、`recorder.js` は `GET /umami/api/websites/:id/recorder` からサーバー側の設定を動的に取得します。クライアント側の `RecorderOptions` 属性（`sampleRate`、`maskLevel`、`maxDuration`、`blockSelector`）は Umami `v3.5+` では無視され、Umami `<= 3.4` 互換のためにのみ残されています。サンプリングやマスク設定は Umami 管理画面で行い、機密要素には `data-umami-replay-block` 属性を付与してください。
- **CSP ポリシー**: Session Replay は Blob Web Worker を使用するため、厳格な CSP を設定している場合は `worker-src 'self' blob:;` を許可する必要があります。

### Vue 3

**1. プラグインのセットアップ**
```typescript
import { createApp } from 'vue';
import { createUmamiPlugin } from '@umami_router/sdk/vue';
import App from './App.vue';
import router from './router';

const app = createApp(App);

app.use(createUmamiPlugin({
  websiteId: import.meta.env.VITE_UMAMI_WEBSITE_ID,
  proxyPath: '/trpc',
  autoTrack: true,
  useRouter: true,
  recorder: true,     // Replays / Heatmaps を有効化（v3.5+ ではサーバー側設定を使用）
  errors: true,       // 任意：Umami v3.5.0+ エラートラッキング
  performance: true,  // 任意：Core Web Vitals 計測
}));

app.use(router);
app.mount('#app');
```

**2. 開発用プロキシ (`vite.config.ts`) と本番 Nginx 設定**
本番環境で Nginx を使用する場合は、静的 `.js` キャッシュの正規表現に `/umami/script.js` や `/umami/recorder.js` が奪われないよう **`location ^~`** を使用してください：

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

### Vanilla TypeScript / 静的 HTML サイト

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
```

**2. 静的 HTML（`@umami_router/sdk/browser` -> `dist/browser.global.js`）**
```html
<script
  src="/umami-tracker.js"
  data-umami-router-website-id="your-website-id"
  data-umami-router-errors="true"
  defer
></script>
```
`window.__umamiTrack(name, data)` と `window.umamiRouter` が利用可能になります。

## サーバールート (`@umami_router/server`)

| メソッドとパス | 説明 |
| --- | --- |
| `GET /umami/script.js` | Umami トラッキングスクリプトのプロキシ |
| `GET /umami/recorder.js` | Session Replay / Heatmap 用スクリプトのプロキシ |
| `GET /umami/api/websites/:id/recorder` | Umami `v3.5.0+` サーバー側レコーダー設定のプロキシ |
| `POST /umami/api/send` | ページビュー、イベント、identify、エラー、パフォーマンス送信（最大 64 KB） |
| `POST /umami/api/record` | Session Replay および Heatmap データ送信（最大 1 MB） |
| `GET / POST /trpc/*` | tRPC API（`getConfig`、`/api/heartbeat` による実疎通確認付き `getHealth`） |

## 環境変数

### サーバー設定 (`server/`)

**CORS に関する重要な注意事項：** `UMAMI_ALLOWED_ORIGINS` が未設定の場合、デフォルトで**すべてのクロスドメイン要求および `/umami/api/send` / `/umami/api/record` 要求が拒否**され `403 Forbidden` が返されます。

| 変数名 | 説明 | デフォルト / 必須 |
| --- | --- | --- |
| `UMAMI_UPSTREAM_HOST` | 上流 Umami サーバーホスト（例: `localhost:3000` や Tailscale IP）。 | **必須** |
| `UMAMI_WEBSITE_IDS` | 許可するウェブサイトID（カンマ区切り）。 | 任意 |
| `UMAMI_WEBSITE_ID` | フォールバック用の単一ウェブサイトID。 | 任意 |
| `UMAMI_ALLOWED_ORIGINS` | 許可する Origin リスト（カンマ区切り）。 | 任意（空の場合は拒否） |
| `UMAMI_TIMEOUT_MS` | プロキシリクエストのタイムアウト（ミリ秒）。 | `5000` |
| `UMAMI_HEALTH_CACHE_TTL_MS` | `getHealth()` の `/api/heartbeat` キャッシュ TTL（ミリ秒、`0` で無効）。 | `15000` |
| `UMAMI_RATE_LIMIT_WINDOW_MS` | レート制限のウィンドウ時間（ミリ秒）。 | `60000` |
| `UMAMI_RATE_LIMIT_MAX` | 1ウィンドウあたりの最大リクエスト数。 | `100` |
| `UMAMI_SCRIPT_PATH` | 上流 Umami トラッキングスクリプトパス。 | `/script.js` |
| `UMAMI_RECORDER_PATH` | 上流 Umami 録画スクリプトパス。 | `/recorder.js` |
| `PORT` | サーバーの待受ポート番号。 | `3000` |

### Vue デモ設定 (`demo/vue/`)

| 変数名 | 説明 |
| --- | --- |
| `VITE_UMAMI_WEBSITE_ID` | Umami ダッシュボードで登録された Website ID。 |
| `VITE_UMAMI_PROXY_PATH` | プロキシサーバーパス（デフォルト: `/trpc`）。 |
| `VITE_UMAMI_SERVER_ORIGIN` | ローカル開発プロキシ (`vite.config.ts`) 用サーバーオリジン。 |

### Next.js デモ設定 (`demo/nextjs/`)

| 変数名 | 説明 |
| --- | --- |
| `NEXT_PUBLIC_UMAMI_WEBSITE_ID` | Umami ダッシュボードで登録された Website ID。 |
| `NEXT_PUBLIC_UMAMI_PROXY_PATH` | プロキシサーバーパス（デフォルト: `/trpc`）。 |
| `UMAMI_SERVER_ORIGIN` | ルーティング (`next.config.mjs`) 用サーバーオリジン。 |

## 使い方

本プロジェクトは **Bun** (`bun@1.3.9+`) を使用します。

**1. 依存関係のインストールとテスト**
```bash
cd server && bun install && bun run typecheck && bun test
cd ../sdk && bun install && bun run typecheck && bun test && bun run build
```

**2. サーバーの起動**
```bash
cd server
cp .env.example .env
bun run dev
```

**3. デモの起動**
```bash
# Next.js デモの場合
cd demo/nextjs && bun run dev

# Vue デモの場合
cd demo/vue && bun run dev
```

## ライセンス

本プロジェクトは [MIT ライセンス](./LICENSE) のもとで公開されています。
