<template>
    <Teleport to="body">
        <Transition name="lf-drawer">
            <aside
                v-if="visible"
                class="lf-drawer lf-scroll"
                role="complementary"
                :style="{ width }"
            >
                <button
                    type="button"
                    class="close"
                    aria-label="Close"
                    @click="emit('close')"
                >
                    <LfIcon name="CloseIcon" />
                </button>
                <div class="inner">
                    <div
                        v-if="title"
                        class="title"
                    >
                        {{ title }}
                    </div>
                    <slot />
                </div>
            </aside>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import LfIcon from './LfIcon.vue';

/** Drawer (commonComponents Drawer): fixed right panel with a left border. */
withDefaults(defineProps<{ visible: boolean; title?: string; width?: string }>(), { width: '36rem' });
const emit = defineEmits<{ close: [] }>();
</script>

<style scoped>
.lf-drawer {
    position: fixed;
    top: 0;
    right: 0;
    z-index: var(--z-drawer);
    height: 100%;
    max-width: 100vw;
    overflow: auto;
    overscroll-behavior: contain;
    background: var(--white);
    border-left: 1px solid var(--gray-200);
    font-family: var(--font);
    box-shadow: var(--shadow-gray-s);
}
.close {
    position: absolute;
    top: var(--sp-xl);
    right: var(--sp-xl);
    display: flex;
    width: 1.5rem;
    height: 1.5rem;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-xxs);
    color: var(--blue-300);
}
.close:hover {
    background: var(--gray-100);
    color: var(--blue-400);
}
.inner {
    margin: var(--sp-xl);
}
.title {
    font-size: 1rem;
    font-weight: 600;
    margin-bottom: var(--sp-md);
}
.lf-drawer-enter-active,
.lf-drawer-leave-active {
    transition: transform 0.3s;
}
.lf-drawer-enter-from,
.lf-drawer-leave-to {
    transform: translateX(100%);
}
</style>
