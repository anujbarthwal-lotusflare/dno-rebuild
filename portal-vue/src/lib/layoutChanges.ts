import type { LayoutChangeSummary } from './types.ts';

/** Short labels for a change summary: "+2 added", "1 moved"... */
export function changeChips(s: LayoutChangeSummary | undefined): { label: string; tone: 'green' | 'red' | 'blue' | 'gray' }[] {
    if (!s) return [];
    const out: { label: string; tone: 'green' | 'red' | 'blue' | 'gray' }[] = [];
    const add = (n: number, label: string, tone: 'green' | 'red' | 'blue' | 'gray') => {
        if (n) out.push({ label: `${n} ${label}`, tone });
    };
    add(s.tilesAdded.length, s.tilesAdded.length === 1 ? 'tile added' : 'tiles added', 'green');
    add(s.tilesRemoved.length, s.tilesRemoved.length === 1 ? 'tile removed' : 'tiles removed', 'red');
    add(s.tilesMoved.length, 'moved', 'blue');
    add(s.tilesResized.length, 'resized', 'blue');
    add(s.tilesRenamed.length, 'renamed', 'blue');
    add(s.sectionsAdded.length, s.sectionsAdded.length === 1 ? 'section added' : 'sections added', 'green');
    add(s.sectionsRemoved.length, s.sectionsRemoved.length === 1 ? 'section removed' : 'sections removed', 'red');
    add(s.sectionsChanged.length, s.sectionsChanged.length === 1 ? 'section changed' : 'sections changed', 'gray');
    return out;
}

export const changeCount = (s: LayoutChangeSummary | undefined): number => (s ? Object.values(s).reduce((n, l) => n + l.length, 0) : 0);

/** Readable lines for the commit dialog. */
export function changeLines(s: LayoutChangeSummary | undefined): string[] {
    if (!s) return [];
    const lines: string[] = [];
    const list = (items: string[], verb: string) => {
        if (items.length) lines.push(`${verb}: ${items.join(', ')}`);
    };
    list(s.tilesAdded, 'Added');
    list(s.tilesRemoved, 'Removed');
    list(s.tilesMoved, 'Moved');
    list(s.tilesResized, 'Resized');
    list(s.tilesRenamed, 'Renamed');
    list(s.sectionsAdded, 'New sections');
    list(s.sectionsRemoved, 'Removed sections');
    list(s.sectionsChanged, 'Changed sections');
    return lines;
}
