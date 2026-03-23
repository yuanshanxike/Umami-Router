<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useTracker } from '@umami_router/sdk/vue';

const { tracker } = useTracker();
const isReady = ref(false);
const isTracking = ref(false);

onMounted(async () => {
  isReady.value = tracker.isInitialized();

  // Get health status
  const health = await tracker.getHealth();
  isTracking.value = health !== null;
});
</script>

<template>
  <div class="status-badge" :class="{ ready: isReady, tracking: isTracking }">
    <span class="dot"></span>
    <span class="text">
      {{ isReady ? (isTracking ? 'Connected' : 'Ready') : 'Initializing...' }}
    </span>
  </div>
</template>

<style scoped>
.status-badge {
  position: fixed;
  top: 1rem;
  right: 1rem;
  background: white;
  padding: 0.5rem 1rem;
  border-radius: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  z-index: 1000;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ffc107;
}

.status-badge.ready .dot {
  background: #28a745;
}

.status-badge.tracking .dot {
  background: #28a745;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.text {
  color: #333;
  font-weight: 500;
}
</style>
