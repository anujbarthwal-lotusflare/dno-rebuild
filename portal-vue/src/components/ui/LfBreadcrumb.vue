<template>
    <nav
        class="lf-breadcrumb"
        aria-label="Breadcrumb"
    >
        <template
            v-for="(item, i) in items"
            :key="i"
        >
            <span
                v-if="i > 0"
                class="sep"
                >/</span
            >
            <RouterLink
                v-if="item.to && i < items.length - 1"
                :to="item.to"
                class="item link-item"
                >{{ item.label }}</RouterLink
            >
            <span
                v-else
                :class="['item', { last: i === items.length - 1 }]"
                >{{ item.label }}</span
            >
        </template>
    </nav>
</template>

<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router';

defineProps<{ items: { label: string; to?: RouteLocationRaw }[] }>();
</script>

<style scoped>
.lf-breadcrumb {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--sp-xs);
    font-size: 1rem;
    line-height: 1.5rem;
}
.item,
.sep {
    color: var(--gray-500);
}
.link-item:hover {
    color: var(--blue-400);
}
.last {
    color: var(--gray-800);
}
</style>
