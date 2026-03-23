import { inject, watch } from 'vue';
import type { Ref } from 'vue';
import { UMAMI_RUNTIME_KEY, type UmamiRuntime } from './plugin';
import type { EventOptions, PageviewOptions } from '../types';

export function useTracker() {
  const runtime = inject<UmamiRuntime>(UMAMI_RUNTIME_KEY);

  if (!runtime) {
    throw new Error('useTracker must be used within UmamiProvider');
  }

  const autoTrackPageviews = (route: Ref<string> | (() => string)) => {
    let previousUrl = '';

    const getUrl = () => {
      return typeof route === 'function' ? route() : route.value;
    };

    watch(
      () => getUrl(),
      async (newUrl) => {
        const isReady = await runtime.readyPromise;

        if (isReady && previousUrl !== newUrl && runtime.tracker.isAutoTrackEnabled()) {
          await runtime.tracker.pageview(newUrl, previousUrl || undefined);
        }
        previousUrl = newUrl;
      },
      { immediate: true }
    );
  };

  const track = {
    pageview: async (options: PageviewOptions) => {
      const isReady = await runtime.readyPromise;

      if (!isReady) {
        return;
      }

      await runtime.tracker.pageview(options.url, options.referrer);
    },
    event: async (options: EventOptions) => {
      const isReady = await runtime.readyPromise;

      if (!isReady) {
        return;
      }

      await runtime.tracker.event(options.name, options.data);
    },
    track: runtime.tracker.track.bind(runtime.tracker),
  };

  return {
    tracker: runtime.tracker,
    track,
    autoTrackPageviews,
    readyPromise: runtime.readyPromise,
    isAutoTrackEnabled: () => runtime.tracker.isAutoTrackEnabled(),
    enableAutoTrack: () => runtime.tracker.enableAutoTrack(),
    disableAutoTrack: () => runtime.tracker.disableAutoTrack(),
  };
}

export function usePageTrack(getPath: () => string) {
  const { tracker, isAutoTrackEnabled, readyPromise } = useTracker();
  let previousPath = '';

  watch(
    () => getPath(),
    async (newPath) => {
      const isReady = await readyPromise;

      if (!isReady) {
        previousPath = newPath;
        return;
      }

      if (isAutoTrackEnabled() && newPath !== previousPath) {
        await tracker.pageview(newPath, previousPath || undefined);
        previousPath = newPath;
      }
    },
    { immediate: true }
  );

  return {
    trackPageview: async (path: string, referrer?: string) => {
      const isReady = await readyPromise;

      if (!isReady) {
        return;
      }

      await tracker.pageview(path, referrer);
    },
  };
}

export function useEventTrack() {
  const { tracker, readyPromise } = useTracker();

  return {
    trackEvent: async (name: string, data?: Record<string, unknown>) => {
      const isReady = await readyPromise;

      if (!isReady) {
        return;
      }

      await tracker.event(name, data);
    },
  };
}
