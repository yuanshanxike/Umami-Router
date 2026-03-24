[English](./README.md) | [简体中文](./README_zh.md) | [日本語](./README_ja.md)

# Umami Router

本プロジェクトは、[Umami](https://github.com/umami-software/umami) をベースに二次開発されたものです。

## 概要

**Umami Router** は、フロントエンドアプリケーションが Umami アナリティクスと統合するためのプロキシサーバーおよびクライアント SDK です。

本プロジェクトの**主な目的**は、様々なウェブサイトからのトラッキングデータを、指定した単一のサーバーに簡単にルーティング（転送）することです。

### 典型的な利用シーン

個人利用の場合、クラウドサーバー上に展開されたWebページのトラッキングを極めて安全かつ簡単に行うことができます。クラウドサーバー上にこの `router server` を展開し、各フロントエンドからのトラッキングデータを受信させます。そして、同じ **Tailscale** イントラネット内にあるローカルサーバーの Umami データベースへデータを一括転送します。これにより、Umami データベースを直接公開インターネットに晒すことなく、ローカル環境で安全かつ簡単にWebページのデータ動向を確認できます。

## プロジェクト構造

本プロジェクトは **Bun** を使用したモノレポ構造を採用しています：

- **`server/`**: Node.js/Bun ベースのプロキシサーバー (`@umami_router/server`) です。Umami スクリプトとトラッキング要求のプロキシとして機能し、CORS チェック、Origin 検証、要求のロギング、およびレート制限（Rate-Limiting）を処理します。
- **`sdk/`**: フロントエンド用の TypeScript クライアント SDK (`@umami_router/sdk`) です。コアトラッキング機能に加え、**Vue 3** および **Next.js 14+** 向けの専用インテグレーションを提供します。
- **`demo/`**: SDK を使用したデモアプリケーション。
  - `demo/vue/`: Vue 3 + Vite アプリケーションのデモ。
  - `demo/nextjs/`: Next.js 14 (App Router) アプリケーションのデモ。

## AI Agent Skill 統合

本プロジェクトには **`@umami_router/sdk`** の統合時にコンテキストガイドを提供する **AI Agent skill**（`skills/umami-sdk/`）が含まれています。Claude Code や Gemini CLI のような Agent CLI ツールと互換性があります。

### Skill の機能

以下の場面で skill が自動的に有効になります：
- SDK と Vue 3 または Next.js の統合
- ページビューとイベントのトラッキング実装
- Tracker オプションの設定
- `createUmamiPlugin`、`useTracker`、`usePageTrack`、`useEventTrack` の使用（Vue）
- `useUmami`、`usePageviewTracking`、`useEventTracking` （および Next.js Pages Router 向けのバリアント）の使用
- 型定義（`TrackerConfig`、`HealthStatus`、`TrackOptions`）
- Umami プロキシサーバーのセットアップ
- Tracker の初期化やトラッキング失敗のトラブルシューティング

### インストール方法

**1. クイックインストール（推奨）**

以下のコマンドで簡単にインストールできます：

```bash
npx skills install yuanshanxike/Umami-Router
```

**2. 手動インストール**

skill フォルダを Agent ツールの skills ディレクトリ（例：`~/.claude/skills/` または `~/.gemini/skills/`）にコピーします：

```bash
# skill の場所：
skills/umami-sdk/
```

### 使用例

この skill により、AI Agent は以下のようなタスクをサポートできます：

- Vue コンポーネントでカスタムイベントをトラッキング
- Next.js App Router の自動トラッキングを設定
- カスタムプロキシパスで tracker をセットアップ
- ルート変更時のページビュートラッキングを実装
- Tracker の初期化をデバッグ

## 利用方法 / 組み込み

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
  proxyPath: '/trpc', // プロキシサーバーのパス
  autoTrack: true,
  useRouter: true,    // ルート変更時に自動でページビューをトラッキング
}));

app.use(router);
app.mount('#app');
```

**2. コンポーネントでのカスタムイベントのトラッキング**
```vue
<script setup lang="ts">
import { useEventTrack } from '@umami_router/sdk/vue';

const { trackEvent } = useEventTrack();

const handleClick = () => {
  trackEvent('button_click', { buttonName: 'submit' });
};
</script>
```

**3. 開発用プロキシの設定 (`vite.config.ts`)**
ローカル開発時のCORSの問題を回避し、同一生成元（same-origin）の要求として処理するために、Viteのプロキシを設定します。

**注意：** このプロキシ設定はローカル開発 (`vite dev`) 時のみ有効です。本番環境では、Webサーバー（Nginxの `location` ブロックや、Vercel、Cloudflareなどのルーティング機能）で `/trpc` と `/umami` をプロキシサーバーへ明示的にリバースプロキシ設定する必要があります。

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

**1. Providerコンポーネントの作成 (`components/TrackerProvider.tsx`)**
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

  // ルート変更時に自動でページビューをトラッキング
  usePageviewTracking(() => pathname);
  // 子コンポーネントにイベントトラッキングを公開
  useEventTracking();

  return <>{children}</>;
}
```

