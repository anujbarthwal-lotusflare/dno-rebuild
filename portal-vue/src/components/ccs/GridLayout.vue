<template>
    <div
        ref="rootRef"
        :class="['grid', { editing: editable }]"
        :style="{ height: `${height}px` }"
    >
        <div
            v-if="editable"
            class="grid-lines"
            :style="linesStyle"
        />
        <div
            v-if="drag"
            class="placeholder"
            :style="boxStyle(drag.preview)"
        />
        <div
            v-if="external"
            class="placeholder external"
            :style="boxStyle(external.preview)"
        >
            <span>{{ dnd.payload?.name }}</span>
        </div>
        <div
            v-if="editable && !shown.length && !external"
            class="drop-hint"
        >
            <LfIcon name="dnd-drag-handle-icon" />
            Drag tiles here from the tile library or from another section
        </div>
        <div
            v-for="item in shown"
            :key="item.i"
            :class="['grid-item', { dragging: drag?.id === item.i }]"
            :style="drag?.id === item.i ? drag.style : boxStyle(item)"
            @pointerdown="onPointerDown($event, item)"
        >
            <slot
                name="item"
                :item="item"
            />
            <span
                v-if="editable"
                class="resize"
                title="Resize"
                @pointerdown.stop="onResizeDown($event, item)"
            />
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import LfIcon from '../ui/LfIcon.vue';
import { beginDrag, dnd, gridAt, registerGrid, unregisterGrid } from '../../lib/dnd.ts';
import type { DragPayload } from '../../lib/dnd.ts';
import { COLS, MARGIN, ROW_HEIGHT, compact, gridHeight, moveItem } from '../../lib/grid.ts';
import type { TileLayoutItem } from '../../lib/types.ts';

/**
 * Absolute-positioned 12 x 120px grid (the original uses vue-grid-layout with the same metrics).
 * In edit mode tiles are dragged and resized inside the grid, dragged to other grids, and tiles
 * from the tile library can be dropped in.
 */
const props = defineProps<{ layout: TileLayoutItem[]; editable: boolean; accepts?: (p: DragPayload) => boolean; label?: (item: TileLayoutItem) => string }>();
const emit = defineEmits<{ 'update:layout': [TileLayoutItem[]] }>();

const rootRef = ref<HTMLElement>();
const width = ref(1200);
let observer: ResizeObserver | undefined;
onMounted(() => {
    if (!rootRef.value) return;
    width.value = rootRef.value.clientWidth;
    observer = new ResizeObserver(() => {
        if (rootRef.value) width.value = rootRef.value.clientWidth;
    });
    observer.observe(rootRef.value);
});
onBeforeUnmount(() => observer?.disconnect());

// drops from the tile library and from other sections
const gridId = registerGrid({
    el: () => (props.editable ? rootRef.value : undefined),
    accepts: (p) => props.accepts?.(p) ?? true,
    drop: (p, cx, cy) => {
        const placed = place(p, cx, cy);
        if (!placed) return false;
        emit('update:layout', compact(placed.layout));
        return true;
    },
    moveOut: (itemId) => emit('update:layout', compact(props.layout.filter((l) => l.i !== itemId))),
});
onBeforeUnmount(() => unregisterGrid(gridId));

