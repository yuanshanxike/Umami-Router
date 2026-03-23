<script setup lang="ts">
import { ref } from 'vue';
import { useEventTrack } from '@umami_router/sdk/vue';

const { trackEvent } = useEventTrack();
const formData = ref({
  name: '',
  email: '',
  message: '',
});
const submitted = ref(false);

const handleSubmit = async () => {
  // Track form submission event
  await trackEvent('contact_form_submit', {
    name: formData.value.name,
    hasMessage: formData.value.message.length > 0,
  });

  submitted.value = true;
};

const handleFieldFocus = async (field: string) => {
  await trackEvent('form_field_focus', {
    field,
    page: 'contact',
  });
};
</script>

<template>
  <div class="contact">
    <header class="page-header">
      <h1>Contact Us</h1>
      <p>Get in touch with the Umami Router team</p>
    </header>

    <div class="contact-container">
      <form v-if="!submitted" class="contact-form" @submit.prevent="handleSubmit">
        <div class="form-group">
          <label for="name">Name</label>
          <input
            id="name"
            v-model="formData.name"
            type="text"
            placeholder="Your name"
            required
            @focus="handleFieldFocus('name')"
          />
        </div>

        <div class="form-group">
          <label for="email">Email</label>
          <input
            id="email"
            v-model="formData.email"
            type="email"
            placeholder="your@email.com"
            required
            @focus="handleFieldFocus('email')"
          />
        </div>

        <div class="form-group">
          <label for="message">Message</label>
          <textarea
            id="message"
            v-model="formData.message"
            placeholder="Your message..."
            rows="5"
            required
            @focus="handleFieldFocus('message')"
          ></textarea>
        </div>

        <button type="submit" class="submit-button">Send Message</button>
      </form>

      <div v-else class="success-message">
        <h2>Thank you!</h2>
        <p>Your message has been tracked and we'll be in touch soon.</p>
        <button class="reset-button" @click="submitted = false">Send another</button>
      </div>

      <aside class="contact-info">
        <h3>Other ways to reach us</h3>
        <ul>
          <li>
            <span class="icon">📧</span>
            <span>support@umami.router</span>
          </li>
          <li>
            <span class="icon">🐦</span>
            <span>@umami_router</span>
          </li>
          <li>
            <span class="icon">💬</span>
            <span>Discord community</span>
          </li>
        </ul>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.contact {
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

.contact-container {
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: 2rem;
}

@media (max-width: 768px) {
  .contact-container {
    grid-template-columns: 1fr;
  }
}

.contact-form {
  background: white;
  padding: 2rem;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 600;
  color: #333;
}

.form-group input,
.form-group textarea {
  width: 100%;
  padding: 0.75rem;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 1rem;
  transition: border-color 0.2s;
  font-family: inherit;
}

.form-group input:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #667eea;
}

.submit-button {
  width: 100%;
  background: #667eea;
  color: white;
  border: none;
  padding: 1rem;
  font-size: 1rem;
  font-weight: 600;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}

.submit-button:hover {
  background: #5a6fd6;
}

.success-message {
  background: white;
  padding: 3rem;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  text-align: center;
}

.success-message h2 {
  color: #667eea;
  margin-bottom: 0.5rem;
}

.success-message p {
  color: #666;
  margin-bottom: 1.5rem;
}

.reset-button {
  background: transparent;
  color: #667eea;
  border: 2px solid #667eea;
  padding: 0.75rem 1.5rem;
  font-size: 1rem;
  font-weight: 600;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.reset-button:hover {
  background: #667eea;
  color: white;
}

.contact-info {
  background: white;
  padding: 1.5rem;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  height: fit-content;
}

.contact-info h3 {
  margin-bottom: 1rem;
  color: #333;
}

.contact-info ul {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.contact-info li {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: #666;
}

.contact-info .icon {
  font-size: 1.25rem;
}
</style>
