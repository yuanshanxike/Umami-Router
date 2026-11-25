import type { ErrorTrackingOptions, RecorderOptions } from '../types';
import { initBrowserTracker } from './recorder';

function findBootstrapScript(): HTMLScriptElement | null {
  if (typeof document === 'undefined') {
    return null;
  }

  if (document.currentScript instanceof HTMLScriptElement) {
    return document.currentScript;
  }

  const matched = document.querySelector('script[data-umami-router-website-id]');
  return matched instanceof HTMLScriptElement ? matched : null;
}

function parseRecorderOptions(script: HTMLScriptElement): RecorderOptions | boolean {
  const recorderAttr = script.getAttribute('data-umami-router-recorder');
  if (recorderAttr === 'false') {
    return false;
  }

  const sampleRateAttr = script.getAttribute('data-umami-router-sample-rate');
  const maskLevelAttr = script.getAttribute('data-umami-router-mask-level');
  const maxDurationAttr = script.getAttribute('data-umami-router-max-duration');
  const blockSelectorAttr = script.getAttribute('data-umami-router-block-selector');

  const options: RecorderOptions = {};
  if (sampleRateAttr !== null) {
    const parsed = Number(sampleRateAttr);
    if (Number.isFinite(parsed)) {
      options.sampleRate = parsed;
    }
  }
  if (maskLevelAttr === 'moderate' || maskLevelAttr === 'strict') {
    options.maskLevel = maskLevelAttr;
  }
  if (maxDurationAttr !== null) {
    const parsed = Number(maxDurationAttr);
    if (Number.isFinite(parsed)) {
      options.maxDuration = parsed;
    }
  }
  if (blockSelectorAttr) {
    options.blockSelector = blockSelectorAttr;
  }

  return Object.keys(options).length > 0 ? options : true;
}

function parseErrorOptions(script: HTMLScriptElement): ErrorTrackingOptions | boolean {
  const errorsAttr = script.getAttribute('data-umami-router-errors');
  if (errorsAttr !== 'true') {
    return false;
  }

  const release = script.getAttribute('data-umami-router-release') || undefined;
  const environment = script.getAttribute('data-umami-router-environment') || undefined;

  if (!release && !environment) {
    return true;
  }

  return { release, environment };
}

function bootstrap(): void {
  const script = findBootstrapScript();
  if (!script) {
    return;
  }

  const websiteId = script.getAttribute('data-umami-router-website-id')?.trim() ?? '';
  if (!websiteId) {
    return;
  }

  const proxyPath = script.getAttribute('data-umami-router-proxy-path')?.trim() || '/trpc';
  const autoTrack = script.getAttribute('data-umami-router-auto-track') !== 'false';
  const recorder = parseRecorderOptions(script);
  const errors = parseErrorOptions(script);
  const performance = script.getAttribute('data-umami-router-performance') === 'true';

  const handle = initBrowserTracker({
    websiteId,
    proxyPath,
    autoTrack,
    recorder,
    errors,
    performance,
  });

  if (typeof window !== 'undefined') {
    Reflect.set(window, '__umamiTrack', (name: string, data?: Record<string, unknown>) => {
      void handle.trackEvent(name, data).catch(() => {});
    });
    Reflect.set(window, 'umamiRouter', handle);
  }
}

bootstrap();
