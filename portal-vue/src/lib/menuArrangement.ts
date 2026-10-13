/**
 * The agent's sidebar: order of the top-level entries, which sub-entries each group holds and in
 * what order, hidden and deleted entries, and entries the agent added. Saved on the server; built-in
 * entries it does not mention (e.g. new modules) keep their default place.
 *
 * Keys: a built-in top-level entry is keyed by its name, a built-in sub-entry by its link, and a
 * custom entry by its id ("c-...").
 */
import { reactive } from 'vue';
import { api } from './api.ts';
import type { MenuItem } from '../components/layout/menu.ts';

export interface CustomMenuEntry {
    id: string;
    kind: 'menu' | 'sub';
    name: string;
    link?: string;
    icon?: string;
}
export interface MenuArrangement {
    /** Top-level keys of the main menu, in order. */
    order: string[];
    groups: Record<string, string[]>;
    hidden: string[];
    custom: CustomMenuEntry[];
    deleted: string[];
    /** Top-level keys of the bottom area (Settings, Support, My Account, tenant), in order. */
    footer?: string[];
    /** New names and icons for built-in entries, by key. */
    renames?: Record<string, string>;
    icons?: Record<string, string>;
    /** The environment label at the very bottom (Staging). */
    env?: { label?: string; hidden?: boolean };
}
/** Marks the start of the bottom area in the editor's list. */
export const FOOTER_DIVIDER = '__footer__';
export interface ArrangedSub {
    key: string;
    name: string;
    link: string;
    hidden: boolean;
    custom: boolean;
    original?: string;
}
export interface ArrangedItem {
    key: string;
    name: string;
    icon: string;
    link?: string;
    hidden: boolean;
    custom: boolean;
    subItems?: ArrangedSub[];
    /** The built-in name, to show what a renamed entry was. */
    original?: string;
}

const empty = (): MenuArrangement => ({ order: [], groups: {}, hidden: [], custom: [], deleted: [], footer: undefined, renames: {}, icons: {}, env: {} });
export const menuArrangement = reactive<MenuArrangement>(empty());

export const isExternal = (link: string): boolean => /^https:\/\//.test(link);

/** Key of a built-in top-level entry (its name, unless the item names a key). */
export const keyOf = (m: MenuItem): string => m.key ?? m.name;

/**
 * The whole sidebar as one list: the main menu, then FOOTER_DIVIDER, then the bottom area.
 * `footerBase` are the built-in bottom entries.
 */
