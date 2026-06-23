import { watch, onScopeDispose, getCurrentScope, type Ref } from 'vue';
import type { RecorderOptions } from '../types';

/**
 * 内部函数：根据 recorder 配置动态注入/移除 script.js + recorder.js 到 <head>
 * recorder.js 依赖 script.js 创建的 window.umami 全局对象（特别是 getSession().cache）
 *
 * 注入流程：
 * 1. 注入 script.js（data-auto-track="false"），等待加载完成
 * 2. 调用 window.umami.track() 触发 session 初始化（获取 cache）
 * 3. 注入 recorder.js
 *
 * 此函数由 plugin 内部调用，不对外导出
 */
export function injectRecorderScript(
  scriptUrl: Ref<string | null>,
  recorderUrl: Ref<string | null>,
  websiteId: string,
  recorderOptions: RecorderOptions | boolean,
  isReady: Ref<boolean>
): void {
  let trackerScriptElement: HTMLScriptElement | null = null;
  let recorderScriptElement: HTMLScriptElement | null = null;
  let recorderTimeoutId: ReturnType<typeof setTimeout> | null = null;

  const clearRecorderTimeout = () => {
    if (recorderTimeoutId) {
      clearTimeout(recorderTimeoutId);
      recorderTimeoutId = null;
    }
  };

  const removeScripts = () => {
    clearRecorderTimeout();
    if (recorderScriptElement?.parentNode) {
      recorderScriptElement.parentNode.removeChild(recorderScriptElement);
      recorderScriptElement = null;
    }
    if (trackerScriptElement?.parentNode) {
      trackerScriptElement.parentNode.removeChild(trackerScriptElement);
      trackerScriptElement = null;
    }
  };

  watch(
    [isReady, scriptUrl, recorderUrl],
    ([ready, sUrl, rUrl]) => {
      if (ready && sUrl && rUrl) {
        // 防止重复注入
        if (trackerScriptElement || recorderScriptElement) {
          return;
        }

        const options = typeof recorderOptions === 'object' ? recorderOptions : {};

        // 1. 先注入 script.js（tracker 脚本）以创建 window.umami 全局对象
        trackerScriptElement = document.createElement('script');
        trackerScriptElement.defer = true;
        trackerScriptElement.src = sUrl;
        trackerScriptElement.setAttribute('data-website-id', websiteId);
        // 禁用 script.js 的自动追踪，因为我们的 SDK 已经通过 tRPC 处理了追踪
        trackerScriptElement.setAttribute('data-auto-track', 'false');

        // script.js 加载完成后，触发 session 初始化，然后注入 recorder.js
        trackerScriptElement.addEventListener('load', () => {
          // 调用 track() 触发 session 初始化（建立 cache）
          // recorder.js 需要 getSession().cache 才会开始录制
          const umami = (window as unknown as Record<string, unknown>).umami as
            | { track?: () => void }
            | undefined;
          umami?.track?.();

          // 短暂等待 session 建立后再注入 recorder.js
          recorderTimeoutId = setTimeout(() => {
            recorderTimeoutId = null;
            if (!trackerScriptElement || recorderScriptElement) {
              return; // 已被清理
            }
            recorderScriptElement = document.createElement('script');
            recorderScriptElement.defer = true;
            recorderScriptElement.src = rUrl;
            recorderScriptElement.setAttribute('data-website-id', websiteId);

            if (options.sampleRate !== undefined) {
              recorderScriptElement.setAttribute('data-sample-rate', String(options.sampleRate));
            }
            if (options.maskLevel !== undefined) {
              recorderScriptElement.setAttribute('data-mask-level', options.maskLevel);
            }
            if (options.maxDuration !== undefined) {
              recorderScriptElement.setAttribute('data-max-duration', String(options.maxDuration));
            }
            if (options.blockSelector !== undefined) {
              recorderScriptElement.setAttribute('data-block-selector', options.blockSelector);
            }

            document.head.appendChild(recorderScriptElement);
          }, 500);
        });

        document.head.appendChild(trackerScriptElement);
      } else {
        // 状态变为 unready 或 url 清空时移除
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
