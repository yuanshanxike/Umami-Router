import { defineComponent, provide } from 'vue';
import { UMAMI_RUNTIME_KEY, createUmamiRuntime } from './plugin';
import type { PropType } from 'vue';
import type { ErrorTrackingOptions, RecorderOptions } from '../types';

export const UmamiProvider = defineComponent({
  name: 'UmamiProvider',
  props: {
    websiteId: {
      type: String,
      required: true,
    },
    proxyPath: {
      type: String,
      default: '/trpc',
    },
    autoTrack: {
      type: Boolean,
      default: true,
    },
    recorder: {
      type: [Boolean, Object] as PropType<boolean | RecorderOptions>,
      default: false,
    },
    errors: {
      type: [Boolean, Object] as PropType<boolean | ErrorTrackingOptions>,
      default: false,
    },
    performance: {
      type: Boolean,
      default: false,
    },
  },
  setup(props, { slots }) {
    const runtime = createUmamiRuntime({
      websiteId: props.websiteId,
      proxyPath: props.proxyPath,
      autoTrack: props.autoTrack,
      recorder: props.recorder,
      errors: props.errors,
      performance: props.performance,
    });

    provide(UMAMI_RUNTIME_KEY, runtime);

    return () => slots.default?.();
  },
});
