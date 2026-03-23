export interface UmamiEnv {
  UMAMI_UPSTREAM_HOST: string;
  UMAMI_WEBSITE_IDS?: string;
  UMAMI_WEBSITE_ID?: string;
  UMAMI_TIMEOUT_MS?: string;
  UMAMI_RATE_LIMIT_WINDOW_MS?: string;
  UMAMI_RATE_LIMIT_MAX?: string;
  UMAMI_ALLOWED_ORIGINS?: string;
  UMAMI_SCRIPT_PATH?: string;
}

declare global {
  namespace NodeJS {
    interface ProcessEnv extends UmamiEnv {}
  }
}
