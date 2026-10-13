<template>
    <div class="shell">
        <AppSidebar />
        <main
            id="main"
            class="main lf-scroll"
        >
            <RouterView :key="$route.fullPath" />
        </main>
        <button
            type="button"
            class="assistant"
            aria-label="AI assistant"
            @click="assistantOpen = !assistantOpen"
        >
            <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
            >
                <path
                    d="M10 3.5l1.6 4.4a3 3 0 0 0 1.8 1.8l4.4 1.6-4.4 1.6a3 3 0 0 0-1.8 1.8L10 19.1l-1.6-4.4a3 3 0 0 0-1.8-1.8L2.2 11.3l4.4-1.6a3 3 0 0 0 1.8-1.8z"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.6"
                    stroke-linejoin="round"
                />
                <path
                    d="M18.5 2.5v4M16.5 4.5h4"
                    stroke="currentColor"
                    stroke-width="1.6"
                    stroke-linecap="round"
                />
            </svg>
        </button>
        <div
            v-if="assistantOpen"
            class="assistant-pop"
            role="dialog"
            aria-label="AI assistant"
        >
            <div class="assistant-head">
                <strong>AI Assistant</strong>
                <button
                    type="button"
                    aria-label="Close"
                    class="assistant-x"
                    @click="assistantOpen = false"
                >
                    ×
                </button>
            </div>
            <p>The portal assistant connects to {{ brand.name }}'s hosted AI service, which is not part of this rebuild.</p>
        </div>
        <LfToasts />
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import AppSidebar from './components/layout/AppSidebar.vue';
import { brand } from './lib/assets.ts';
import LfToasts from './components/ui/LfToasts.vue';

const assistantOpen = ref(false);
</script>

<style scoped>
.shell {
    display: flex;
    height: 100vh;
    overflow: hidden;
}
.main {
    flex: 1;
    min-width: 0;
    height: 100vh;
    overflow-y: auto;
    overflow-x: hidden;
    background: var(--white);
}
.assistant {
    position: fixed;
    right: 1.75rem;
    bottom: 1.75rem;
    z-index: 45;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 3.75rem;
    height: 3.75rem;
    border-radius: 50%;
    background: #1c2c55;
    color: var(--white);
    box-shadow: 0 6px 18px rgba(28, 44, 85, 0.35);
}
.assistant svg {
    width: 1.75rem;
    height: 1.75rem;
}
.assistant:hover {
    background: var(--blue-500);
}
.assistant-pop {
    position: fixed;
    right: 1.75rem;
    bottom: 6.25rem;
    z-index: 45;
    width: 20rem;
    padding: var(--sp-md);
    border-radius: var(--radius-xs);
    background: var(--white);
    box-shadow: var(--shadow-gray-s);
    font-size: 0.875rem;
    color: var(--gray-600);
}
.assistant-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--sp-xs);
    color: var(--gray-800);
}
.assistant-x {
    font-size: 1.25rem;
    line-height: 1;
    color: var(--blue-300);
}
</style>
