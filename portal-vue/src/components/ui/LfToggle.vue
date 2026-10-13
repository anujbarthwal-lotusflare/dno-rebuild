<template>
    <label class="lf-toggle">
        <input
            type="checkbox"
            class="sr-only"
            role="switch"
            :checked="modelValue"
            :disabled="disabled"
            @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
        />
        <span :class="['track', { on: modelValue }]"><span class="knob" /></span>
        <span
            v-if="label"
            class="text"
            >{{ label }}</span
        >
    </label>
</template>

<script setup lang="ts">
defineProps<{ modelValue: boolean; label?: string; disabled?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [boolean] }>();
</script>

<style scoped>
.lf-toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-xs);
    cursor: pointer;
}
.track {
    position: relative;
    width: 2rem;
    height: 1.125rem;
    border-radius: 1rem;
    background: var(--gray-200);
    transition: background 0.15s;
    flex-shrink: 0;
}
.track.on {
    background: var(--blue-400);
}
.knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 0.875rem;
    height: 0.875rem;
    border-radius: 50%;
    background: var(--white);
    transition: transform 0.15s;
}
.track.on .knob {
    transform: translateX(0.875rem);
}
.text {
    font-size: 0.875rem;
    color: var(--gray-800);
}
</style>
