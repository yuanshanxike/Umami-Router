<script setup lang="ts">
import { useEventTrack } from '@umami_router/sdk/vue';

const { trackEvent } = useEventTrack();

const handleFeatureClick = async (feature: string) => {
  await trackEvent('feature_click', {
    feature,
    page: 'about',
  });
};
</script>

<template>
  <div class="about">
    <header class="page-header">
      <h1>About @umami_router/sdk</h1>
      <p>Powerful analytics tracking for Vue 3 applications</p>
    </header>

    <section class="features-grid">
      <div
        class="feature-card"
        @click="handleFeatureClick('auto-tracking')"
      >
        <h3>Auto-Tracking</h3>
        <p>Automatically track pageviews when routes change with Vue Router integration.</p>
      </div>

      <div
        class="feature-card"
        @click="handleFeatureClick('event-tracking')"
      >
        <h3>Event Tracking</h3>
        <p>Track custom events with payload data for deeper analytics insights.</p>
      </div>

      <div
        class="feature-card"
        @click="handleFeatureClick('retry-queue')"
      >
        <h3>Retry Queue</h3>
        <p>Failed requests are automatically retried with exponential backoff.</p>
      </div>

      <div
        class="feature-card"
        @click="handleFeatureClick('rate-limiting')"
      >
        <h3>Rate Limiting</h3>
        <p>Built-in rate limiting protection to prevent overwhelming your analytics server.</p>
      </div>

      <div
        class="feature-card"
        @click="handleFeatureClick('type-safe')"
      >
        <h3>TypeScript Support</h3>
        <p>Full TypeScript support with type definitions for all APIs.</p>
      </div>

      <div
        class="feature-card"
        @click="handleFeatureClick('tree-shakeable')"
      >
        <h3>Tree-Shakeable</h3>
        <p>Import only what you need for optimal bundle size.</p>
      </div>
    </section>

    <section class="config-section">
      <h2>Configuration</h2>
  <pre><code>const umamiPlugin = createUmamiPlugin({
  websiteId: 'your-website-id',
  proxyPath: '/trpc',
  autoTrack: true,
  useRouter: true,
});</code></pre>
    </section>
  </div>
</template>

<style scoped>
.about {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.page-header {
  text-align: center;
  padding: 2rem 0;
}

.page-header h1 {
  font-size: 2rem;
  color: #333;
  margin-bottom: 0.5rem;
}

.page-header p {
  color: #666;
  font-size: 1.1rem;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
}

.feature-card {
  background: white;
  padding: 1.5rem;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  border-left: 4px solid #667eea;
}

.feature-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
}

.feature-card h3 {
  color: #667eea;
  margin-bottom: 0.5rem;
}

.feature-card p {
  color: #666;
  font-size: 0.95rem;
}

.config-section {
  background: #1e1e1e;
  padding: 1.5rem;
  border-radius: 12px;
  overflow-x: auto;
}

.config-section h2 {
  color: white;
  margin-bottom: 1rem;
  font-size: 1.2rem;
}

.config-section pre {
  margin: 0;
}

.config-section code {
  color: #d4d4d4;
  font-family: 'Fira Code', 'Monaco', 'Courier New', monospace;
  font-size: 0.875rem;
}
</style>
