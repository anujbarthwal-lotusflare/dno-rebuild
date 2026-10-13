<template>
    <div class="tile-wrapper">
        <div
            v-if="def"
            class="layout-tile"
        >
            <div class="title-row">
                <template v-if="editing && renaming">
                    <input
                        ref="renameRef"
                        v-model="draftTitle"
                        class="rename no-drag"
                        maxlength="60"
                        :placeholder="def.name"
                        aria-label="Tile title"
                        @keydown.enter.prevent="finishRename"
                        @keydown.esc.prevent="renaming = false"
                        @blur="finishRename"
                    />
                </template>
                <h3
                    v-else
                    class="tile-title"
                    :title="editing ? 'Drag to move' : undefined"
                >
                    {{ title || def.name }}
                </h3>
                <div
                    v-if="editing"
                    class="edit-tools no-drag"
                >
                    <button
                        type="button"
                        class="icon-btn"
                        aria-label="Rename tile"
                        title="Rename tile"
                        @click="startRename"
                    >
                        <LfIcon name="EditIcon" />
                    </button>
                    <LfDropdownMenu :items="sizeItems">
                        <template #trigger>
                            <button
                                type="button"
                                class="icon-btn"
                                :aria-label="`Tile size ${w} x ${h}`"
                                :title="`Size ${w} x ${h}`"
                            >
                                <LfIcon name="ExpandIcon" />
                            </button>
                        </template>
                    </LfDropdownMenu>
                    <button
                        type="button"
                        class="icon-btn"
                        aria-label="Delete"
                        title="Delete"
                        @click="emit('remove')"
                    >
                        <LfIcon name="delete-new" />
                    </button>
                </div>
                <button
                    v-else
                    type="button"
                    class="icon-btn"
                    aria-label="Refresh"
                    title="Refresh"
                    @click="version++"
                >
                    <LfIcon name="RefreshIcon" />
                </button>
            </div>
            <div class="tile-content lf-scroll">
                <component
                    :is="component"
                    v-if="component"
                    :key="version"
                    :tile="def"
                    :entity-type="entityType"
                    :entity-id="entityId"
                />
            </div>
        </div>
        <div
            v-else
            class="unavailable"
        >
            <h3>Unknown tile "{{ componentKey }}"</h3>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import LfIcon from '../ui/LfIcon.vue';
import LfDropdownMenu from '../ui/LfDropdownMenu.vue';
import type { RowAction } from '../../lib/types.ts';
import { TILE_COMPONENTS } from '../../tiles/registry.ts';
import type { EntityType, TileDefinition } from '../../lib/types.ts';

/** AbstractTileWrapper: white tile, title with refresh (or delete in edit mode), scrolling content. */
const props = defineProps<{
    componentKey: string;
    catalog: Map<string, TileDefinition>;
    entityType: EntityType;
    entityId: string;
    editing: boolean;
    title?: string;
    w?: number;
    h?: number;
}>();
const emit = defineEmits<{ remove: []; rename: [string]; resize: [{ w: number; h: number }] }>();

// edit mode: rename and size presets
const renaming = ref(false);
const draftTitle = ref('');
const renameRef = ref<HTMLInputElement>();
async function startRename(): Promise<void> {
    draftTitle.value = props.title ?? '';
    renaming.value = true;
    await nextTick();
    renameRef.value?.focus();
    renameRef.value?.select();
}
function finishRename(): void {
    if (!renaming.value) return;
    renaming.value = false;
    const t = draftTitle.value.trim();
    if (t !== (props.title ?? '')) emit('rename', t);
}
const PRESETS: { label: string; w: number; h: number }[] = [
    { label: 'Small (3 x 4)', w: 3, h: 4 },
    { label: 'Third (4 x 2)', w: 4, h: 2 },
    { label: 'Vertical (4 x 6)', w: 4, h: 6 },
    { label: 'Medium (6 x 4)', w: 6, h: 4 },
    { label: 'Wide (12 x 3)', w: 12, h: 3 },
    { label: 'Large (12 x 4)', w: 12, h: 4 },
    { label: 'Extra large (12 x 6)', w: 12, h: 6 },
];
const sizeItems = computed<RowAction[]>(() =>
    PRESETS.map((p) => ({
        label: `${p.w === props.w && p.h === props.h ? '✓ ' : ''}${p.label}`,
        onClick: () => {
            if (p.w !== props.w || p.h !== props.h) emit('resize', { w: p.w, h: p.h });
        },
    })),
);
const version = ref(0);
const def = computed(() => props.catalog.get(props.componentKey));
const component = computed(() => (def.value ? TILE_COMPONENTS[def.value.kind] : undefined));
</script>

<style scoped>
.tile-wrapper {
    width: 100%;
    height: 100%;
    background: var(--white);
}
.layout-tile {
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    height: 100%;
    padding: var(--sp-md);
    border-radius: 0.25rem;
    background: var(--white);
}
.title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 2rem;
    margin-bottom: 0.5rem;
    flex-shrink: 0;
}
.tile-title {
    font-size: 1rem;
    line-height: 1.5rem;
    font-weight: 600;
    color: var(--gray-800);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.edit-tools {
    display: flex;
    align-items: center;
    gap: var(--sp-xs);
    cursor: default;
}
.rename {
    flex: 1;
    min-width: 0;
    margin-right: var(--sp-xs);
    height: 1.75rem;
    padding: 0 var(--sp-xs);
    border: 0;
    border-radius: var(--radius-xxs);
    box-shadow: inset 0 0 0 1px var(--blue-400);
    font: inherit;
    font-size: 1rem;
    font-weight: 600;
    outline: none;
}
.icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    flex-shrink: 0;
    border-radius: var(--radius-xxs);
    color: var(--blue-300);
}
.icon-btn:hover {
    background: var(--gray-100);
    color: var(--blue-400);
}
.tile-content {
    flex: 1;
    min-height: 0;
    width: 100%;
    padding-right: 0.5rem;
    overflow-y: auto;
    overflow-x: hidden;
}
.unavailable {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    background: rgba(155, 163, 180, 0.3);
    text-align: center;
}
</style>
