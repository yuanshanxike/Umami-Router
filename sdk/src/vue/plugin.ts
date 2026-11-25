import { ref, type App, type InjectionKey, type Ref } from 'vue';
import { UmamiTracker } from '../core/UmamiTracker';
import type { VueTrackerOptions } from '../types';
import { injectRecorderScript } from './recorder';

export interface UmamiRuntime {
  tracker: UmamiTracker;
  isReady: Ref<boolean>;
  readyPromise: Promise<boolean>;
  options: VueTrackerOptions;
  scriptPath: Ref<string | null>;
  recorderPath: Ref<string | null>;
}

export const UMAMI_RUNTIME_KEY: InjectionKey<UmamiRuntime> = Symbol('umami_runtime');

export function createUmamiRuntime(options: VueTrackerOptions): UmamiRuntime {
  const tracker = new UmamiTracker(options);
  const isReady = ref(false);
  const scriptPath = ref<string | null>(null);
  const recorderPath = ref<string | null>(null);

  const hasScriptFeatures = Boolean(
    options.recorder || options.errors || options.performance
  );
  const autoTrack = options.autoTrack !== false;

  if (options.recorder && autoTrack) {
    tracker.markInitialPageviewManagedByScript();
  }

  const readyPromise = tracker.configure().then(
    (config) => {
      isReady.value = true;
      scriptPath.value = config.scriptPath;
      recorderPath.value = config.recorderPath;
      return true;
    },
    () => {
      isReady.value = false;
      return false;
    }
  );

  if (hasScriptFeatures) {
    injectRecorderScript(
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
  }

  return {
    tracker,
    isReady,
    readyPromise,
    options,
    scriptPath,
    recorderPath,
  };
}

export function createUmamiPlugin(options: VueTrackerOptions) {
  const runtime = createUmamiRuntime(options);

  return {
    install(app: App) {
      app.provide(UMAMI_RUNTIME_KEY, runtime);

      if (options.useRouter && options.autoTrack !== false) {
        const router = options.router || app.config.globalProperties.$router;

        if (router) {
          router.afterEach((to: { fullPath: string }) => {
            const referrer = typeof window !== 'undefined' ? window.location.href : '';

            void runtime.readyPromise.then((isReady) => {
              if (!isReady || !runtime.tracker.isAutoTrackEnabled()) {
                return;
              }
              if (runtime.tracker.consumeInitialPageviewSkip()) {
                return;
              }
              void runtime.tracker.pageview(to.fullPath, referrer);
            });
          });
        }
      }
    },
  };
}
