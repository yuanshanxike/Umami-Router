import { useEffect } from 'react';
import type { RecorderOptions } from '../types';

/**
 * 内部 hook：在 Next.js 中动态注入 script.js + recorder.js 脚本
 * recorder.js 依赖 script.js 创建的 window.umami 全局对象（特别是 getSession().cache）
 *
 * 注入流程：
 * 1. 注入 script.js（data-auto-track="false"），等待加载完成
 * 2. 调用 window.umami.track() 触发 session 初始化（获取 cache）
 * 3. 注入 recorder.js
 *
 * 由 UmamiProvider / useUmami 内部调用，不对外导出
 */
export function useInjectRecorderScript(
  scriptUrl: string | null,
  recorderUrl: string | null,
  websiteId: string,
  recorderOptions: RecorderOptions | boolean | undefined,
  isReady: boolean
): void {
  useEffect(() => {
    // 当不启用、未就绪、或路径不存在时不注入
    if (!recorderOptions || !isReady || !scriptUrl || !recorderUrl) {
      return;
    }

    const options = typeof recorderOptions === 'object' ? recorderOptions : {};
    let recorderScript: HTMLScriptElement | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    // 1. 先注入 script.js（tracker 脚本）以创建 window.umami 全局对象
    const trackerScript = document.createElement('script');
    trackerScript.defer = true;
    trackerScript.src = scriptUrl;
    trackerScript.setAttribute('data-website-id', websiteId);
    // 禁用 script.js 的自动追踪，因为我们的 SDK 已经通过 tRPC 处理了追踪
    trackerScript.setAttribute('data-auto-track', 'false');

    // script.js 加载完成后，触发 session 初始化，然后注入 recorder.js
    trackerScript.addEventListener('load', () => {
      // 调用 track() 触发 session 初始化（建立 cache）
      // recorder.js 需要 getSession().cache 才会开始录制
      const umami = (window as unknown as Record<string, unknown>).umami as
        | { track?: () => void }
        | undefined;
      umami?.track?.();

      // 短暂等待 session 建立后再注入 recorder.js
      timeoutId = setTimeout(() => {
        recorderScript = document.createElement('script');
        recorderScript.defer = true;
        recorderScript.src = recorderUrl!;
        recorderScript.setAttribute('data-website-id', websiteId);

        if (options.sampleRate !== undefined) {
          recorderScript.setAttribute('data-sample-rate', String(options.sampleRate));
        }
        if (options.maskLevel !== undefined) {
          recorderScript.setAttribute('data-mask-level', options.maskLevel);
        }
        if (options.maxDuration !== undefined) {
          recorderScript.setAttribute('data-max-duration', String(options.maxDuration));
        }
        if (options.blockSelector !== undefined) {
          recorderScript.setAttribute('data-block-selector', options.blockSelector);
        }

        document.head.appendChild(recorderScript);
      }, 500);
    });

    document.head.appendChild(trackerScript);

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (recorderScript?.parentNode) {
        recorderScript.parentNode.removeChild(recorderScript);
      }
      if (trackerScript.parentNode) {
        trackerScript.parentNode.removeChild(trackerScript);
      }
    };
  }, [scriptUrl, recorderUrl, websiteId, recorderOptions, isReady]);
}
