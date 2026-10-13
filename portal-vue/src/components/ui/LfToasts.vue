<template>
    <div
        class="lf-toasts"
        aria-live="polite"
    >
        <TransitionGroup name="toast">
            <div
                v-for="t in toasts"
                :key="t.id"
                :class="['toast', t.variant]"
                role="status"
            >
                <div class="stripe" />
                <div class="body">
                    <div class="texts">
                        <div class="title">{{ t.title }}</div>
                        <div
                            v-if="t.description"
                            class="desc"
                        >
                            {{ t.description }}
                        </div>
                    </div>
                    <button
                        type="button"
                        class="close"
                        aria-label="Dismiss"
                        @click="closeToast(t.id)"
                    >
                        <LfIcon name="CloseIcon" />
                    </button>
                </div>
            </div>
        </TransitionGroup>
    </div>
</template>

<script setup lang="ts">
import LfIcon from './LfIcon.vue';
import { closeToast, toasts } from '../../lib/toast.ts';
</script>

<style scoped>
.lf-toasts {
    position: fixed;
    top: 1.25rem;
    right: 1.25rem;
    z-index: var(--z-overlay);
    display: flex;
    flex-direction: column;
    gap: var(--sp-sm);
    font-family: var(--font);
}
.toast {
    display: flex;
    align-items: stretch;
    width: 25rem;
    max-width: calc(100vw - 2.5rem);
    overflow: hidden;
    border: 1px solid var(--gray-150);
    border-radius: var(--radius-xs);
    background: var(--white);
    box-shadow: var(--shadow-gray-s);
}
.stripe {
    width: 0.75rem;
    flex-shrink: 0;
}
.success {
    border-color: var(--green-400);
}
.success .stripe {
    background: var(--green-400);
}
.error {
    border-color: var(--red-400);
}
.error .stripe {
    background: var(--red-400);
}
.info {
    border-color: var(--blue-400);
}
.info .stripe {
    background: var(--blue-400);
}
.warning {
    border-color: var(--yellow-400);
}
.warning .stripe {
    background: var(--yellow-400);
}
.body {
    flex: 1;
    display: flex;
    align-items: flex-start;
    gap: var(--sp-md);
    margin-left: -0.375rem;
    padding: var(--sp-md);
    border-radius: 0.375rem;
    background: var(--white);
}
.texts {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--sp-xs);
}
.title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--gray-800);
}
.desc {
    font-size: 0.875rem;
    color: var(--gray-600);
}
.close {
    display: flex;
    color: var(--blue-300);
}
.toast-enter-active,
.toast-leave-active {
    transition: all 0.2s;
}
.toast-enter-from,
.toast-leave-to {
    opacity: 0;
    transform: translateX(1rem);
}
</style>