export function arrange(base: MenuItem[], a: MenuArrangement, footerBase: MenuItem[] = []): ArrangedItem[] {
    const deleted = new Set(a.deleted);
    const hidden = new Set(a.hidden);
    const renames = a.renames ?? {};
    const icons = a.icons ?? {};
    const tops = new Map<string, Omit<ArrangedItem, 'subItems' | 'hidden'> & { group: boolean; defaults: string[]; footer: boolean }>();
    const pool = new Map<string, { name: string; link: string; home?: string; custom: boolean; original?: string }>();
    const addBuiltIn = (m: MenuItem, footer: boolean) => {
        const k = keyOf(m);
        if (deleted.has(k)) return;
        tops.set(k, { key: k, name: renames[k] ?? m.name, original: m.name, icon: icons[k] ?? m.icon, link: m.link, custom: false, group: !!m.subItems, defaults: (m.subItems ?? []).map((s) => s.link), footer });
        for (const s of m.subItems ?? []) if (!deleted.has(s.link)) pool.set(s.link, { name: renames[s.link] ?? s.name, original: s.name, link: s.link, home: k, custom: false });
    };
    base.forEach((m) => addBuiltIn(m, false));
    footerBase.forEach((m) => addBuiltIn(m, true));
    for (const c of a.custom) {
        if (c.kind === 'menu') tops.set(c.id, { key: c.id, name: c.name, icon: c.icon ?? 'consistency/sidebar-home', link: c.link, custom: true, group: !c.link, defaults: [], footer: false });
        else if (c.link) pool.set(c.id, { name: c.name, link: c.link, custom: true });
    }
    const footerSet = new Set((a.footer ?? []).filter((k) => tops.has(k)));
    const mainKeys = a.order.filter((k) => tops.has(k) && !footerSet.has(k));
    const footerKeys = [...footerSet];
    const placed = new Set([...mainKeys, ...footerKeys]);
    for (const [k, t] of tops) {
        if (placed.has(k)) continue;
        (t.footer && a.footer === undefined ? footerKeys : t.footer ? footerKeys : mainKeys).push(k);
    }
    const order = [...mainKeys, ...footerKeys];
    const used = new Set<string>();
    const groups = new Map<string, string[]>();
    for (const k of order) {
        const t = tops.get(k)!;
        if (!t.group) continue;
        const keys = (a.groups[k] ?? t.defaults).filter((s) => pool.has(s) && !used.has(s));
        keys.forEach((s) => used.add(s));
        groups.set(k, keys);
    }
    // built-in sub-entries the arrangement does not place go back to their own group
    for (const [key, s] of pool) if (!used.has(key) && s.home && groups.has(s.home)) groups.get(s.home)!.push(key);
    const toItem = (k: string): ArrangedItem => {
        const t = tops.get(k)!;
        const item: ArrangedItem = { key: k, name: t.name, icon: t.icon, link: t.group ? undefined : t.link, hidden: hidden.has(k), custom: t.custom, ...(t.custom ? {} : { original: t.original }) };
        if (t.group) {
            item.subItems = (groups.get(k) ?? []).map((sk) => {
                const p = pool.get(sk)!;
                return { key: sk, name: p.name, link: p.link, hidden: hidden.has(sk), custom: p.custom, ...(p.custom ? {} : { original: p.original }) };
            });
        }
        return item;
    };
    const divider: ArrangedItem = { key: FOOTER_DIVIDER, name: 'Bottom of the sidebar', icon: '', hidden: false, custom: false };
    return [...mainKeys.map(toItem), divider, ...footerKeys.map(toItem)];
}

/** Split the editor's list into the main menu and the bottom area. */
export function zones(items: ArrangedItem[]): { main: ArrangedItem[]; footer: ArrangedItem[] } {
    const i = items.findIndex((m) => m.key === FOOTER_DIVIDER);
    return i === -1 ? { main: items, footer: [] } : { main: items.slice(0, i), footer: items.slice(i + 1) };
}

/** What the sidebar shows outside the editor: hidden entries and empty groups left out. */
export function visibleMenu(items: ArrangedItem[]): MenuItem[] {
    return items
        .filter((m) => !m.hidden)
        .filter((m) => m.key !== FOOTER_DIVIDER)
        .map((m) => (m.subItems ? { key: m.key, name: m.name, icon: m.icon, subItems: m.subItems.filter((s) => !s.hidden).map(({ name, link }) => ({ name, link })) } : { key: m.key, name: m.name, icon: m.icon, link: m.link }))
        .filter((m) => !m.subItems || m.subItems.length);
}

/** The arrangement that reproduces `items` exactly (custom entries and deletions carried over). */
export function toArrangement(all: ArrangedItem[], prev: MenuArrangement): MenuArrangement {
    const { main, footer } = zones(all);
    const items = [...main, ...footer];
    const groups: Record<string, string[]> = {};
    for (const m of items) if (m.subItems) groups[m.key] = m.subItems.map((s) => s.key);
    return {
        order: main.map((m) => m.key),
        footer: footer.map((m) => m.key),
        renames: { ...(prev.renames ?? {}) },
        icons: { ...(prev.icons ?? {}) },
        env: { ...(prev.env ?? {}) },
        groups,
        hidden: items.flatMap((m) => [...(m.hidden ? [m.key] : []), ...(m.subItems ?? []).filter((s) => s.hidden).map((s) => s.key)]),
        custom: prev.custom.map((c) => ({ ...c })),
        deleted: [...prev.deleted],
    };
}

