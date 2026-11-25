import { watch, onScopeDispose, getCurrentScope, type Ref } from 'vue';
import { mountUmamiScripts } from '../core/recorder';
import type { ScriptFeatureOptions } from '../types';

export interface VueScriptOptions extends ScriptFeatureOptions {
  triggerInitialTrack?: boolean;
  onScriptError?: () => void;
}

/**
 * 内部函数：根据 recorder / errors / performance 配置动态注入/移除 script.js + recorder.js 到 <head>
 * 此函数由 plugin 内部调用，不对外导出
 */
export function injectRecorderScript(
  scriptUrl: Ref<string | null>,
  recorderUrl: Ref<string | null>,
  websiteId: string,
  options: VueScriptOptions,
  isReady: Ref<boolean>
): void {
  let cleanupScripts: (() => void) | null = null;

  const removeScripts = () => {
    cleanupScripts?.();
    cleanupScripts = null;
  };

  watch(
    [isReady, scriptUrl, recorderUrl],
    ([ready, sUrl, rUrl]) => {
      if (ready && sUrl) {
        if (cleanupScripts) {
          return;
        }

        cleanupScripts = mountUmamiScripts({
          scriptUrl: sUrl,
          recorderUrl: rUrl,
          websiteId,
          recorder: options.recorder,
          errors: options.errors,
          performance: options.performance,
          triggerInitialTrack: options.triggerInitialTrack,
          onScriptError: options.onScriptError,
        });
      } else {
        removeScripts();
      }
    },
    { immediate: true }
  );

  if (getCurrentScope()) {
    onScopeDispose(() => {
      removeScripts();
    });
  }
}
