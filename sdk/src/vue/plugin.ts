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

  if (options.recorder) {
    injectRecorderScript(scriptPath, recorderPath, options.websiteId, options.recorder, isReady);
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

      if (options.useRouter && options.autoTrack) {
        const router = options.router || app.config.globalProperties.$router;

        if (router) {
          router.afterEach((to: { fullPath: string }) => {
            const referrer = typeof window !== 'undefined' ? window.location.href : '';

            void runtime.readyPromise.then((isReady) => {
              if (isReady) {
                void runtime.tracker.pageview(to.fullPath, referrer);
              }
            });
          });
        }
      }
    },
  };
}
