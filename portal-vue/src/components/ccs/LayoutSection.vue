<template>
    <section :class="['section', editing ? 'edit-border' : 'solid-border', dropMark ? `drop-${dropMark}` : '', { 'is-dragged': dragged }]">
        <div
            :class="['section-header', { draggable: editing }]"
            :title="editing ? 'Drag to move this section, click to collapse' : undefined"
            @click="collapsed = !collapsed"
            @pointerdown="onHeaderDown"
        >
            <span
                v-if="editing"
                class="section-handle"
                aria-label="Drag to reorder section"
            >
                <LfIcon name="dnd-drag-handle-icon" />
            </span>
            <h2 class="section-title">{{ section.sectionName }}</h2>
            <span
                v-if="editing"
                class="section-count"
                >{{ section.layout.length }} {{ section.layout.length === 1 ? 'tile' : 'tiles' }}</span
            >
            <LfIcon
                :name="collapsed ? 'ChevronDownIcon' : 'ChevronUpIcon'"
                class="chev"
            />
        </div>
        <div
            v-show="!collapsed && !outline"
            class="section-content"
        >
            <div
                v-if="editing"
                class="edit-controls"
            >
                <div class="edit-col">
                    <div class="edit-row">
                        <LfInput
                            :model-value="section.sectionName"
                            label="Section name"
                            size="large"
                            class="section-input"
                            @update:model-value="(v) => patch({ sectionName: v })"
                        />
                        <LfCheckbox
                            class="section-btn top-gap"
                            :model-value="section.isInitiallyCollapsed"
                            label="Initially Collapsed"
                            @update:model-value="(v) => patch({ isInitiallyCollapsed: v })"
                        />
                        <LfButton
                            v-if="canMoveUp"
                            variant="secondary"
                            icon="ChevronUpIcon"
                            label="Move section"
                            class="section-btn top-gap"
                            @click="emit('move', -1)"
                        />
                        <LfButton
                            v-if="canMoveDown"
                            variant="secondary"
                            icon="ChevronDownIcon"
                            label="Move section"
                            class="section-btn top-gap"
                            @click="emit('move', 1)"
                        />
                    </div>
                    <div class="edit-row">
                        <LfSelect
                            v-model="tileType"
                            label="Tile type"
                            size="large"
                            filterable
                            class="section-input"
                            :options="tileOptions"
                        />
                        <LfButton
                            icon="PlusIcon"
                            label="Add tile"
                            class="top-gap"
                            :disabled="!tileType"
                            @click="addTile"
                        />
                    </div>
                </div>
                <LfButton
                    variant="secondary"
                    icon="delete-new"
                    label="Remove section"
                    icon-class="red"
                    label-class="red"
                    class="top-gap"
                    @click="emit('remove')"
                />
            </div>
            <GridLayout
                :layout="section.layout"
                :editable="editing"
                :accepts="accepts"
                :label="(it) => it.title || catalog.get(it.componentKey)?.name || it.componentKey"
                @update:layout="(l) => patch({ layout: l })"
            >
                <template #item="{ item }">
                    <TileWrapper
                        :component-key="item.componentKey"
                        :catalog="catalog"
                        :entity-type="entityType"
                        :entity-id="entityId"
                        :editing="editing"
                        :title="item.title"
                        :w="item.w"
                        :h="item.h"
                        @remove="removeTile(item.i)"
                        @rename="(t) => renameTile(item.i, t)"
                        @resize="(sz) => resizeTile(item.i, sz)"
                    />
                </template>
            </GridLayout>
            <LfEmptyState
                v-if="!section.layout.length && !editing"
                description="This section has no tiles"
            />
        </div>
    </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import GridLayout from './GridLayout.vue';
import TileWrapper from './TileWrapper.vue';
import LfButton from '../ui/LfButton.vue';
import LfCheckbox from '../ui/LfCheckbox.vue';
import LfEmptyState from '../ui/LfEmptyState.vue';
import LfIcon from '../ui/LfIcon.vue';
import LfInput from '../ui/LfInput.vue';
import LfSelect from '../ui/LfSelect.vue';
import { compact, moveItem, placeNew } from '../../lib/grid.ts';
import type { DragPayload } from '../../lib/dnd.ts';
import type { EntityType, LayoutSection, PageKey, SelectOption, TileDefinition } from '../../lib/types.ts';

