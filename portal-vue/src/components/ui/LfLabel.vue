<template>
    <label
        class="lf-label"
        :for="htmlFor"
    >
        <span class="text"><slot /></span>
        <span
            v-if="optional"
            class="optional"
            >(optional)</span
        >
    </label>
</template>

<script setup lang="ts">
defineProps<{ htmlFor?: string; optional?: boolean }>();
</script>

<style scoped>
.lf-label {
    display: flex;
    align-items: center;
    gap: var(--sp-xxs);
    font-size: 0.75rem;
    line-height: 1rem;
}
.text {
    font-weight: 600;
    color: var(--gray-800);
}
.optional {
    color: var(--gray-600);
}
</style>
