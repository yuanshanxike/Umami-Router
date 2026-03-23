'use client';

import {
  createElement,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { UmamiTracker } from '../core/UmamiTracker';
import type { NextjsTrackerOptions } from '../types';

interface UmamiContextValue {
  tracker: UmamiTracker | null;
  isReady: boolean;
}

export const UmamiContext = createContext<UmamiContextValue | null>(null);

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

  useEffect(() => {
    const umamiTracker = new UmamiTracker(options);
    setSharedTracker(null);

    let cancelled = false;

    void umamiTracker.configure().then(
      () => {
        if (cancelled) {
          return;
        }

        setTracker(umamiTracker);
        setIsReady(true);
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
  }, [options.websiteId, options.proxyPath, options.autoTrack]);

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
    },
    isAutoTrackEnabled: () => tracker?.isAutoTrackEnabled() ?? false,
    enableAutoTrack: () => tracker?.enableAutoTrack(),
    disableAutoTrack: () => tracker?.disableAutoTrack(),
  };
}

interface UmamiProviderProps {
  children: ReactNode;
  options: NextjsTrackerOptions;
}

export function UmamiProvider({ children, options }: UmamiProviderProps) {
  const { tracker, isReady } = useUmami(options);

  const value = useMemo<UmamiContextValue>(
    () => ({
      tracker,
      isReady,
    }),
    [tracker, isReady]
  );

  return createElement(UmamiContext.Provider, { value }, children);
}

export function usePageviewTracking(getPath: () => string) {
  const context = useContext(UmamiContext);
  const shared = useSharedTracker();
  const tracker = context?.tracker ?? shared;
  const currentPath = getPath();
  const previousPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!tracker || !tracker.isAutoTrackEnabled()) {
      return;
    }

    if (previousPathRef.current !== currentPath) {
      void tracker.pageview(currentPath, previousPathRef.current ?? undefined);
      previousPathRef.current = currentPath;
    }
  }, [tracker, currentPath]);

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
  const context = useContext(UmamiContext);
  const shared = useSharedTracker();
  const tracker = context?.tracker ?? shared;

  return {
    trackEvent: async (name: string, data?: Record<string, unknown>) => {
      if (!tracker) {
        return;
      }

      await tracker.event(name, data);
    },
  };
}
