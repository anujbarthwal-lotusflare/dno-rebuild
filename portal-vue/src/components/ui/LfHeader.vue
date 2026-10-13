<template>
    <div :class="['lf-header', { bordered: !$slots.tabs }]">
        <div class="bar">
            <div class="left">
                <div class="title-row">
                    <slot name="title">
                        <h1 class="title">{{ title }}</h1>
                    </slot>
                    <span
                        v-if="count !== undefined"
                        class="count"
                        >({{ count }})</span
                    >
                </div>
                <div
                    v-if="$slots.description"
                    class="desc"
                >
                    <slot name="description" />
                </div>
            </div>
            <div
                v-if="$slots.actions"
                class="actions"
            >
                <slot name="actions" />
            </div>
        </div>
        <slot name="subHeader" />
    </div>
    <slot name="tabs" />
</template>

<script setup lang="ts">
/** HeaderLayout: page title bar with actions, bottom border unless tabs follow. */
defineProps<{ title?: string; count?: number }>();
</script>

<style scoped>
.lf-header {
    padding: 0 var(--sp-md);
    background: var(--white);
}
.lf-header.bordered {
    border-bottom: 1px solid var(--gray-150);
}
.bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-lg);
    padding: var(--sp-lg) 0;
}
.left {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex-shrink: 1;
}
.title-row {
    display: flex;
    align-items: center;
    gap: var(--sp-xs);
    min-width: 0;
}
.title {
    font-size: 1.25rem;
    line-height: 2rem;
    font-weight: 600;
    color: var(--gray-800);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.count {
    font-size: 0.875rem;
    color: var(--gray-600);
}
.desc {
    margin-top: var(--sp-xs);
}
.actions {
    display: flex;
    align-items: center;
    gap: var(--sp-xs);
    flex-shrink: 0;
}
</style>
