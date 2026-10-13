<template>
    <div
        class="lf-tabs"
        role="tablist"
    >
        <button
            v-for="tab in tabs"
            :key="tab.key"
            type="button"
            role="tab"
            :aria-selected="tab.key === modelValue"
            :class="['tab', { active: tab.key === modelValue }]"
            @click="emit('update:modelValue', tab.key)"
        >
            <span class="inner">
                <span
                    class="text"
                    :data-label="tab.label"
                    ><span class="real">{{ tab.label }}</span></span
                >
                <span
                    v-if="tab.count !== undefined"
                    class="count"
                    >({{ tab.count }})</span
                >
            </span>
        </button>
        <slot name="after" />
    </div>
</template>

<script setup lang="ts">
/** TabGroup / Tab (commonComponents): underline on the active tab, label weight change without layout shift. */
defineProps<{ tabs: { key: string; label: string; count?: number }[]; modelValue: string }>();
const emit = defineEmits<{ 'update:modelValue': [string] }>();
</script>

<style scoped>
.lf-tabs {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
    overflow-x: auto;
    border-bottom: 1px solid var(--gray-150);
    background: var(--white);
}
.tab {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    min-width: 5rem;
    padding: var(--sp-xs) var(--sp-md);
    background: var(--white);
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
}
.tab.active {
    border-bottom-color: var(--blue-400);
}
.inner {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-xxs);
    padding: var(--sp-xs) var(--sp-md);
    border-radius: var(--radius-xs);
    font-size: 0.75rem;
    line-height: 1rem;
    color: var(--gray-600);
    transition: background 0.1s;
}
.tab:hover .inner {
    background: var(--gray-50);
}
.tab.active .inner {
    color: var(--gray-800);
}
.text {
    position: relative;
}
.text::before {
    content: attr(data-label);
    position: absolute;
    font-weight: 400;
}
.tab.active .text::before {
    font-weight: 600;
}
.real {
    color: transparent;
    font-weight: 600;
}
.count {
    color: var(--gray-600);
}
</style>
