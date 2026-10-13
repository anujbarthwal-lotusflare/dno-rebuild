<template>
    <div
        class="lf-search"
        :class="{ filled: !!modelValue }"
        :style="{ width }"
    >
        <LfIcon
            class="icon"
            name="SearchIcon"
        />
        <input
            :value="modelValue"
            type="text"
            :placeholder="placeholder"
            @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
            @keydown.enter.prevent
        />
        <button
            v-if="modelValue"
            type="button"
            class="clear"
            aria-label="Clear search"
            @click="emit('update:modelValue', '')"
        >
            <LfIcon name="CloseIcon" />
        </button>
    </div>
</template>

<script setup lang="ts">
import LfIcon from './LfIcon.vue';

withDefaults(defineProps<{ modelValue: string; placeholder?: string; width?: string }>(), { placeholder: 'Search...', width: '18.75rem' });
const emit = defineEmits<{ 'update:modelValue': [string] }>();
</script>

<style scoped>
.lf-search {
    --border: var(--gray-150);
    display: flex;
    align-items: center;
    gap: var(--sp-xs);
    max-width: 46rem;
    height: 2.5rem;
    padding: 0 var(--sp-xs) 0 var(--sp-md);
    border: 1px solid var(--border);
    border-radius: var(--radius-xs);
    background: var(--white);
    flex-shrink: 1;
    min-width: 8rem;
}
.lf-search:focus-within,
.lf-search.filled {
    --border: var(--blue-400);
}
.lf-search:hover:not(:focus-within) {
    box-shadow: 0 0 0 0.5px var(--gray-300);
}
.icon {
    color: var(--gray-800);
}
input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: none;
    background: transparent;
    font-size: 0.75rem;
    color: var(--gray-800);
}
input::placeholder {
    color: var(--gray-500);
}
.clear {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: var(--radius-xxs);
    color: var(--blue-300);
}
.clear:hover {
    background: var(--gray-100);
    color: var(--blue-400);
}
</style>
