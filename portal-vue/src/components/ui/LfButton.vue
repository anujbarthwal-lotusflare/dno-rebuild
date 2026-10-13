<template>
    <button
        :type="type"
        :class="['lf-button', variant, { 'icon-left': icon && !iconRight, 'icon-right': icon && iconRight, active, loading }]"
        :disabled="disabled || loading"
        @click="emit('click', $event)"
    >
        <LfIcon
            v-if="loading"
            name="LoaderIcon"
            class="spin"
        />
        <span
            v-else-if="icon"
            :class="['btn-icon', iconClass]"
        >
            <LfIcon :name="icon" />
        </span>
        <span
            v-if="label"
            :class="labelClass"
            >{{ label }}</span
        >
        <slot />
    </button>
</template>

<script setup lang="ts">
import LfIcon from './LfIcon.vue';

/** Button, as commonComponents/basicComponents/Button: primary, secondary, tertiary_m, tertiary_s. */
withDefaults(
    defineProps<{
        variant?: 'primary' | 'secondary' | 'tertiary_m' | 'tertiary_s';
        label?: string;
        icon?: string;
        iconRight?: boolean;
        iconClass?: string;
        labelClass?: string;
        disabled?: boolean;
        loading?: boolean;
        active?: boolean;
        type?: 'button' | 'submit';
    }>(),
    { variant: 'primary', type: 'button' },
);
const emit = defineEmits<{ click: [MouseEvent] }>();
</script>

<style scoped>
.lf-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-xs);
    min-height: 2.5rem;
    padding: var(--sp-xs) var(--sp-2xl);
    border-radius: var(--radius-xs);
    font-size: 0.875rem;
    line-height: 1.5rem;
    font-weight: 600;
    white-space: nowrap;
    vertical-align: middle;
    cursor: pointer;
    transition: all 0.15s;
}
.lf-button:disabled {
    cursor: not-allowed;
    background: var(--gray-100) !important;
    color: var(--gray-300) !important;
    border-color: var(--gray-100) !important;
}
.icon-left {
    padding-left: var(--sp-xl);
}
.icon-right {
    padding-right: var(--sp-xl);
    flex-direction: row-reverse;
}
.btn-icon {
    display: flex;
    align-items: center;
}
.primary {
    background: var(--blue-400);
    color: var(--white);
}
.primary:hover {
    background: var(--blue-500);
}
.primary:active,
.primary.active {
    background: var(--blue-600);
}
.secondary {
    background: var(--white);
    color: var(--blue-400);
    border: 1px solid var(--gray-150);
    padding-block: 0.375rem;
}
.secondary:hover {
    background: var(--gray-100);
    border-color: var(--gray-100);
}
.secondary:active,
.secondary.active {
    background: var(--gray-200);
    border-color: var(--gray-200);
}
.secondary:disabled {
    background: var(--white) !important;
}
.tertiary_m,
.tertiary_s {
    min-width: 0;
    min-height: 0;
    padding: 0;
    background: transparent;
    color: var(--blue-400);
}
.tertiary_s {
    font-size: 0.75rem;
}
.tertiary_m:hover,
.tertiary_s:hover {
    color: var(--blue-500);
}
.tertiary_m:disabled,
.tertiary_s:disabled {
    background: transparent !important;
}
.spin {
    animation: lf-spin 1s linear infinite;
}
@keyframes lf-spin {
    to {
        transform: rotate(360deg);
    }
}
</style>
