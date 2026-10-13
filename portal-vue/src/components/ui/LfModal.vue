<template>
    <Teleport to="body">
        <div
            class="lf-modal-overlay"
            @mousedown.self="emit('close')"
        >
            <div
                class="lf-modal"
                role="dialog"
                aria-modal="true"
                :aria-label="title"
                :style="{ width, maxHeight }"
            >
                <div class="head">
                    <div class="titles">
                        <span
                            v-if="title"
                            class="title"
                            >{{ title }}</span
                        >
                        <p
                            v-if="description"
                            class="description"
                        >
                            {{ description }}
                        </p>
                    </div>
                    <div class="head-right">
                        <slot name="headerRight" />
                        <button
                            type="button"
                            class="close"
                            aria-label="Close"
                            @click="emit('close')"
                        >
                            <LfIcon name="CloseIcon" />
                        </button>
                    </div>
                </div>
                <div class="content lf-scroll">
                    <slot />
                </div>
                <div
                    v-if="$slots.footer"
                    class="foot"
                >
                    <slot name="footer" />
                </div>
            </div>
        </div>
    </Teleport>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import LfIcon from './LfIcon.vue';

/** Modal (commonComponents Modal): blue-tinted overlay, white rounded panel, p-2xl header and footer. */
withDefaults(defineProps<{ title?: string; description?: string; width?: string; maxHeight?: string }>(), { width: '47.5rem', maxHeight: '90vh' });
const emit = defineEmits<{ close: [] }>();
const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') emit('close');
};
onMounted(() => document.addEventListener('keydown', onKey));
onBeforeUnmount(() => document.removeEventListener('keydown', onKey));
</script>

<style scoped>
.lf-modal-overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: auto;
    background: #3d558b29;
    font-family: var(--font);
}
.lf-modal {
    display: flex;
    flex-direction: column;
    max-width: calc(100vw - 2rem);
    overflow: hidden;
    border-radius: var(--radius-sm);
    background: var(--white);
    box-shadow: var(--shadow-gray-xl);
}
.head {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-md);
    padding: var(--sp-2xl) var(--sp-2xl) var(--sp-md);
}
.titles {
    flex: 1;
    display: flex;
    flex-direction: column;
}
.title {
    font-size: 1rem;
    line-height: 1.5rem;
    font-weight: 600;
    color: var(--gray-800);
}
.description {
    font-size: 0.875rem;
    color: var(--gray-600);
}
.head-right {
    display: flex;
    align-items: center;
    gap: var(--sp-md);
}
.close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: var(--radius-xxs);
    color: var(--blue-300);
}
.close:hover {
    background: var(--gray-100);
    color: var(--blue-400);
}
.content {
    flex: 1;
    overflow-y: auto;
    padding: 0 var(--sp-2xl);
}
.foot {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--sp-2xl);
    padding: var(--sp-2xl);
}
</style>
