import { createTRPCUntypedClient, httpLink } from '@trpc/client';
import type { HealthStatus, TrackerConfig } from '../types';

export interface UmamiRouterClient {
  getConfig: () => Promise<TrackerConfig>;
  getHealth: () => Promise<HealthStatus>;
}

const DEFAULT_TRPC_PATH = '/trpc';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function parseTrackerConfig(value: unknown): TrackerConfig {
  if (!isRecord(value)) {
    throw new Error('Invalid tRPC getConfig response');
  }

  const { websiteId, apiPath, scriptPath, proxyPath } = value;

  if (
    typeof websiteId !== 'string' ||
    typeof apiPath !== 'string' ||
    typeof scriptPath !== 'string' ||
    typeof proxyPath !== 'string'
  ) {
    throw new Error('Invalid tRPC getConfig response');
  }

  return {
    websiteId,
    apiPath,
    scriptPath,
    proxyPath,
  };
}

function parseHealthStatus(value: unknown): HealthStatus {
  if (!isRecord(value)) {
    throw new Error('Invalid tRPC getHealth response');
  }

  const {
    upstreamReachable,
    upstreamLatencyMs,
    rateLimitRemaining,
    managedWebsites,
  } = value;

  const latencyIsValid =
    upstreamLatencyMs === null || typeof upstreamLatencyMs === 'number';

  if (
    typeof upstreamReachable !== 'boolean' ||
    !latencyIsValid ||
    typeof rateLimitRemaining !== 'number' ||
    !isStringArray(managedWebsites)
  ) {
    throw new Error('Invalid tRPC getHealth response');
  }

  return {
    upstreamReachable,
    upstreamLatencyMs,
    rateLimitRemaining,
    managedWebsites,
  };
}

function resolveTrpcUrl(proxyPath: string): string {
  const trimmed = proxyPath.trim();
  const basePath = trimmed.length > 0 ? trimmed : DEFAULT_TRPC_PATH;

  if (/^https?:\/\//i.test(basePath)) {
    const url = new URL(basePath);
    const normalizedPath = url.pathname.replace(/\/+$/, '');
    url.pathname = normalizedPath.endsWith('/trpc')
      ? normalizedPath
      : `${normalizedPath}/trpc`;
    return url.toString();
  }

  const normalizedPath = basePath.replace(/\/+$/, '');
  return normalizedPath.endsWith('/trpc')
    ? normalizedPath
    : `${normalizedPath}/trpc`;
}

export function createUmamiRouterClient(proxyPath: string): UmamiRouterClient {
  const client = createTRPCUntypedClient({
    links: [httpLink({ url: resolveTrpcUrl(proxyPath) })],
  });

  return {
    async getConfig() {
      return parseTrackerConfig(await client.query('getConfig'));
    },
    async getHealth() {
      return parseHealthStatus(await client.query('getHealth'));
    },
  };
}
