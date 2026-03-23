import { createApp } from 'vue';
import App from './App.vue';
import router from './router';

// Umami SDK - Using direct source import
import { createUmamiPlugin } from '@umami_router/sdk/vue';

// Demo configuration - replace with your actual values
const WEBSITE_ID = import.meta.env.VITE_UMAMI_WEBSITE_ID ?? '';
const PROXY_PATH = import.meta.env.VITE_UMAMI_PROXY_PATH ?? '/trpc';

const umamiPlugin = createUmamiPlugin({
  websiteId: WEBSITE_ID,
  proxyPath: PROXY_PATH,
  autoTrack: true,
  useRouter: true,
});

const app = createApp(App);

app.use(router);
app.use(umamiPlugin);

app.mount('#app');
