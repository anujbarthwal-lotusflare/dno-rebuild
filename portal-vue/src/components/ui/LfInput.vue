<template>
    <div :class="['lf-input', size]">
        <LfLabel
            v-if="label"
            :html-for="id"
            :optional="optional"
            >{{ label }}</LfLabel
        >
        <textarea
            v-if="type === 'textarea'"
            :id="id"
            class="control area"
            :class="{ invalid: !!error }"
            :rows="rows"
            :placeholder="placeholder"
            :disabled="disabled"
            :value="modelValue ?? ''"
            :maxlength="maxlength"
            @input="onInput"
        />
        <input
            v-else
            :id="id"
            class="control"
            :class="{ invalid: !!error, mono }"
            :type="type"
            :placeholder="placeholder"
            :disabled="disabled"
            :value="modelValue ?? ''"
            :min="min"
            :max="max"
            :step="step"
            :maxlength="maxlength"
            @input="onInput"
        />
        <span
            v-if="error"
            class="error"
            >{{ error }}</span
        >
        <span
            v-else-if="hint"
            class="hint"
            >{{ hint }}</span
        >
    </div>
</template>

<script lang="ts">
let seq = 0;
</script>

<script setup lang="ts">
import LfLabel from './LfLabel.vue';

withDefaults(
    defineProps<{
        modelValue?: string | number | null;
        label?: string;
        placeholder?: string;
        type?: 'text' | 'number' | 'textarea' | 'date' | 'time' | 'email' | 'password';
        size?: 'medium' | 'large';
        error?: string;
        hint?: string;
        optional?: boolean;
        disabled?: boolean;
        mono?: boolean;
        rows?: number;
        min?: string | number;
        max?: string | number;
        step?: string | number;
        maxlength?: number;
    }>(),
    { type: 'text', size: 'medium', rows: 4 },
);
const emit = defineEmits<{ 'update:modelValue': [string] }>();
const id = `lf-input-${++seq}`;
const onInput = (e: Event) => emit('update:modelValue', (e.target as HTMLInputElement).value);
</script>

<style scoped>
.lf-input {
    display: flex;
    flex-direction: column;
    gap: var(--sp-xs);
    min-width: 0;
}
.control {
    width: 100%;
    min-height: 2rem;
    padding: 0 var(--sp-sm);
    border: 0;
    border-radius: var(--radius-xs);
    box-shadow: inset 0 0 0 1px var(--gray-150);
    background: var(--white);
    font-size: 0.75rem;
    line-height: 1rem;
    color: var(--gray-800);
    outline: none;
    transition: box-shadow 0.1s;
}
.large .control {
    min-height: 2.5rem;
    font-size: 0.875rem;
}
.control::placeholder {
    color: var(--gray-500);
}
.control:hover:not(:focus):not(:disabled) {
    box-shadow: inset 0 0 0 2px var(--gray-150);
}
.control:focus {
    box-shadow: inset 0 0 0 1px var(--blue-400);
}
.control:disabled {
    background: var(--gray-100);
    color: var(--gray-500);
}
.control.invalid {
    box-shadow: inset 0 0 0 1px var(--red-400);
}
.control.mono {
    font-family: var(--mono);
    font-size: 0.875rem;
    letter-spacing: 0.02em;
    color: var(--gray-600);
}
.area {
    padding: var(--sp-xs);
    resize: vertical;
    min-height: 5.25rem;
}
.error {
    font-size: 0.75rem;
    color: var(--red-600);
}
.hint {
    font-size: 0.75rem;
    color: var(--gray-600);
}
</style>