**2. アプリケーションのラップ (`app/layout.tsx`)**
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

**3. クライアントコンポーネントでのカスタムイベントのトラッキング**
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

**4. APIリライトの設定 (`next.config.mjs`)**
CORSの問題を回避し、すべてのトラッキング要求を同一生成元（same-origin）として安全にプロキシサーバーへルーティングするために、Next.jsのリライトを設定します。

**注意：** この設定は開発環境と本番環境 (`next start`) の両方で機能します。ただし、静的HTMLエクスポート (`output: 'export'`) を使用している場合はこのリライト機能はサポートされないため、デプロイ先のプラットフォーム（Nginx、Vercelなど）で直接リバースプロキシを設定する必要があります。

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

## 環境変数

### サーバー設定 (`server/`)

プロキシサーバーを安全に稼働させるため、以下の環境変数を設定します：

**CORSに関する重要な注意事項：** セキュリティ上の理由から、Originホワイトリスト (`UMAMI_ALLOWED_ORIGINS`) が設定されていない場合、デフォルトで**すべてのクロスドメイン要求は拒否され**、`403 Forbidden` エラーが返されます。トラッキングデータを受信する予定のドメインを、明示的にこのホワイトリストに設定する必要があります。

| 変数名 | 説明 | デフォルト / 必須 |
| --- | --- | --- |
| `UMAMI_UPSTREAM_HOST` | 上流の Umami サーバーホスト（例: `localhost:3000` や Tailscale IP）。 | **必須** |
| `UMAMI_WEBSITE_IDS` | トラッキングを許可するウェブサイトID（カンマ区切り）。 | 任意 |
| `UMAMI_WEBSITE_ID` | フォールバック用の単一ウェブサイトID。 | 任意 |
| `UMAMI_TIMEOUT_MS` | プロキシリクエストのタイムアウト（ミリ秒）。 | `5000` |
| `UMAMI_RATE_LIMIT_WINDOW_MS`| レート制限のウィンドウ時間（ミリ秒）。 | `60000` |
| `UMAMI_RATE_LIMIT_MAX` | 1ウィンドウあたりの最大リクエスト数。 | `100` |
| `UMAMI_ALLOWED_ORIGINS` | 許可する Origin (CORS) リスト（カンマ区切り）。 | 任意（空の場合はすべてのクロスドメイン要求を拒否） |
| `UMAMI_SCRIPT_PATH` | 上流の Umami トラッキングスクリプトへのカスタムパス。 | `/script.js` |
| `PORT` | サーバーの待受ポート番号。 | `3000` |

### Vue デモ設定 (`demo/vue/`)

`demo/vue` ディレクトリ内の `.env` ファイルに設定します。

| 変数名 | 説明 |
| --- | --- |
| `VITE_UMAMI_WEBSITE_ID` | Umami ダッシュボードで登録された Website ID。 |
| `VITE_UMAMI_PROXY_PATH` | プロキシサーバーに到達するためのパス（デフォルト: `/trpc`）。 |
| `VITE_UMAMI_SERVER_ORIGIN` | ローカル開発用プロキシ(`vite.config.ts`) に使用するサーバーオリジン（例: `http://localhost:3000`）。 |

### Next.js デモ設定 (`demo/nextjs/`)

`demo/nextjs` ディレクトリ内の `.env.local` ファイルに設定します。

| 変数名 | 説明 |
| --- | --- |
| `NEXT_PUBLIC_UMAMI_WEBSITE_ID`| Umami ダッシュボードで登録された Website ID。 |
| `NEXT_PUBLIC_UMAMI_PROXY_PATH`| プロキシサーバーに到達するためのパス（デフォルト: `/trpc`）。 |
| `UMAMI_SERVER_ORIGIN` | ルーティング (`next.config.mjs`) に使用するサーバーオリジン（例: `http://localhost:3000`）。 |

## 使い方

本プロジェクトは主なパッケージマネージャーおよびタスクランナーとして **Bun** (`bun@1.3.9+`) を使用します。

**1. 依存関係のインストール**
```bash
# ルートディレクトリで実行
bun install
```

**2. サーバーの起動**
```bash
cd server
# 環境変数を設定してください
# cp .env.example .env 
bun run dev
```

**3. デモの起動**
```bash
# Next.js デモの場合
cd demo/nextjs
bun run dev

# Vue デモの場合
cd demo/vue
bun run dev
```

## ライセンス

本プロジェクトは [MIT ライセンス](./LICENSE) のもとで公開されています。
