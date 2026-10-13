/**
 * Page layout versioning for the Customer Care overview pages.
 *
 * Works like a small version-control system:
 *  - draft      the working copy of page edit mode, saved automatically on every change
 *  - commit     turns the draft (or any layout) into a numbered, immutable version with a message;
 *               the newest version of a scope is its "head" and is what the page shows
 *  - scopes     "user" (the agent's own layout) and "operator" (the operator default for everyone),
 *               each with its own version line
 *  - history    every version with author, time, message and a summary of what changed
 *  - restore    commits an older version again as a new version (history is never rewritten)
 *
 * Every commit can also be written to disk (layouts/<page>/<scope>/v<N>.json plus current.json)
 * so the layouts can be kept in a git repository; with gitCommit/gitPush the folder is committed
 * (and pushed) after each version.
 */
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { Collection, Store } from '../common/store.ts';
import type { Clock } from '../common/runtime.ts';
import { invalid, notFound } from '../common/errors.ts';
import { withDetails } from './model.ts';
import type { LayoutChangeSummary, LayoutDraft, LayoutScope, LayoutSection, LayoutVersion, PageKey, PageLayout, TileLayoutItem } from './model.ts';
import { TILE_BY_KEY } from './tiles.ts';

const run = promisify(execFile);
const PAGES: PageKey[] = ['User', 'Account', 'subscriber', 'organization'];

export interface LayoutFileOptions {
    /** Folder the versions are written to; omit to keep them in the database only. */
    dir?: string;
    /** git add + commit the folder after each version (the folder must be inside a git repository). */
    gitCommit?: boolean;
    /** git push after the commit. */
    gitPush?: boolean;
    log?: (line: string) => void;
}

export interface LayoutDeps {
    store: Store;
    clock: Clock;
    defaults: (page: PageKey) => LayoutSection[];
    validate: (page: PageKey, raw: unknown) => LayoutSection[];
    author: string;
    files?: LayoutFileOptions;
}

const tileName = (t: TileLayoutItem): string => t.title || TILE_BY_KEY.get(t.componentKey)?.name || t.componentKey;

/** What changed from `before` to `after`, by tile id and section name. */
export function summarizeChanges(beforeRaw: LayoutSection[], afterRaw: LayoutSection[]): LayoutChangeSummary {
    const before = withDetails(beforeRaw);
    const after = withDetails(afterRaw);
    const index = (sections: LayoutSection[]) => {
        const m = new Map<string, { section: string; tile: TileLayoutItem }>();
        for (const s of sections) for (const t of s.layout) m.set(t.i, { section: s.sectionName, tile: t });
        return m;
    };
    const a = index(before);
    const b = index(after);
    const out: LayoutChangeSummary = { tilesAdded: [], tilesRemoved: [], tilesMoved: [], tilesResized: [], tilesRenamed: [], sectionsAdded: [], sectionsRemoved: [], sectionsChanged: [] };
    for (const [id, nb] of b) {
        const na = a.get(id);
        if (!na) {
            out.tilesAdded.push(tileName(nb.tile));
            continue;
        }
        if (na.section !== nb.section || na.tile.x !== nb.tile.x || na.tile.y !== nb.tile.y) out.tilesMoved.push(tileName(nb.tile));
        if (na.tile.w !== nb.tile.w || na.tile.h !== nb.tile.h) out.tilesResized.push(tileName(nb.tile));
        if ((na.tile.title ?? '') !== (nb.tile.title ?? '')) out.tilesRenamed.push(tileName(nb.tile));
    }
    for (const [id, na] of a) if (!b.has(id)) out.tilesRemoved.push(tileName(na.tile));
    const names = (s: LayoutSection[]) => s.map((x) => x.sectionName);
    const an = names(before);
    const bn = names(after);
    out.sectionsAdded = bn.filter((n) => !an.includes(n));
    out.sectionsRemoved = an.filter((n) => !bn.includes(n));
    for (const s of after) {
        const old = before.find((x) => x.sectionName === s.sectionName);
        if (!old) continue;
        if (old.isInitiallyCollapsed !== s.isInitiallyCollapsed || an.indexOf(s.sectionName) !== bn.indexOf(s.sectionName)) out.sectionsChanged.push(s.sectionName);
    }
    return out;
}

