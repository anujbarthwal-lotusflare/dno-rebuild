/** Tiny DOM toolkit and API client shared by all pages. No framework. */

type Child = Node | string | number | null | undefined | false | Child[];
type Props = Record<string, unknown>;

export function h(tag: string, props?: Props | null, ...children: Child[]): HTMLElement {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props ?? {})) {
        if (v === undefined || v === null || v === false) continue;
        if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
        else if (k === 'class') el.className = String(v);
        else if (k in el && k !== 'list' && k !== 'form') (el as unknown as Record<string, unknown>)[k] = v;
        else el.setAttribute(k, String(v));
    }
    append(el, children);
    return el;
}
function append(el: Node, children: Child[]): void {
    for (const c of children) {
        if (c === null || c === undefined || c === false) continue;
        if (Array.isArray(c)) append(el, c);
        else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
}

/* ---------- API ---------- */

export class ApiError extends Error {
    readonly code: string;
    constructor(code: string, message: string) {
        super(message);
        this.code = code;
    }
}

export async function api<T = any>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const res = await fetch('/api' + path, {
        method,
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 204) return undefined as T;
    const data = await res.json().catch(() => undefined);
    if (!res.ok) throw new ApiError(data?.code ?? String(res.status), data?.message ?? `Request failed (${res.status})`);
    return data as T;
}

/* ---------- feedback ---------- */

export function toast(message: string, error = false): void {
    const host = document.getElementById('toast')!;
    const p = h('p', { class: error ? 'error' : '' }, message);
    host.appendChild(p);
    setTimeout(() => p.remove(), error ? 7000 : 3500);
}

/** Run an action from a button: disable while running, toast the outcome, then refresh the page. */
export function act(label: string, run: () => Promise<unknown>, done?: string, cls = ''): HTMLButtonElement {
    const b = h('button', { type: 'button', class: cls }, label) as HTMLButtonElement;
    b.addEventListener('click', async () => {
        b.disabled = true;
        try {
            await run();
            if (done) toast(done);
            refresh();
        } catch (e) {
            toast((e as Error).message, true);
            b.disabled = false;
        }
    });
    return b;
}

export function refresh(): void {
    window.dispatchEvent(new Event('hashchange'));
}
export function go(hash: string): void {
    if (location.hash === hash) refresh();
    else location.hash = hash;
}

/* ---------- formatting ---------- */

export function money(m?: { unit?: string; value?: number } | null): string {
    if (!m || m.value === undefined || m.value === null) return '';
    return `${m.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${m.unit ?? ''}`.trim();
}
export function date(iso?: string): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}
export function dateTime(iso?: string): string {
    if (!iso) return '';
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
/** camelCase state names to words: "partiallySettled" -> "Partially settled". */
export function words(s?: string | null): string {
    if (!s) return '';
    const spaced = s.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
    return spaced[0]!.toUpperCase() + spaced.slice(1);
}

const GO = ['active', 'completed', 'settled', 'approved', 'validated', 'launched', 'matchedFully'];
const WAIT = ['created', 'pending', 'queued', 'inProgress', 'acknowledged', 'draft', 'inDraft', 'new', 'partiallySettled', 'reserved', 'initialized', 'graceWithSubscription', 'pendingActive', 'requested', 'matchedPartially', 'sent'];
const STOP = ['rejected', 'failed', 'overdue', 'suspended', 'terminated', 'closed', 'deceased', 'cancelled', 'declined', 'aborted', 'graceWithoutSubscription', 'terminating', 'pendingTerminate', 'retired', 'obsolete'];

export function tag(state?: string | null): HTMLElement {
    const s = state ?? '';
    const cls = GO.includes(s) ? 'go' : WAIT.includes(s) ? 'wait' : STOP.includes(s) ? 'stop' : '';
    return h('span', { class: `tag ${cls}` }, words(s) || 'None');
}

/* ---------- building blocks ---------- */

/** The state track: the happy path as stations, with the current state marked. Off-path states are appended. */
export function track(path: string[], current: string, bad: string[] = []): HTMLElement {
    const stations = path.includes(current) ? path : [...path.slice(0, 1), current];
    const idx = stations.indexOf(current);
    return h(
        'ol',
        { class: 'track', 'aria-label': `State: ${words(current)}` },
        stations.map((s, i) =>
            h('li', { class: [i < idx ? 'passed' : '', i === idx ? 'here' : '', i === idx && bad.includes(s) ? 'bad' : ''].join(' ').trim(), 'aria-current': i === idx ? 'step' : undefined }, words(s))
        )
    );
}

export interface Column<T> {
    title: string;
    cell: (row: T) => Child;
    num?: boolean;
}
export function table<T>(rows: T[], columns: Column<T>[], empty: string): HTMLElement {
    if (!rows.length) return h('div', { class: 'table-wrap' }, h('p', { class: 'empty' }, empty));
    return h(
        'div',
        { class: 'table-wrap' },
        h(
            'table',
            null,
            h('thead', null, h('tr', null, columns.map((c) => h('th', { class: c.num ? 'num' : '', scope: 'col' }, c.title)))),
            h('tbody', null, rows.map((r) => h('tr', null, columns.map((c) => h('td', { class: c.num ? 'num' : '' }, c.cell(r))))))
        )
    );
}

export function facts(pairs: [string, Child][]): HTMLElement {
    return h('dl', { class: 'facts' }, pairs.filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [h('dt', null, k), h('dd', null, v)]));
}

export function field(label: string, name: string, attrs: Props = {}): HTMLElement {
    return h('label', null, label, h('input', { name, ...attrs }));
}
export function select(label: string, name: string, options: [string, string][], attrs: Props = {}): HTMLElement {
    return h('label', null, label, h('select', { name, ...attrs }, options.map(([value, text]) => h('option', { value }, text))));
}

/** A form that posts its values through `submit`, toasts the result and refreshes. */
export function form(fields: Child[], submitLabel: string, submit: (values: Record<string, string>) => Promise<string | void>): HTMLFormElement {
    const f = h('form', { class: 'grid' }, fields, h('div', null, h('button', { type: 'submit', class: 'primary' }, submitLabel))) as HTMLFormElement;
    f.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const button = f.querySelector('button[type=submit]') as HTMLButtonElement;
        button.disabled = true;
        const values: Record<string, string> = {};
        new FormData(f).forEach((v, k) => (values[k] = String(v).trim()));
        try {
            const message = await submit(values);
            if (message) toast(message);
            refresh();
        } catch (e) {
            toast((e as Error).message, true);
            button.disabled = false;
        }
    });
    return f;
}

export function page(title: string, lede: string | null, ...children: Child[]): HTMLElement {
    return h('div', null, h('h1', null, title), lede ? h('p', { class: 'lede' }, lede) : null, children);
}

export const partyName = (p: any): string => (p?.['@type'] === 'Organization' ? p.name : `${p?.givenName ?? ''} ${p?.familyName ?? ''}`.trim());
export const link = (hash: string, text: Child): HTMLElement => h('a', { href: hash }, text);
