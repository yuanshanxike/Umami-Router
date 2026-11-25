import { useEffect, useRef } from 'react';
import { mountUmamiScripts } from '../core/recorder';
import type { ErrorTrackingOptions, RecorderOptions, ScriptFeatureOptions } from '../types';

export interface NextjsScriptOptions extends ScriptFeatureOptions {
  triggerInitialTrack?: boolean;
  onScriptError?: () => void;
}

/**
 * 内部 hook：在 Next.js 中动态注入 script.js + recorder.js 脚本
 * 拆解原始字段依赖避免对象引用变化导致重复重注入脚本。
 * 由 UmamiProvider / useUmami 内部调用，不对外导出
 */
export function useInjectRecorderScript(
  scriptUrl: string | null,
  recorderUrl: string | null,
  websiteId: string,
  options: NextjsScriptOptions,
  isReady: boolean
): void {
  const recorderEnabled = Boolean(options.recorder);
  const recorderObj = typeof options.recorder === 'object' ? options.recorder : undefined;
  const sampleRate = recorderObj?.sampleRate;
  const maskLevel = recorderObj?.maskLevel;
  const maxDuration = recorderObj?.maxDuration;
  const blockSelector = recorderObj?.blockSelector;

  const errorsEnabled = Boolean(options.errors);
  const errorsObj = typeof options.errors === 'object' ? options.errors : undefined;
  const errorRelease = errorsObj?.release;
  const errorEnvironment = errorsObj?.environment;

  const performanceEnabled = Boolean(options.performance);
  const triggerInitialTrack = options.triggerInitialTrack !== false;

  const onScriptErrorRef = useRef(options.onScriptError);
  onScriptErrorRef.current = options.onScriptError;

  useEffect(() => {
    if ((!recorderEnabled && !errorsEnabled && !performanceEnabled) || !isReady || !scriptUrl) {
      return;
    }

    let recorderConfig: RecorderOptions | boolean = false;
    if (recorderEnabled) {
      const hasLegacyFields =
        sampleRate !== undefined ||
        maskLevel !== undefined ||
        maxDuration !== undefined ||
        blockSelector !== undefined;
      recorderConfig = hasLegacyFields
        ? {
            ...(sampleRate !== undefined ? { sampleRate } : {}),
            ...(maskLevel !== undefined ? { maskLevel } : {}),
            ...(maxDuration !== undefined ? { maxDuration } : {}),
            ...(blockSelector !== undefined ? { blockSelector } : {}),
          }
        : true;
    }

    let errorsConfig: ErrorTrackingOptions | boolean = false;
    if (errorsEnabled) {
      errorsConfig =
        errorRelease || errorEnvironment
          ? {
              ...(errorRelease ? { release: errorRelease } : {}),
              ...(errorEnvironment ? { environment: errorEnvironment } : {}),
            }
          : true;
    }

    return mountUmamiScripts({
      scriptUrl,
      recorderUrl,
      websiteId,
      recorder: recorderConfig,
      errors: errorsConfig,
      performance: performanceEnabled,
      triggerInitialTrack,
      onScriptError: () => onScriptErrorRef.current?.(),
    });
  }, [
    scriptUrl,
    recorderUrl,
    websiteId,
    isReady,
    recorderEnabled,
    sampleRate,
    maskLevel,
    maxDuration,
    blockSelector,
    errorsEnabled,
    errorRelease,
    errorEnvironment,
    performanceEnabled,
    triggerInitialTrack,
  ]);
}