export const isEmptySummary = (s: LayoutChangeSummary): boolean => Object.values(s).every((list) => list.length === 0);

export class LayoutService {
    private readonly heads: Collection<PageLayout>;
    private readonly versions: Collection<LayoutVersion>;
    private readonly drafts: Collection<LayoutDraft>;
    private readonly deps: LayoutDeps;

    constructor(deps: LayoutDeps) {
        this.deps = deps;
        this.heads = deps.store.collection('ccsLayout', 'Layout');
        this.versions = deps.store.collection('ccsLayoutVersion', 'Layout version');
        this.drafts = deps.store.collection('ccsLayoutDraft', 'Layout draft');
    }

    page(raw: string): PageKey {
        const p = PAGES.find((x) => x.toLowerCase() === raw.toLowerCase());
        if (!p) throw invalid(`Unknown page "${raw}"`);
        return p;
    }
    scope(raw: string): LayoutScope {
        if (raw !== 'user' && raw !== 'operator') throw invalid('Scope must be "user" or "operator"');
        return raw;
    }
    private now(): string {
        return this.deps.clock.now().toISOString();
    }

    /** The layout the page shows: the agent's own head, else the operator default, else the built-in default. */
    async get(rawPage: string) {
        const page = this.page(rawPage);
        const user = await this.heads.get(`user:${page}`);
        const operator = await this.heads.get(`operator:${page}`);
        const head = user ?? operator;
        const draft = await this.drafts.get(`draft:${page}`);
        return {
            page,
            sections: head?.sections ?? this.deps.defaults(page),
            source: user ? 'user' : operator ? 'operator' : 'default',
            version: head?.version,
            updatedAt: head?.updatedAt,
            hasUserLayout: Boolean(user),
            hasOperatorDefault: Boolean(operator),
            userVersion: user?.version,
            operatorVersion: operator?.version,
            draft: draft ? { updatedAt: draft.updatedAt, base: draft.base, sections: draft.sections } : undefined,
        };
    }

    /* ---------- working copy ---------- */

    async saveDraft(rawPage: string, body: { sections?: unknown }) {
        const page = this.page(rawPage);
        const sections = this.deps.validate(page, body.sections);
        const existing = await this.drafts.get(`draft:${page}`);
        const current = await this.get(page);
        const doc: LayoutDraft = {
            id: `draft:${page}`,
            page,
            sections,
            base: existing?.base ?? { scope: current.source as LayoutScope | 'default', version: current.version },
            updatedAt: this.now(),
        };
        if (existing) await this.drafts.replace(doc);
        else await this.drafts.insert(doc);
        return { updatedAt: doc.updatedAt, base: doc.base, summary: summarizeChanges(current.sections, sections) };
    }

    async discardDraft(rawPage: string) {
        const page = this.page(rawPage);
        if (await this.drafts.get(`draft:${page}`)) await this.drafts.delete(`draft:${page}`);
        return this.get(page);
    }

    /* ---------- versions ---------- */

    async commit(rawPage: string, rawScope: string, body: { sections?: unknown; message?: unknown }, restoredFrom?: LayoutVersion['restoredFrom']) {
        const page = this.page(rawPage);
        const scope = this.scope(rawScope);
        const sections = this.deps.validate(page, body.sections);
        const message = typeof body.message === 'string' ? body.message.trim().slice(0, 300) : '';
        const headId = `${scope}:${page}`;
        const head = await this.heads.get(headId);
        const previous = head?.sections ?? (scope === 'user' ? (await this.get(page)).sections : this.deps.defaults(page));
        const summary = summarizeChanges(previous, sections);
        if (head && isEmptySummary(summary) && !restoredFrom) throw invalid('Nothing changed since the last version');

        const all = await this.versions.list((v) => v.page === page && v.scope === scope);
        const version = all.reduce((m, v) => Math.max(m, v.version), 0) + 1;
        const at = this.now();
        const v: LayoutVersion = {
            id: `${scope}:${page}:${version}`,
            page,
            scope,
            version,
            message: message || (restoredFrom ? `Restore ${restoredFrom.scope === 'operator' ? 'operator default' : 'my layout'} v${restoredFrom.version}` : `Version ${version}`),
            author: this.deps.author,
            createdAt: at,
            sections,
            parentVersion: head?.version,
            restoredFrom,
            summary,
        };
        await this.versions.insert(v);
        const doc: PageLayout = { id: headId, page, scope, sections, updatedAt: at, version };
        if (head) await this.heads.replace(doc);
        else await this.heads.insert(doc);
        // the operator default replaces everyone's view, so the agent's own head steps aside
        if (scope === 'operator' && (await this.heads.get(`user:${page}`))) await this.heads.delete(`user:${page}`);
        if (await this.drafts.get(`draft:${page}`)) await this.drafts.delete(`draft:${page}`);
        await this.writeFiles(v);
        return { version: this.brief(v), layout: await this.get(page) };
    }

