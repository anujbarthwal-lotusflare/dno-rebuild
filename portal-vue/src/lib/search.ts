/**
 * Table search used by every tile, as the product guide describes it:
 *  - fuzzy: a small typo or a partial word still matches; closest matches come first
 *  - searches the whole underlying record, not only the displayed columns
 *  - `field:value` narrows to one field (no space after the colon), quotes allow spaces:
 *    "field name":"value with spaces"; several conditions separated by spaces must all match
 */

export interface ParsedQuery {
    fields: { field: string; value: string }[];
    terms: string[];
}

export function parseQuery(query: string): ParsedQuery {
    const fields: ParsedQuery['fields'] = [];
    const terms: string[] = [];
    const re = /(?:"([^"]+)"|([^\s:"]+)):(?:"([^"]*)"|(\S+))|"([^"]+)"|(\S+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(query))) {
        if (m[1] !== undefined || m[2] !== undefined) fields.push({ field: (m[1] ?? m[2])!, value: (m[3] ?? m[4] ?? '').toLowerCase() });
        else terms.push((m[5] ?? m[6])!.toLowerCase());
    }
    return { fields, terms };
}

/** Every primitive value in a record, nested values included. */
function flatten(value: unknown, out: string[] = []): string[] {
    if (value === null || value === undefined) return out;
    if (typeof value === 'object') {
        for (const v of Array.isArray(value) ? value : Object.values(value as object)) flatten(v, out);
    } else out.push(String(value).toLowerCase());
    return out;
}

function fieldValue(row: Record<string, unknown>, field: string): unknown {
    if (field in row) return row[field];
    const lower = field.toLowerCase();
    const key = Object.keys(row).find((k) => k.toLowerCase() === lower);
    if (key) return row[key];
    // dotted path: amount.value
    return field.split('.').reduce<unknown>((acc, part) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined), row);
}

/** Levenshtein distance capped at `max` (returns max+1 when above). */
function distance(a: string, b: string, max: number): number {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const cur = [i];
        let best = i;
        for (let j = 1; j <= b.length; j++) {
            cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
            best = Math.min(best, cur[j]!);
        }
        if (best > max) return max + 1;
        prev = cur;
    }
    return prev[b.length]!;
}

/** Score of one term against the record's values: 0 is an exact substring, higher is worse; undefined = no match. */
function termScore(term: string, values: string[]): number | undefined {
    let best: number | undefined;
    const allowed = term.length <= 3 ? 0 : term.length <= 6 ? 1 : 2;
    for (const v of values) {
        if (v.includes(term)) return v.startsWith(term) ? 0 : 0.5;
        if (allowed === 0) continue;
        for (const word of v.split(/[\s/._@-]+/)) {
            if (!word) continue;
            const slice = word.length > term.length ? word.slice(0, term.length) : word;
            const d = Math.min(distance(term, word, allowed), distance(term, slice, allowed));
            if (d <= allowed && (best === undefined || d < best)) best = d;
        }
    }
    return best;
}

export function searchRows<T extends Record<string, unknown>>(rows: T[], query: string): T[] {
    const q = query.trim();
    if (!q) return rows;
    const { fields, terms } = parseQuery(q);
    const scored: { row: T; score: number; i: number }[] = [];
    rows.forEach((row, i) => {
        for (const f of fields) {
            const v = flatten(fieldValue(row, f.field));
            if (!v.some((x) => x.includes(f.value))) return;
        }
        let score = 0;
        if (terms.length) {
            const values = flatten(row);
            for (const t of terms) {
                const s = termScore(t, values);
                if (s === undefined) return;
                score += s;
            }
        }
        scored.push({ row, score, i });
    });
    return scored.sort((a, b) => a.score - b.score || a.i - b.i).map((s) => s.row);
}

export type FilterOperator = 'contains' | 'equals' | 'notEquals' | 'startsWith' | 'isEmpty' | 'isNotEmpty';
export interface FilterItem {
    column: string;
    operator: FilterOperator;
    value: string;
}
export const FILTER_OPERATORS: { value: FilterOperator; label: string }[] = [
    { value: 'contains', label: 'Contains' },
    { value: 'equals', label: 'Is' },
    { value: 'notEquals', label: 'Is not' },
    { value: 'startsWith', label: 'Starts with' },
    { value: 'isEmpty', label: 'Is empty' },
    { value: 'isNotEmpty', label: 'Is not empty' },
];

export function applyFilters<T extends Record<string, unknown>>(rows: T[], filters: FilterItem[], display: (row: T, column: string) => string): T[] {
    if (!filters.length) return rows;
    return rows.filter((row) =>
        filters.every((f) => {
            const v = display(row, f.column).toLowerCase();
            const x = f.value.toLowerCase();
            switch (f.operator) {
                case 'contains':
                    return v.includes(x);
                case 'equals':
                    return v === x;
                case 'notEquals':
                    return v !== x;
                case 'startsWith':
                    return v.startsWith(x);
                case 'isEmpty':
                    return v === '';
                case 'isNotEmpty':
                    return v !== '';
            }
        }),
    );
}
