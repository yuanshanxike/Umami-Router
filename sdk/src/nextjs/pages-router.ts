'use client';

import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import { UmamiTracker } from '../core/UmamiTracker';
import type { CaptureExceptionContext, NextjsTrackerOptions } from '../types';
import { useInjectRecorderScript } from './recorder';

type TrackerListener = (tracker: UmamiTracker | null) => void;

const trackerListeners = new Set<TrackerListener>();
let sharedTracker: UmamiTracker | null = null;

function setSharedTracker(tracker: UmamiTracker | null): void {
  sharedTracker = tracker;
  for (const listener of trackerListeners) {
    listener(sharedTracker);
  }
}

function subscribeTracker(listener: TrackerListener): () => void {
  trackerListeners.add(listener);
  listener(sharedTracker);

  return () => {
    trackerListeners.delete(listener);
  };
}

function useSharedTracker(): UmamiTracker | null {
  const [tracker, setTracker] = useState<UmamiTracker | null>(sharedTracker);

  useEffect(() => subscribeTracker(setTracker), []);

  return tracker;
}

export function useUmami(options: NextjsTrackerOptions) {
  const [tracker, setTracker] = useState<UmamiTracker | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [scriptPath, setScriptPath] = useState<string | null>(null);
  const [recorderPath, setRecorderPath] = useState<string | null>(null);

  const hasRecorder = Boolean(options.recorder);
  const autoTrack = options.autoTrack !== false;

  useEffect(() => {
    const umamiTracker = new UmamiTracker(options);
    if (hasRecorder && autoTrack) {
      umamiTracker.markInitialPageviewManagedByScript();
    }
    setSharedTracker(null);

    let cancelled = false;

    void umamiTracker.configure().then(
      (config) => {
        if (cancelled) {
          return;
        }

        setTracker(umamiTracker);
        setIsReady(true);
        setScriptPath(config.scriptPath);
        setRecorderPath(config.recorderPath);
        setSharedTracker(umamiTracker);
      },
      () => {
        if (!cancelled) {
          setIsReady(false);
        }
      }
    );

    return () => {
      cancelled = true;
    };
  }, [options.websiteId, options.proxyPath, options.autoTrack, hasRecorder, autoTrack]);

  useInjectRecorderScript(
    scriptPath,
    recorderPath,
    options.websiteId,
    {
      recorder: options.recorder,
      errors: options.errors,
      performance: options.performance,
      triggerInitialTrack: autoTrack,
      onScriptError: () => {
        if (
          autoTrack &&
          tracker &&
          typeof window !== 'undefined' &&
          typeof document !== 'undefined'
        ) {
          void tracker
            .pageview(window.location.href, document.referrer)
            .catch(() => {});
        }
      },
    },
    isReady
  );

  return {
    tracker,
    isReady,
    track: {
      pageview: async (url: string, referrer?: string) => {
        await tracker?.pageview(url, referrer);
      },
      event: async (name: string, data?: Record<string, unknown>) => {
        await tracker?.event(name, data);
      },
      identify: async (
        idOrData: string | Record<string, unknown>,
        data?: Record<string, unknown>
      ) => {
        await tracker?.identify(idOrData, data);
      },
      captureException: async (error: unknown, context?: CaptureExceptionContext) => {
        await tracker?.captureException(error, context);
      },
    },
    isAutoTrackEnabled: () => tracker?.isAutoTrackEnabled() ?? false,
    enableAutoTrack: () => tracker?.enableAutoTrack(),
    disableAutoTrack: () => tracker?.disableAutoTrack(),
  };
}

export function usePageviewTracking() {
  const router = useRouter();
  const tracker = useSharedTracker();
  const previousPathRef = useRef<string | null>(null);
  const currentPath = router.asPath;

  useEffect(() => {
    if (!tracker || !tracker.isAutoTrackEnabled() || !router.isReady) {
      return;
    }

    if (previousPathRef.current !== currentPath) {
      if (previousPathRef.current === null && tracker.consumeInitialPageviewSkip()) {
        previousPathRef.current = currentPath;
        return;
      }
      void tracker.pageview(currentPath, previousPathRef.current ?? undefined);
      previousPathRef.current = currentPath;
    }
  }, [tracker, router.isReady, currentPath]);

  return {
    trackPageview: async (path: string, referrer?: string) => {
      if (!tracker) {
        return;
      }

      await tracker.pageview(path, referrer);
    },
  };
}

export function useEventTracking() {
  const tracker = useSharedTracker();

  return {
    trackEvent: async (name: string, data?: Record<string, unknown>) => {
      if (!tracker) {
        return;
      }

      await tracker.event(name, data);
    },
  };
}
