<script setup lang="ts">
import { useTracker, usePageTrack } from '@umami_router/sdk/vue';
import { useRoute } from 'vue-router';
import NavBar from './components/NavBar.vue';
import StatusBadge from './components/StatusBadge.vue';

// Track pageviews when route changes
const route = useRoute();
usePageTrack(() => route.path);

const { isAutoTrackEnabled } = useTracker();
</script>

<template>
  <div class="app">
    <StatusBadge />
    <NavBar />
    <main class="main-content">
      <router-view />
    </main>
    <footer class="footer">
      <p>Umami Router Vue Demo - Auto-tracking {{ isAutoTrackEnabled() ? 'enabled' : 'disabled' }}</p>
    </footer>
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  line-height: 1.6;
  color: #333;
  background: #f5f5f5;
}

.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.main-content {
  flex: 1;
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
  width: 100%;
}

.footer {
  background: #333;
  color: white;
  text-align: center;
  padding: 1rem;
  margin-top: auto;
}
</style>