    async list(rawPage: string, rawScope?: string) {
        const page = this.page(rawPage);
        const scope = rawScope ? this.scope(rawScope) : undefined;
        const heads = { user: (await this.heads.get(`user:${page}`))?.version, operator: (await this.heads.get(`operator:${page}`))?.version };
        const list = await this.versions.list((v) => v.page === page && (!scope || v.scope === scope));
        return list
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.version - a.version)
            .map((v) => ({ ...this.brief(v), isHead: heads[v.scope] === v.version }));
    }

    async getVersion(rawPage: string, rawScope: string, n: string | number) {
        const page = this.page(rawPage);
        const scope = this.scope(rawScope);
        const v = await this.versions.get(`${scope}:${page}:${Number(n)}`);
        if (!v) throw notFound('Layout version', `${scope} v${n}`);
        return v;
    }

    /** Commit an older version again, as the newest version of `targetScope` (default: its own scope). */
    async restore(rawPage: string, rawScope: string, n: string | number, body: { message?: unknown; targetScope?: unknown }) {
        const v = await this.getVersion(rawPage, rawScope, n);
        const target = typeof body.targetScope === 'string' ? this.scope(body.targetScope) : v.scope;
        return this.commit(v.page, target, { sections: v.sections, message: body.message }, { scope: v.scope, version: v.version });
    }

    /** Drop the agent's own head (the page falls back to the operator default); versions are kept. */
    async resetUser(rawPage: string) {
        const page = this.page(rawPage);
        if (await this.heads.get(`user:${page}`)) await this.heads.delete(`user:${page}`);
        return this.get(page);
    }

    private brief(v: LayoutVersion) {
        const tiles = v.sections.reduce((n, s) => n + s.layout.length, 0);
        return {
            id: v.id,
            page: v.page,
            scope: v.scope,
            version: v.version,
            message: v.message,
            author: v.author,
            createdAt: v.createdAt,
            parentVersion: v.parentVersion,
            restoredFrom: v.restoredFrom,
            summary: v.summary,
            sectionCount: v.sections.length,
            tileCount: tiles,
        };
    }

    /* ---------- files and git ---------- */

    private async writeFiles(v: LayoutVersion): Promise<void> {
        const f = this.deps.files;
        if (!f?.dir) return;
        const log = f.log ?? (() => undefined);
        try {
            const folder = join(f.dir, v.page, v.scope);
            await mkdir(folder, { recursive: true });
            const body = JSON.stringify({ page: v.page, scope: v.scope, version: v.version, message: v.message, author: v.author, createdAt: v.createdAt, sections: v.sections }, null, 2) + '\n';
            await writeFile(join(folder, `v${v.version}.json`), body);
            await writeFile(join(folder, 'current.json'), body);
        } catch (e) {
            log(`layout files: could not write version ${v.id}: ${(e as Error).message}`);
            return;
        }
        if (!f.gitCommit) return;
        try {
            await run('git', ['-C', f.dir, 'add', '-A', '.']);
            await run('git', ['-C', f.dir, 'commit', '-m', `layout ${v.page}/${v.scope} v${v.version}: ${v.message}`, '--', '.']);
            log(`layout files: committed ${v.id}`);
            if (f.gitPush) {
                await run('git', ['-C', f.dir, 'push']);
                log(`layout files: pushed ${v.id}`);
            }
        } catch (e) {
            log(`layout files: git failed for ${v.id}: ${(e as Error).message.split('\n')[0]}`);
        }
    }
}
