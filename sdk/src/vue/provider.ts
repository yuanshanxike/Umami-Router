import { defineComponent, provide } from 'vue';
import { UMAMI_RUNTIME_KEY, createUmamiRuntime } from './plugin';

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
  },
  setup(props, { slots }) {
    const runtime = createUmamiRuntime({
      websiteId: props.websiteId,
      proxyPath: props.proxyPath,
      autoTrack: props.autoTrack,
    });

    provide(UMAMI_RUNTIME_KEY, runtime);

    return () => slots.default?.();
  },
});