/** Layout without the tile that is being carried away from this grid. */
const baseLayout = computed(() => {
    const p = dnd.payload;
    return p?.kind === 'move' && p.fromGrid === gridId ? props.layout.filter((l) => l.i !== p.item.i) : props.layout;
});
function place(p: DragPayload, cx: number, cy: number): { layout: TileLayoutItem[]; item: TileLayoutItem } | undefined {
    const el = rootRef.value;
    if (!el) return undefined;
    const r = el.getBoundingClientRect();
    const w = p.kind === 'new' ? p.w : p.item.w;
    const h = p.kind === 'new' ? p.h : p.item.h;
    const stepX = colWidth.value + MARGIN;
    const stepY = ROW_HEIGHT + MARGIN;
    const pxW = w * stepX - MARGIN;
    const x = Math.max(0, Math.min(COLS - w, Math.round((cx - r.left - MARGIN - pxW / 2) / stepX)));
    const y = Math.max(0, Math.round((cy - r.top - MARGIN - ROW_HEIGHT / 2) / stepY));
    const item: TileLayoutItem =
        p.kind === 'new' ? { i: `${p.key}-${Date.now().toString(36)}`, x, y, w, h, componentKey: p.key } : { ...p.item, x, y };
    const base = p.kind === 'move' ? props.layout.filter((l) => l.i !== p.item.i) : props.layout;
    const layout = moveItem([...base, item], item.i, x, y);
    return { layout, item: layout.find((l) => l.i === item.i)! };
}
const external = computed(() => {
    const p = dnd.payload;
    if (!p || !props.editable || dnd.overGrid !== gridId) return undefined;
    const placed = place(p, dnd.x, dnd.y);
    if (!placed) return undefined;
    return { preview: placed.item, working: placed.layout.filter((l) => l.i !== placed.item.i) };
});

const colWidth = computed(() => (width.value - MARGIN * (COLS + 1)) / COLS);
const boxStyle = (it: { x: number; y: number; w: number; h: number }) => ({
    left: `${MARGIN + it.x * (colWidth.value + MARGIN)}px`,
    top: `${MARGIN + it.y * (ROW_HEIGHT + MARGIN)}px`,
    width: `${it.w * colWidth.value + (it.w - 1) * MARGIN}px`,
    height: `${it.h * ROW_HEIGHT + (it.h - 1) * MARGIN}px`,
});

interface DragState {
    id: string;
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    startScroll: number;
    origin: TileLayoutItem;
    preview: TileLayoutItem;
    working: TileLayoutItem[];
    style: Record<string, string>;
}
const drag = ref<DragState>();

const shown = computed(() => (drag.value ? drag.value.working : external.value ? external.value.working : baseLayout.value));
const height = computed(() =>
    Math.max(gridHeight(external.value ? [...external.value.working, external.value.preview] : shown.value), props.editable ? ROW_HEIGHT * 2 + MARGIN * 3 : 0),
);
const linesStyle = computed(() => ({
    backgroundSize: `${colWidth.value + MARGIN}px ${ROW_HEIGHT + MARGIN}px`,
    backgroundPosition: `${MARGIN / 2}px ${MARGIN / 2}px`,
}));

const INTERACTIVE = 'button, a, input, textarea, select, label, [role="combobox"], .no-drag, .lf-table, .resize';

