<template>
    <div
        v-if="total > 0"
        class="lf-pagination"
        role="navigation"
    >
        <div class="pages">
            <button
                type="button"
                class="nav"
                :disabled="page === 0"
                aria-label="previous page"
                @click="go(page - 1)"
            >
                <LfIcon name="ChevronLeftIcon" />
            </button>
            <ul>
                <template
                    v-for="item in items"
                    :key="item.key"
                >
                    <li
                        v-if="item.type === 'page'"
                        :class="['item', { active: item.index === page }]"
                        :aria-current="item.index === page"
                        @click="go(item.index)"
                    >
                        {{ item.index + 1 }}
                    </li>
                    <li
                        v-else
                        class="item ellipsis-item"
                        @click="go(item.index)"
                    >
                        ...
                    </li>
                </template>
            </ul>
            <button
                type="button"
                class="nav"
                :disabled="page >= pageCount - 1"
                aria-label="next page"
                @click="go(page + 1)"
            >
                <LfIcon name="ChevronRightIcon" />
            </button>
        </div>
        <span class="label">Show</span>
        <LfSelect
            class="size-select"
            size="small"
            :model-value="String(pageSize)"
            :options="sizes.map((s) => ({ value: String(s), label: String(s) }))"
            menu-min-width="5rem"
            @update:model-value="(v) => emit('update:pageSize', Number(v))"
        />
        <span class="label">of {{ pageCount }}</span>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import LfIcon from './LfIcon.vue';
import LfSelect from './LfSelect.vue';

/** Pagination (DataTable/Pagnination): < 1 2 3 4 5 > Show [10] of N. */
const props = withDefaults(defineProps<{ page: number; pageSize: number; total: number; sizes?: number[] }>(), { sizes: () => [5, 10, 15, 25, 50] });
const emit = defineEmits<{ 'update:page': [number]; 'update:pageSize': [number] }>();

const pageCount = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)));
const go = (i: number) => {
    if (i >= 0 && i < pageCount.value) emit('update:page', i);
};

/** A window of up to five pages around the current one (as the portal shows: < 1 2 3 4 5 > ... of 45). */
const items = computed(() => {
    const n = pageCount.value;
    const start = Math.max(0, Math.min(props.page - 2, n - 5));
    const end = Math.min(n - 1, start + 4);
    const out: { type: 'page' | 'gap'; index: number; key: string }[] = [];
    for (let i = start; i <= end; i++) out.push({ type: 'page', index: i, key: `p${i}` });
    return out;
});
</script>

<style scoped>
.lf-pagination {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--sp-xs);
    height: 2.5rem;
    margin-top: 1rem;
    padding: 0 2rem;
}
.pages {
    display: flex;
    align-items: center;
}
ul {
    display: flex;
    margin: 0;
    padding: 0;
    list-style: none;
}
.nav {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    color: var(--gray-600);
    border-radius: 0.25rem;
}
.nav:disabled {
    color: var(--gray-200);
    cursor: default;
}
.nav:not(:disabled):hover {
    background: var(--gray-100);
}
.item {
    display: inline-block;
    min-width: 1.5rem;
    height: 1.5rem;
    line-height: 1.5rem;
    text-align: center;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    color: #4f525f;
    cursor: pointer;
    user-select: none;
}
.item:not(:last-child) {
    margin-right: 0.5rem;
}
.item.active {
    padding: 0 0.5rem;
    background: #e5e9f1;
    color: #1d1e23;
    font-weight: 600;
}
.item:not(.active):hover {
    background: #f7f8fa;
}
.label {
    font-size: 0.875rem;
    color: var(--gray-600);
}
.size-select {
    width: 4.25rem;
}
</style>
