<template>
    <div class="lf-empty">
        <img
            class="art"
            :src="asset(`/icons/${error ? 'EmptyListErrorIcon' : icon}.svg`)"
            alt=""
        />
        <p :class="['text', { err: !!error }]">{{ error || description }}</p>
        <button
            v-if="buttonText"
            type="button"
            class="btn"
            @click="emit('click')"
        >
            {{ buttonText }}
        </button>
    </div>
</template>

<script setup lang="ts">
import { asset } from '../../lib/assets.ts';
withDefaults(defineProps<{ description?: string; error?: string; icon?: string; buttonText?: string }>(), { description: 'No data', icon: 'EmptyListIcon' });
const emit = defineEmits<{ click: [] }>();
</script>

<style scoped>
.lf-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    margin: var(--sp-3xl) 0;
}
.art {
    width: 4.5rem;
    height: 4.5rem;
}
.text {
    padding: var(--sp-md) 0 var(--sp-xxs);
    font-size: 0.875rem;
    line-height: 1.5rem;
    color: var(--gray-600);
    text-align: center;
}
.text.err {
    color: var(--red-600);
}
.btn {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--blue-400);
}
</style>
