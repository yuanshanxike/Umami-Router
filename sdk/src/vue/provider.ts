import { defineComponent, provide } from 'vue';
import { UMAMI_RUNTIME_KEY, createUmamiRuntime } from './plugin';
import type { PropType } from 'vue';
import type { RecorderOptions } from '../types';

export const UmamiProvider = defineComponent({
  name: 'UmamiProvider',
  props: {
    websiteId: {
      type: String,
      required: true,
    },
    proxyPath: {
      type: String,
      default: '/api/umami',
    },
    autoTrack: {
      type: Boolean,
      default: true,
    },
    recorder: {
      type: [Boolean, Object] as PropType<boolean | RecorderOptions>,
      default: false,
    },
  },
  setup(props, { slots }) {
    const runtime = createUmamiRuntime({
      websiteId: props.websiteId,
      proxyPath: props.proxyPath,
      autoTrack: props.autoTrack,
      recorder: props.recorder,
    });

    provide(UMAMI_RUNTIME_KEY, runtime);

    return () => slots.default?.();
  },
});
