/**
 * Drag and drop between tile grids: dragging a tile from the tile library onto a section, and
 * moving a tile from one section to another. Grids register themselves; the controller follows the
 * pointer, tells grids which one is under it, and calls the target's drop and the source's
 * move-out handlers on release.
 */
import { reactive } from 'vue';
import type { TileLayoutItem } from './types.ts';

export type DragPayload =
    | { kind: 'new'; key: string; name: string; w: number; h: number }
    | { kind: 'move'; fromGrid: string; item: TileLayoutItem; name: string };

export interface GridTarget {
    el: () => HTMLElement | undefined;
    /** Drop the payload at the pointer; return false to refuse it. */
    drop: (payload: DragPayload, clientX: number, clientY: number) => boolean;
    /** The tile `itemId` was dropped on another grid: remove it here. */
    moveOut: (itemId: string) => void;
    /** Whether this grid accepts the payload (e.g. tile allowed on the page). */
    accepts?: (payload: DragPayload) => boolean;
}

export const dnd = reactive({
    payload: undefined as DragPayload | undefined,
    x: 0,
    y: 0,
    overGrid: '',
});

const grids = new Map<string, GridTarget>();
let seq = 0;

export function registerGrid(target: GridTarget): string {
    const id = `grid-${++seq}`;
    grids.set(id, target);
    return id;
}
export function unregisterGrid(id: string): void {
    grids.delete(id);
}

/** The registered grid under a screen point ('' when none). */
export function gridAt(x: number, y: number): string {
    for (const [id, g] of grids) {
        const el = g.el();
        if (!el || !el.offsetParent) continue;
        const r = el.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
            const p = dnd.payload;
            if (p && g.accepts && !g.accepts(p)) return '';
            return id;
        }
    }
    return '';
}

let scrollTimer: ReturnType<typeof setInterval> | undefined;
function autoScroll(): void {
    const edge = 70;
    const h = window.innerHeight;
    const scroller = document.scrollingElement ?? document.documentElement;
    let dy = 0;
    if (dnd.y < 140) dy = -Math.ceil((140 - dnd.y) / 5);
    else if (dnd.y > h - edge) dy = Math.ceil((dnd.y - (h - edge)) / 4);
    if (dy) {
        // the app scrolls inside its main column when it has one
        const main = document.querySelector<HTMLElement>('.shell > .main') ?? scroller;
        main.scrollTop += dy;
        dnd.overGrid = gridAt(dnd.x, dnd.y);
    }
}

function onMove(e: PointerEvent): void {
    dnd.x = e.clientX;
    dnd.y = e.clientY;
    dnd.overGrid = gridAt(e.clientX, e.clientY);
}
function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') finish(false);
}
function onUp(e: PointerEvent): void {
    dnd.x = e.clientX;
    dnd.y = e.clientY;
    dnd.overGrid = gridAt(e.clientX, e.clientY);
    finish(true);
}
function finish(drop: boolean): void {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('keydown', onKey);
    clearInterval(scrollTimer);
    document.body.classList.remove('lf-dragging');
    const p = dnd.payload;
    const target = dnd.overGrid ? grids.get(dnd.overGrid) : undefined;
    const targetId = dnd.overGrid;
    const x = dnd.x;
    const y = dnd.y;
    dnd.payload = undefined;
    dnd.overGrid = '';
    if (!drop || !p || !target) return;
    const ok = target.drop(p, x, y);
    if (ok && p.kind === 'move' && p.fromGrid !== targetId) grids.get(p.fromGrid)?.moveOut(p.item.i);
}

/** Start a drag that can land on any registered grid. */
export function beginDrag(payload: DragPayload, e: { clientX: number; clientY: number }): void {
    dnd.payload = payload;
    dnd.x = e.clientX;
    dnd.y = e.clientY;
    dnd.overGrid = gridAt(e.clientX, e.clientY);
    document.body.classList.add('lf-dragging');
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey);
    clearInterval(scrollTimer);
    scrollTimer = setInterval(autoScroll, 16);
}