/** LayoutSection: collapsible section of tiles; in edit mode name, collapse flag, move, add tile, remove. */
const props = defineProps<{
    section: LayoutSection;
    page: PageKey;
    catalog: Map<string, TileDefinition>;
    sizes: Record<string, { w: number; h: number }>;
    entityType: EntityType;
    entityId: string;
    editing: boolean;
    canMoveUp: boolean;
    canMoveDown: boolean;
    dropMark?: 'before' | 'after' | '';
    dragged?: boolean;
    /** While a section is dragged every section shows only its header. */
    outline?: boolean;
}>();
function onHeaderDown(e: PointerEvent): void {
    if (!props.editing || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('input, textarea, select, a, [role="combobox"]')) return;
    emit('dragStart', e);
}
const emit = defineEmits<{ update: [LayoutSection]; remove: []; move: [number]; dragStart: [PointerEvent] }>();
const accepts = (p: DragPayload): boolean => p.kind === 'move' || !!props.catalog.get(p.key)?.pages.includes(props.page);

const collapsed = ref(props.section.isInitiallyCollapsed && !props.editing);
const tileType = ref<string | null>(null);

const tileOptions = computed<SelectOption[]>(() =>
    [...props.catalog.values()]
        .filter((t) => t.pages.includes(props.page))
        .map((t) => ({ value: t.key, label: t.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
);

function patch(p: Partial<LayoutSection>): void {
    emit('update', { ...props.section, ...p });
}
function addTile(): void {
    const def = tileType.value ? props.catalog.get(tileType.value) : undefined;
    if (!def) return;
    const size = props.sizes[def.size] ?? { w: 12, h: 4 };
    const pos = placeNew(props.section.layout, size.w, size.h);
    const i = `${def.key}-${Date.now().toString(36)}`;
    patch({ layout: [...props.section.layout, { i, x: pos.x, y: pos.y, w: size.w, h: size.h, componentKey: def.key }] });
    tileType.value = null;
}
function renameTile(i: string, title: string): void {
    patch({ layout: props.section.layout.map((l) => (l.i === i ? { ...l, title: title || undefined } : l)) });
}
function resizeTile(i: string, size: { w: number; h: number }): void {
    const item = props.section.layout.find((l) => l.i === i);
    if (!item) return;
    patch({ layout: compact(moveItem(props.section.layout, i, Math.min(item.x, 12 - size.w), item.y, size.w, size.h)) });
}
function removeTile(i: string): void {
    patch({ layout: compact(props.section.layout.filter((l) => l.i !== i)) });
}
</script>

<style scoped>
.section {
    background: var(--gray-100);
}
.solid-border {
    border-bottom: 0.25rem solid var(--blue-500);
}
.edit-border {
    border-bottom: 0.25rem dashed var(--blue-500);
}
.section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 1.5rem 1.5rem 0.5rem 1.5rem;
    cursor: pointer;
    user-select: none;
}
.section {
    position: relative;
}
.section.is-dragged {
    opacity: 0.45;
}
.section.drop-before::before,
.section.drop-after::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    height: 4px;
    border-radius: 2px;
    background: var(--blue-400);
    z-index: 5;
}
.section.drop-before::before {
    top: -0.625rem;
}
.section.drop-after::after {
    bottom: -0.625rem;
}
.section-header.draggable {
    cursor: grab;
}
.section-handle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    margin-right: -0.25rem;
    border-radius: var(--radius-xxs);
    color: var(--blue-300);
    cursor: grab;
    touch-action: none;
}
.section-handle:hover {
    background: var(--white);
}
.section-count {
    margin-right: auto;
    font-size: 0.75rem;
    color: var(--gray-500);
}
.section-title {
    font-size: 1.125rem;
    line-height: 1.75rem;
    font-weight: 400;
    color: var(--gray-800);
}
.chev {
    color: var(--blue-300);
    margin-right: 0.25rem;
}
.section-content {
    margin: 0 0.25rem;
    padding-bottom: 0.25rem;
}
.edit-controls {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 0 1.25rem 0.5rem;
}
.edit-col {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
}
.edit-row {
    display: flex;
    align-items: center;
}
.section-input {
    width: 20rem;
    margin-right: 1rem;
}
.section-btn {
    margin-right: 1rem;
}
.top-gap {
    margin-top: 1.5rem;
}
.edit-controls :deep(.red) {
    color: var(--red-400);
}
</style>
