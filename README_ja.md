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
| `UMAMI_ALLOWED_ORIGINS` | 許可する Origin (CORS) リスト（カンマ区切り）。 | 任意（空の場合はすべて許可） |
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
