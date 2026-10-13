/**
 * 12-column tile grid used by the overview pages, with the behaviour of vue-grid-layout that the
 * original LayoutSection relies on: drag, resize, collision push-down and vertical compaction.
 */
import type { TileLayoutItem } from './types.ts';

export const COLS = 12;
export const ROW_HEIGHT = 120;
export const MARGIN = 20;

const collides = (a: TileLayoutItem, b: TileLayoutItem): boolean =>
    a.i !== b.i && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

const sortByRow = (items: TileLayoutItem[]): TileLayoutItem[] => [...items].sort((a, b) => a.y - b.y || a.x - b.x);

/** Move every item up as far as it goes without overlapping the ones above it. */
export function compact(layout: TileLayoutItem[]): TileLayoutItem[] {
    const placed: TileLayoutItem[] = [];
    for (const it of sortByRow(layout)) {
        const item = { ...it };
        item.y = Math.max(0, item.y);
        while (item.y > 0 && !placed.some((p) => collides({ ...item, y: item.y - 1 }, p))) item.y -= 1;
        while (placed.some((p) => collides(item, p))) item.y += 1;
        placed.push(item);
    }
    // keep the caller's order so v-for keys stay stable
    return layout.map((l) => placed.find((p) => p.i === l.i)!);
}

/** Put `id` at (x, y), push anything it lands on downwards, then compact. */
export function moveItem(layout: TileLayoutItem[], id: string, x: number, y: number, w?: number, h?: number): TileLayoutItem[] {
    let items = layout.map((l) => ({ ...l }));
    const moving = items.find((l) => l.i === id);
    if (!moving) return layout;
    moving.w = Math.max(1, Math.min(COLS, w ?? moving.w));
    moving.h = Math.max(1, h ?? moving.h);
    moving.x = Math.max(0, Math.min(COLS - moving.w, x));
    moving.y = Math.max(0, y);
    const pushDown = (item: TileLayoutItem, seen: Set<string>) => {
        for (const other of sortByRow(items)) {
            if (seen.has(other.i) || !collides(item, other)) continue;
            other.y = item.y + item.h;
            seen.add(other.i);
            pushDown(other, seen);
        }
    };
    pushDown(moving, new Set([moving.i]));
    items = compactExcept(items, moving.i);
    return items;
}

/** Compact everything but keep the item being dragged where the pointer put it. */
function compactExcept(layout: TileLayoutItem[], fixedId: string): TileLayoutItem[] {
    const fixed = layout.find((l) => l.i === fixedId)!;
    const placed: TileLayoutItem[] = [fixed];
    for (const it of sortByRow(layout)) {
        if (it.i === fixedId) continue;
        const item = { ...it };
        while (item.y > 0 && !placed.some((p) => collides({ ...item, y: item.y - 1 }, p))) item.y -= 1;
        while (placed.some((p) => collides(item, p))) item.y += 1;
        placed.push(item);
    }
    return layout.map((l) => placed.find((p) => p.i === l.i)!);
}

/** First free spot for a new tile: below everything else, at the left. */
export function placeNew(layout: TileLayoutItem[], w: number, h: number): { x: number; y: number } {
    const bottom = layout.reduce((m, l) => Math.max(m, l.y + l.h), 0);
    // try to fit on the last row first
    for (let y = 0; y <= bottom; y++) {
        for (let x = 0; x + w <= COLS; x++) {
            const probe = { i: '__new', x, y, w, h, componentKey: '' };
            if (!layout.some((l) => collides(probe, l))) return { x, y };
        }
    }
    return { x: 0, y: bottom };
}

export const gridHeight = (layout: TileLayoutItem[]): number => {
    const rows = layout.reduce((m, l) => Math.max(m, l.y + l.h), 0);
    return rows === 0 ? 0 : rows * (ROW_HEIGHT + MARGIN) + MARGIN;
};
