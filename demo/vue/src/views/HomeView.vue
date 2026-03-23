<script setup lang="ts">
import { useTracker } from '@umami_router/sdk/vue';
import { useEventTrack } from '@umami_router/sdk/vue';
import { ref } from 'vue';

const { track } = useTracker();
const { trackEvent } = useEventTrack();
const count = ref(0);

const handleButtonClick = async () => {
  count.value++;

  // Track button click event using useEventTrack
  await trackEvent('button_click', {
    button: 'increment',
    page: 'home',
    count: count.value,
  });

  // Alternative: using track.event directly
  await track.event({
    name: 'home_increment',
    data: {
      count: count.value,
    },
  });
};

const handleHeroClick = async () => {
  await trackEvent('hero_banner_click', {
    location: 'home_hero',
  });
};
</script>

<template>
  <div class="home">
    <section class="hero" @click="handleHeroClick">
      <h1>Welcome to Umami Router Demo</h1>
      <p>A Vue 3 integration showcase for @umami_router/sdk</p>
    </section>

    <section class="demo-section">
      <h2>Event Tracking Demo</h2>
      <p>Click the button to send a custom event:</p>
      <button class="demo-button" @click.stop="handleButtonClick">
        Click me! ({{ count }})
      </button>
      <p class="hint">Check your network tab to see the tracking requests</p>
    </section>

    <section class="info-section">
      <h3>Features Demonstrated</h3>
      <ul>
        <li><strong>useTracker()</strong> - Access the tracker instance</li>
        <li><strong>track.pageview()</strong> - Manual pageview tracking</li>
        <li><strong>track.event()</strong> - Custom event tracking</li>
        <li><strong>usePageTrack()</strong> - Auto-track route changes</li>
        <li><strong>useEventTrack()</strong> - Convenience composable for events</li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.hero {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 3rem;
  border-radius: 12px;
  text-align: center;
  cursor: pointer;
  transition: transform 0.2s;
}

.hero:hover {
  transform: scale(1.01);
}

.hero h1 {
  font-size: 2.5rem;
  margin-bottom: 0.5rem;
}

.hero p {
  font-size: 1.2rem;
  opacity: 0.9;
}

.demo-section {
  background: white;
  padding: 2rem;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  text-align: center;
}

.demo-section h2 {
  margin-bottom: 1rem;
  color: #667eea;
}

.demo-button {
  background: #667eea;
  color: white;
  border: none;
  padding: 1rem 2rem;
  font-size: 1.2rem;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s, transform 0.1s;
}

.demo-button:hover {
  background: #5a6fd6;
}

.demo-button:active {
  transform: scale(0.98);
}

.hint {
  margin-top: 1rem;
  font-size: 0.875rem;
  color: #666;
}

.info-section {
  background: white;
  padding: 2rem;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.info-section h3 {
  margin-bottom: 1rem;
  color: #333;
}

.info-section ul {
  list-style: none;
  display: grid;
  gap: 0.75rem;
}

.info-section li {
  padding: 0.75rem;
  background: #f8f9fa;
  border-radius: 6px;
  border-left: 4px solid #667eea;
}

.info-section strong {
  color: #667eea;
}
</style>
