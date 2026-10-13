<template>
    <aside
        class="library"
        aria-label="Tile library"
    >
        <div class="lib-head">
            <h3>Tile library</h3>
            <p class="lib-sub">Drag a tile onto any section. Drag tiles on the page to move them, also into another section. Drag any section, Details included, by its header to reorder.</p>
            <label class="lib-search">
                <LfIcon
                    name="SearchIcon"
                    class="lib-search-icon"
                />
                <input
                    v-model="query"
                    type="search"
                    placeholder="Search tiles"
                    aria-label="Search tiles"
                />
            </label>
            <div class="lib-filter">
                <button
                    v-for="f in FILTERS"
                    :key="f.key"
                    type="button"
                    :class="['chip', { active: filter === f.key }]"
                    @click="filter = f.key"
                >
                    {{ f.label }}
                </button>
            </div>
        </div>
        <ul class="lib-list lf-scroll">
            <li
                v-for="t in shown"
                :key="t.key"
                :class="['lib-tile', { used: (used.get(t.key) ?? 0) > 0 }]"
                :data-tile="t.key"
                title="Drag onto a section"
                @pointerdown="(e) => start(e, t)"
            >
                <LfIcon
                    name="dnd-drag-handle-icon"
                    class="lib-grip"
                />
                <div class="lib-text">
                    <span class="lib-name">{{ t.name }}</span>
                    <span class="lib-meta">
                        {{ sizeOf(t).w }} x {{ sizeOf(t).h }}
                        <template v-if="(used.get(t.key) ?? 0) > 0"> · on page{{ (used.get(t.key) ?? 0) > 1 ? ` (${used.get(t.key)})` : '' }}</template>
                    </span>
                </div>
                <button
                    type="button"
                    class="lib-add"
                    :aria-label="`Add ${t.name} to ${targetName}`"
                    :title="`Add to ${targetName}`"
                    @pointerdown.stop
                    @click="emit('add', t.key)"
                >
                    <LfIcon name="PlusIcon" />
                </button>
            </li>
            <li
                v-if="!shown.length"
                class="lib-empty"
            >
                No tiles match "{{ query }}"
            </li>
        </ul>
    </aside>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import LfIcon from '../ui/LfIcon.vue';
import { beginDrag } from '../../lib/dnd.ts';
import type { LayoutSection, PageKey, TileDefinition } from '../../lib/types.ts';

/** Tiles allowed on the page; drag one onto a section (or press + to add it to the first section). */
const props = defineProps<{ tiles: TileDefinition[]; sizes: Record<string, { w: number; h: number }>; page: PageKey; sections: LayoutSection[] }>();
const emit = defineEmits<{ add: [string] }>();

const FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'unused', label: 'Not on page' },
    { key: 'used', label: 'On page' },
] as const;
const query = ref('');
const filter = ref<(typeof FILTERS)[number]['key']>('all');

const used = computed(() => {
    const m = new Map<string, number>();
    for (const s of props.sections) for (const l of s.layout) m.set(l.componentKey, (m.get(l.componentKey) ?? 0) + 1);
    return m;
});
const targetName = computed(() => props.sections.find((s) => s.kind !== 'details')?.sectionName ?? 'a new section');
const sizeOf = (t: TileDefinition) => props.sizes[t.size] ?? { w: 12, h: 4 };
const shown = computed(() => {
    const q = query.value.trim().toLowerCase();
    return props.tiles
        .filter((t) => t.pages.includes(props.page))
        .filter((t) => !q || t.name.toLowerCase().includes(q) || t.key.toLowerCase().includes(q))
        .filter((t) => filter.value === 'all' || (filter.value === 'used') === (used.value.get(t.key) ?? 0) > 0)
        .sort((a, b) => a.name.localeCompare(b.name));
});

function start(e: PointerEvent, t: TileDefinition): void {
    if (e.button !== 0) return;
    e.preventDefault();
    const s = sizeOf(t);
    beginDrag({ kind: 'new', key: t.key, name: t.name, w: s.w, h: s.h }, e);
}
</script>

<style scoped>
.library {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 20;
    display: flex;
    flex-direction: column;
    width: 18rem;
    background: var(--white);
    border-left: 1px solid var(--gray-150);
    box-shadow: var(--shadow-gray-s);
}
.lib-head {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    padding: 1.25rem 1rem 0.75rem;
    border-bottom: 1px solid var(--gray-150);
}
.lib-head h3 {
    font-size: 1rem;
    font-weight: 600;
    color: var(--gray-800);
}
.lib-sub {
    font-size: 0.75rem;
    line-height: 1.1rem;
    color: var(--gray-600);
}
.lib-search {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    height: 2.25rem;
    padding: 0 0.625rem;
    border-radius: var(--radius-xs);
    box-shadow: inset 0 0 0 1px var(--gray-200);
}
.lib-search:focus-within {
    box-shadow: inset 0 0 0 1px var(--blue-400);
}
.lib-search-icon {
    color: var(--gray-500);
}
.lib-search input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: none;
    font: inherit;
    font-size: 0.875rem;
    background: transparent;
}
.lib-filter {
    display: flex;
    gap: 0.375rem;
}
.chip {
    padding: 0.25rem 0.625rem;
    border-radius: 1rem;
    font-size: 0.75rem;
    color: var(--gray-600);
    background: var(--gray-100);
}
.chip.active {
    color: var(--white);
    background: var(--blue-400);
}
.lib-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    margin: 0;
    padding: 0.75rem;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}
.lib-tile {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 0.5rem 0.625rem 0.625rem;
    border-radius: var(--radius-xs);
    background: var(--white);
    box-shadow: inset 0 0 0 1px var(--gray-200);
    cursor: grab;
    user-select: none;
    touch-action: none;
    transition:
        box-shadow 0.15s,
        background 0.15s;
}
.lib-tile:hover {
    background: var(--blue-50, #f3f7ff);
    box-shadow: inset 0 0 0 1px var(--blue-300);
}
.lib-grip {
    flex-shrink: 0;
    color: var(--gray-400);
}
.lib-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
}
.lib-name {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--gray-800);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.lib-meta {
    font-size: 0.6875rem;
    color: var(--gray-500);
}
.lib-tile.used .lib-meta {
    color: var(--green-600, #2e7d32);
}
.lib-add {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    flex-shrink: 0;
    border-radius: var(--radius-xxs);
    color: var(--blue-400);
}
.lib-add:hover {
    background: var(--blue-100);
}
.lib-empty {
    padding: 1rem;
    font-size: 0.875rem;
    color: var(--gray-500);
    text-align: center;
}
</style>
