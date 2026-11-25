import type {
  BrowserTrackerHandle,
  BrowserTrackerOptions,
  CaptureExceptionContext,
  ScriptFeatureOptions,
} from '../types';
import { getWindowUmami, UmamiTracker } from './UmamiTracker';

export interface MountUmamiScriptsOptions extends ScriptFeatureOptions {
  scriptUrl: string;
  recorderUrl?: string | null;
  websiteId: string;
  /** Trigger `window.umami.track()` once script.js loads to populate session cache (default: true). */
  triggerInitialTrack?: boolean;
  onScriptLoaded?: () => void;
  onScriptError?: () => void;
}

const SESSION_WAIT_TIMEOUT_MS = 1500;

export function mountUmamiScripts(options: MountUmamiScriptsOptions): () => void {
  const hasRecorder = Boolean(options.recorder);
  const hasErrors = Boolean(options.errors);
  const hasPerformance = Boolean(options.performance);

  if (
    (!hasRecorder && !hasErrors && !hasPerformance) ||
    typeof document === 'undefined' ||
    !document.head
  ) {
    return () => {};
  }

  let disposed = false;
  let recorderTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let trackerScript: HTMLScriptElement | null = document.createElement('script');
  let recorderScript: HTMLScriptElement | null = null;

  const clearTimer = () => {
    if (recorderTimeoutId !== null) {
      clearTimeout(recorderTimeoutId);
      recorderTimeoutId = null;
    }
  };

  const cleanup = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    clearTimer();
    if (recorderScript?.parentNode) {
      recorderScript.parentNode.removeChild(recorderScript);
    }
    recorderScript = null;
    if (trackerScript?.parentNode) {
      trackerScript.parentNode.removeChild(trackerScript);
    }
    trackerScript = null;
  };

  trackerScript.defer = true;
  trackerScript.src = options.scriptUrl;
  trackerScript.setAttribute('data-website-id', options.websiteId);
  trackerScript.setAttribute('data-auto-track', 'false');

  if (hasErrors) {
    trackerScript.setAttribute('data-errors', 'true');
    if (typeof options.errors === 'object') {
      if (options.errors.release) {
        trackerScript.setAttribute('data-release', options.errors.release);
      }
      if (options.errors.environment) {
        trackerScript.setAttribute('data-environment', options.errors.environment);
      }
    }
  }

  if (hasPerformance) {
    trackerScript.setAttribute('data-performance', 'true');
  }

  const appendRecorderScript = () => {
    if (disposed || recorderScript || !hasRecorder || !options.recorderUrl) {
      return;
    }
    const script = document.createElement('script');
    script.defer = true;
    script.src = options.recorderUrl;
    script.setAttribute('data-website-id', options.websiteId);

    if (typeof options.recorder === 'object') {
      const { sampleRate, maskLevel, maxDuration, blockSelector } = options.recorder;
      if (sampleRate !== undefined) {
        script.setAttribute('data-sample-rate', String(sampleRate));
      }
      if (maskLevel !== undefined) {
        script.setAttribute('data-mask-level', maskLevel);
      }
      if (maxDuration !== undefined) {
        script.setAttribute('data-max-duration', String(maxDuration));
      }
      if (blockSelector !== undefined) {
        script.setAttribute('data-block-selector', blockSelector);
      }
    }

    recorderScript = script;
    document.head.appendChild(script);
  };

  trackerScript.addEventListener('load', () => {
    if (disposed) {
      return;
    }

    options.onScriptLoaded?.();

    if (!hasRecorder || !options.recorderUrl) {
      return;
    }

    const shouldTriggerTrack = options.triggerInitialTrack !== false;
    let trackPromise: Promise<unknown> | null = null;
    if (shouldTriggerTrack) {
      try {
        const result = getWindowUmami()?.track?.();
        trackPromise = Promise.resolve(result).catch(() => undefined);
      } catch {
        trackPromise = null;
      }
    }

    const waitPromise = trackPromise
      ? Promise.race([
          trackPromise,
          new Promise<void>((resolve) => {
            recorderTimeoutId = setTimeout(() => {
              recorderTimeoutId = null;
              resolve();
            }, SESSION_WAIT_TIMEOUT_MS);
          }),
        ])
      : Promise.resolve();

    void waitPromise.then(() => {
      clearTimer();
      appendRecorderScript();
    });
  });

  trackerScript.addEventListener('error', () => {
    if (!disposed) {
      options.onScriptError?.();
    }
  });

  document.head.appendChild(trackerScript);

  return cleanup;
}

export function initBrowserTracker(options: BrowserTrackerOptions): BrowserTrackerHandle {
  const tracker = new UmamiTracker(options);
  let destroyed = false;
  let unmountScripts: (() => void) | null = null;

  const hasScriptFeatures = Boolean(
    options.recorder || options.errors || options.performance
  );
  const autoTrack = options.autoTrack !== false;

  const sendFallbackPageview = () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }
    void tracker.pageview(window.location.href, document.referrer).catch(() => {});
  };

  const ready = tracker.configure().then(
    (config) => {
      if (destroyed) {
        return false;
      }

      if (hasScriptFeatures) {
        unmountScripts = mountUmamiScripts({
          scriptUrl: config.scriptPath,
          recorderUrl: config.recorderPath,
          websiteId: config.websiteId,
          recorder: options.recorder,
          errors: options.errors,
          performance: options.performance,
          triggerInitialTrack: autoTrack,
          onScriptLoaded: () => {
            options.onScriptLoaded?.();
            if (!options.recorder && autoTrack) {
              sendFallbackPageview();
            }
          },
          onScriptError: () => {
            options.onScriptError?.();
            if (autoTrack) {
              sendFallbackPageview();
            }
          },
        });
      } else if (autoTrack) {
        sendFallbackPageview();
      }

      return true;
    },
    () => false
  );

  const trackEvent = async (
    name: string,
    data?: Record<string, unknown>
  ): Promise<void> => {
    const isReady = await ready;
    if (!isReady || destroyed) {
      return;
    }
    await tracker.event(name, data);
  };

  const trackPageview = async (url: string, referrer?: string): Promise<void> => {
    const isReady = await ready;
    if (!isReady || destroyed) {
      return;
    }
    await tracker.pageview(url, referrer);
  };

  const identify = async (
    idOrData: string | Record<string, unknown>,
    data?: Record<string, unknown>
  ): Promise<void> => {
    const isReady = await ready;
    if (!isReady || destroyed) {
      return;
    }
    await tracker.identify(idOrData, data);
  };

  const captureException = async (
    error: unknown,
    context?: CaptureExceptionContext
  ): Promise<void> => {
    const isReady = await ready;
    if (!isReady || destroyed) {
      return;
    }
    await tracker.captureException(error, context);
  };

  const destroy = () => {
    destroyed = true;
    unmountScripts?.();
    unmountScripts = null;
  };

  return {
    tracker,
    ready,
    trackEvent,
    trackPageview,
    identify,
    captureException,
    destroy,
  };
}
