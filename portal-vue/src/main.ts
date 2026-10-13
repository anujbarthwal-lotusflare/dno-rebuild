import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router.ts';
import { loadSettings } from './lib/settings.ts';
import './styles/base.css';

void loadSettings();
createApp(App).use(router).mount('#app');