function onPointerDown(e: PointerEvent, item: TileLayoutItem): void {
    if (!props.editable || e.button !== 0) return;
    if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
    start(e, item, 'move');
}
function onResizeDown(e: PointerEvent, item: TileLayoutItem): void {
    if (!props.editable) return;
    start(e, item, 'resize');
}
function start(e: PointerEvent, item: TileLayoutItem, mode: 'move' | 'resize'): void {
    e.preventDefault();
    lastEvent = e;
    drag.value = { id: item.i, mode, startX: e.clientX, startY: e.clientY, startScroll: scroller()?.scrollTop ?? 0, origin: { ...item }, preview: { ...item }, working: props.layout.map((l) => ({ ...l })), style: boxStyle(item) };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    document.body.classList.add('lf-dragging');
    clearInterval(scrollTimer);
    scrollTimer = setInterval(edgeScroll, 16);
}
// scroll the page while a tile is held near the top or bottom edge
let lastEvent: PointerEvent | undefined;
let scrollTimer: ReturnType<typeof setInterval> | undefined;
const scroller = () => document.querySelector<HTMLElement>('.shell > .main');
function edgeScroll(): void {
    const el = scroller();
    if (!el || !lastEvent || !drag.value) return;
    const y = lastEvent.clientY;
    const h = window.innerHeight;
    const top = 140; // below the sticky page header
    let dy = 0;
    if (y < top) dy = -Math.ceil((top - y) / 5);
    else if (y > h - 70) dy = Math.ceil((y - (h - 70)) / 4);
    if (!dy) return;
    const before = el.scrollTop;
    el.scrollTop += dy;
    if (el.scrollTop !== before) onMove(lastEvent);
}
function onMove(e: PointerEvent): void {
    const d = drag.value;
    if (!d) return;
    lastEvent = e;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY + ((scroller()?.scrollTop ?? 0) - d.startScroll);
    const base = boxStyle(d.origin);
    const stepX = colWidth.value + MARGIN;
    const stepY = ROW_HEIGHT + MARGIN;
    if (d.mode === 'move') {
        // dragged over another section: carry the tile there
        const over = gridAt(e.clientX, e.clientY);
        if (over && over !== gridId) {
            clearInterval(scrollTimer);
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            drag.value = undefined;
            beginDrag({ kind: 'move', fromGrid: gridId, item: { ...d.origin }, name: props.label?.(d.origin) ?? d.origin.componentKey }, e);
            return;
        }
        d.style = { ...base, left: `${parseFloat(base.left) + dx}px`, top: `${parseFloat(base.top) + dy}px` };
        const x = Math.round(d.origin.x + dx / stepX);
        // never below the other tiles, so the section does not grow away from the pointer
        const floor = props.layout.filter((l) => l.i !== d.id).reduce((m, l) => Math.max(m, l.y + l.h), 0);
        const y = Math.min(floor, Math.round(d.origin.y + dy / stepY));
        d.working = moveItem(props.layout, d.id, x, y);
    } else {
        const w = Math.max(1, Math.min(COLS - d.origin.x, Math.round(d.origin.w + dx / stepX)));
        const h = Math.max(1, Math.round(d.origin.h + dy / stepY));
        d.style = { ...base, width: `${Math.max(colWidth.value, parseFloat(base.width) + dx)}px`, height: `${Math.max(ROW_HEIGHT, parseFloat(base.height) + dy)}px` };
        d.working = moveItem(props.layout, d.id, d.origin.x, d.origin.y, w, h);
    }
    d.preview = d.working.find((l) => l.i === d.id)!;
}
function onUp(): void {
    clearInterval(scrollTimer);
    window.removeEventListener('pointermove', onMove);
    document.body.classList.remove('lf-dragging');
    const d = drag.value;
    drag.value = undefined;
    if (!d) return;
    emit('update:layout', compact(d.working));
}
onBeforeUnmount(() => {
    clearInterval(scrollTimer);
    window.removeEventListener('pointermove', onMove);
});
</script>

<style scoped>
.grid {
    position: relative;
    width: 100%;
    transition: height 0.2s;
}
.grid-item {
    position: absolute;
    transition:
        left 0.2s,
        top 0.2s,
        width 0.2s,
        height 0.2s;
    box-sizing: border-box;
    touch-action: none;
}
.editing .grid-item {
    cursor: move;
}
.grid-item.dragging {
    z-index: 3;
    transition: none;
    opacity: 0.9;
    box-shadow: var(--shadow-gray-s);
}
.placeholder {
    position: absolute;
    z-index: 2;
    background: red;
    opacity: 0.2;
    border-radius: 0.25rem;
    transition: all 0.1s;
    pointer-events: none;
}
.placeholder.external {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--blue-100);
    opacity: 1;
    border: 2px dashed var(--blue-400);
    color: var(--blue-400);
    font-size: 0.875rem;
    font-weight: 600;
}
.drop-hint {
    position: absolute;
    inset: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    border: 2px dashed var(--gray-300);
    border-radius: 0.25rem;
    color: var(--gray-500);
    font-size: 0.875rem;
    pointer-events: none;
}
.grid-lines {
    position: absolute;
    inset: 0;
    background-image:
        linear-gradient(to right, var(--gray-200) 1px, transparent 1px),
        linear-gradient(to bottom, var(--gray-200) 1px, transparent 1px);
    pointer-events: none;
}
.resize {
    position: absolute;
    right: 2px;
    bottom: 2px;
    width: 14px;
    height: 14px;
    cursor: se-resize;
    z-index: 2;
}
.resize::after {
    content: '';
    position: absolute;
    right: 3px;
    bottom: 3px;
    width: 6px;
    height: 6px;
    border-right: 2px solid rgba(0, 0, 0, 0.4);
    border-bottom: 2px solid rgba(0, 0, 0, 0.4);
}
</style>
