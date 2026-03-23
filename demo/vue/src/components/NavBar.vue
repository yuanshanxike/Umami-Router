<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router';
import { useEventTrack } from '@umami_router/sdk/vue';

const route = useRoute();
const { trackEvent } = useEventTrack();

const handleNavClick = async (routeName: string) => {
  await trackEvent('navigation_click', {
    to: routeName,
    from: route.name as string,
  });
};
</script>

<template>
  <nav class="navbar">
    <div class="nav-brand">
      <span class="logo">📊</span>
      <span class="brand-text">Umami Router</span>
    </div>
    <ul class="nav-links">
      <li>
        <RouterLink
          to="/"
          :class="{ active: route.name === 'home' }"
          @click="handleNavClick('home')"
        >
          Home
        </RouterLink>
      </li>
      <li>
        <RouterLink
          to="/about"
          :class="{ active: route.name === 'about' }"
          @click="handleNavClick('about')"
        >
          About
        </RouterLink>
      </li>
      <li>
        <RouterLink
          to="/contact"
          :class="{ active: route.name === 'contact' }"
          @click="handleNavClick('contact')"
        >
          Contact
        </RouterLink>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
.navbar {
  background: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  padding: 1rem 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.nav-brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.logo {
  font-size: 1.5rem;
}

.brand-text {
  font-weight: 700;
  font-size: 1.25rem;
  color: #333;
}

.nav-links {
  display: flex;
  list-style: none;
  gap: 2rem;
}

.nav-links a {
  text-decoration: none;
  color: #666;
  font-weight: 500;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  transition: all 0.2s;
}

.nav-links a:hover {
  background: #f0f0f0;
  color: #333;
}

.nav-links a.active {
  background: #667eea;
  color: white;
}

.nav-links a.active:hover {
  background: #5a6fd6;
}
</style>
