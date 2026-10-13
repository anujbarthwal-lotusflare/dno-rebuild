<template>
    <label :class="['lf-checkbox', { disabled }]">
        <input
            type="checkbox"
            class="sr-only"
            :checked="modelValue"
            :disabled="disabled"
            @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
        />
        <span :class="['box', { on: modelValue || indeterminate }]">
            <svg
                v-if="indeterminate && !modelValue"
                viewBox="0 0 16 16"
                aria-hidden="true"
            >
                <path
                    d="M4 8h8"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                />
            </svg>
            <svg
                v-else-if="modelValue"
                viewBox="0 0 16 16"
                aria-hidden="true"
            >
                <path
                    d="M3.5 8.5l3 3 6-7"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />
            </svg>
        </span>
        <span
            v-if="label"
            class="text"
            >{{ label }}</span
        >
    </label>
</template>

<script setup lang="ts">
defineProps<{ modelValue: boolean; label?: string; indeterminate?: boolean; disabled?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [boolean] }>();
</script>

<style scoped>
.lf-checkbox {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-xs);
    cursor: pointer;
    user-select: none;
}
.box {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
    border: 1.5px solid var(--gray-300);
    border-radius: 0.25rem;
    background: var(--white);
    color: var(--white);
}
.box.on {
    background: var(--blue-400);
    border-color: var(--blue-400);
}
.box svg {
    width: 0.875rem;
    height: 0.875rem;
}
.lf-checkbox:hover .box:not(.on) {
    border-color: var(--blue-400);
}
.text {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--gray-800);
}
.disabled {
    cursor: not-allowed;
    opacity: 0.5;
}
</style>
