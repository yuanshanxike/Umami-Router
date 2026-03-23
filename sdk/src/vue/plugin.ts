import { ref, type App, type InjectionKey, type Ref } from 'vue';
import { UmamiTracker } from '../core/UmamiTracker';
import type { VueTrackerOptions } from '../types';

export interface UmamiRuntime {
  tracker: UmamiTracker;
  isReady: Ref<boolean>;
  readyPromise: Promise<boolean>;
  options: VueTrackerOptions;
}

export const UMAMI_RUNTIME_KEY: InjectionKey<UmamiRuntime> = Symbol('umami_runtime');

export function createUmamiRuntime(options: VueTrackerOptions): UmamiRuntime {
  const tracker = new UmamiTracker(options);
  const isReady = ref(false);
  const readyPromise = tracker.configure().then(
    () => {
      isReady.value = true;
      return true;
    },
    () => {
      isReady.value = false;
      return false;
    }
  );

  return {
    tracker,
    isReady,
    readyPromise,
    options,
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