const newId = () => `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'page';

/** Add a top-level menu: a group (no link) or a single link; it goes to the end of the menu. */
export function addMenu(items: ArrangedItem[], prev: MenuArrangement, entry: { name: string; icon: string; link?: string; group: boolean }): MenuArrangement {
    const next = toArrangement(items, prev);
    const id = newId();
    next.custom.push({ id, kind: 'menu', name: entry.name.trim(), icon: entry.icon, ...(entry.group ? {} : { link: entry.link?.trim() || `/module/${slug(entry.name)}` }) });
    next.order.push(id);
    if (entry.group) next.groups[id] = [];
    return next;
}
/** Add a sub-menu at the end of a group. */
export function addSubMenu(items: ArrangedItem[], prev: MenuArrangement, groupKey: string, entry: { name: string; link?: string }): MenuArrangement {
    const next = toArrangement(items, prev);
    const id = newId();
    next.custom.push({ id, kind: 'sub', name: entry.name.trim(), link: entry.link?.trim() || `/module/${slug(entry.name)}` });
    next.groups[groupKey] = [...(next.groups[groupKey] ?? []), id];
    return next;
}
/** Rename an entry, change its icon (top level) or its link (added entries). */
export function editEntry(items: ArrangedItem[], prev: MenuArrangement, key: string, change: { name: string; icon?: string; link?: string }): MenuArrangement {
    const next = toArrangement(items, prev);
    const custom = next.custom.find((c) => c.id === key);
    const name = change.name.trim();
    if (custom) {
        custom.name = name;
        if (change.icon !== undefined && custom.kind === 'menu') custom.icon = change.icon;
        if (change.link !== undefined && (custom.kind === 'sub' || custom.link)) custom.link = change.link.trim() || custom.link;
        return next;
    }
    const flat = zones(items);
    const entry = [...flat.main, ...flat.footer].flatMap((m) => [m, ...(m.subItems ?? [])]).find((m) => m.key === key);
    const renames = next.renames!;
    if (!name || name === entry?.original) delete renames[key];
    else renames[key] = name;
    if (change.icon !== undefined) next.icons![key] = change.icon;
    return next;
}
/** The environment label at the bottom of the sidebar. */
export function editEnv(items: ArrangedItem[], prev: MenuArrangement, env: { label?: string; hidden?: boolean }): MenuArrangement {
    const next = toArrangement(items, prev);
    next.env = { ...next.env, ...env };
    return next;
}

/** Delete an entry; deleting a group deletes the sub-entries in it too. */
export function deleteEntry(items: ArrangedItem[], prev: MenuArrangement, key: string): MenuArrangement {
    const next = toArrangement(items, prev);
    const top = items.find((m) => m.key === key);
    const keys = top ? [key, ...(top.subItems ?? []).map((s) => s.key)] : [key];
    const customIds = new Set(prev.custom.map((c) => c.id));
    for (const k of keys) {
        if (customIds.has(k)) next.custom = next.custom.filter((c) => c.id !== k);
        else if (!next.deleted.includes(k)) next.deleted.push(k);
    }
    const gone = new Set(keys);
    next.order = next.order.filter((k) => !gone.has(k));
    next.footer = next.footer?.filter((k) => !gone.has(k));
    next.hidden = next.hidden.filter((k) => !gone.has(k));
    delete next.groups[key];
    for (const g of Object.keys(next.groups)) next.groups[g] = next.groups[g]!.filter((k) => !gone.has(k));
    return next;
}

export async function loadMenuArrangement(): Promise<void> {
    try {
        Object.assign(menuArrangement, empty(), await api<MenuArrangement>('/care/menu'));
    } catch {
        /* the default menu still works */
    }
}
let timer: ReturnType<typeof setTimeout> | undefined;
export function saveMenuArrangement(next: MenuArrangement, onError: (e: unknown) => void): void {
    Object.assign(menuArrangement, next);
    clearTimeout(timer);
    timer = setTimeout(() => {
        api('/care/menu', 'PUT', next).catch(onError);
    }, 300);
}
export async function resetMenuArrangement(): Promise<void> {
    clearTimeout(timer);
    Object.assign(menuArrangement, empty(), await api<MenuArrangement>('/care/menu', 'DELETE'));
}
