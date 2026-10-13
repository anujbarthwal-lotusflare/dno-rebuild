import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// `npm run dev:portal` serves the portal on :5173 and forwards API calls to the backend on :3000.
export default defineConfig({
    plugins: [vue()],
    server: { proxy: { '/api': 'http://127.0.0.1:3000' } },
});
