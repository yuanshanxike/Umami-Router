// Core exports
export { UmamiTracker } from './core/UmamiTracker';
export { RetryQueue } from './core/RetryQueue';
export { createUmamiRouterClient } from './core/trpc';

// Types
export type {
  TrackerConfig,
  HealthStatus,
  TrackOptions,
  PageviewOptions,
  EventOptions,
  TrackerOptions,
  VueTrackerOptions,
  NextjsTrackerOptions,
} from './types';

// Vue exports
export { createUmamiPlugin } from './vue/plugin';
export { useTracker, usePageTrack, useEventTrack } from './vue/composable';
export { UmamiProvider } from './vue/provider';
export * from './vue/index';

// Next.js exports
export {
  useUmami,
  usePageviewTracking,
  useEventTracking,
  useUmamiPagesRouter,
  usePageviewTrackingPagesRouter,
  useEventTrackingPagesRouter,
} from './nextjs/index';
