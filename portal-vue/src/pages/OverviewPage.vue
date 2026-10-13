<template>
    <div :class="['overview', { 'with-library': editing && catalog }]">
        <div class="header-wrap">
            <LfHeader :title="editing ? `${pageTitle} - Page edit mode` : pageTitle">
                <template #actions>
                    <template v-if="!editing">
                        <span
                            v-if="entityType === 'subscriber' && entity?.subscriber"
                            class="msisdn"
                            >MSISDN: {{ entity.subscriber.msisdn }}</span
                        >
                        <LfButton
                            v-if="entityType !== 'organization'"
                            variant="tertiary_m"
                            :label="editLabel"
                            class="mr-4"
                            :disabled="!entity"
                            @click="editOpen = true"
                        />
                        <SupportActions
                            v-if="entityType !== 'organization'"
                            :entity-type="entityType"
                            :entity-id="id"
                            class="mr-4"
                            @done="reloadEntity"
                        />
                        <LfButton
                            icon="EditIcon"
                            label="Page edit mode"
                            data-test-id="toggle-edit"
                            @click="startEdit"
                        />
                    </template>
                    <template v-else>
                        <LfButton
                            variant="secondary"
                            icon="CloseIcon"
                            icon-class="red"
                            label-class="red"
                            label="Cancel"
                            @click="cancelEdit"
                        />
                        <LfButton
                            v-if="layoutInfo?.hasUserLayout"
                            variant="secondary"
                            icon="delete-new"
                            icon-class="red"
                            label-class="red"
                            label="Revert layout"
                            @click="revert"
                        />
                        <LfButton
                            label="Save"
                            :loading="saving"
                            @click="openCommit('user', false)"
                        />
                        <LfButton
                            label="Save and close"
                            :loading="saving"
                            @click="openCommit('user', true)"
                        />
                        <LfButton
                            label="Save As Operator Default"
                            :loading="saving"
                            @click="openCommit('operator', false)"
                        />
                        <LfButton
                            label="Export"
                            @click="exportLayout"
                        />
                        <LfButton
                            label="Import"
                            @click="importLayout"
                        />
                    </template>
                </template>
            </LfHeader>
            <div
                v-if="layoutInfo"
                :class="['version-bar', { editing }]"
            >
                <LfIcon
                    name="HistoryIcon"
                    class="vb-icon"
                />
                <template v-if="editing">
                    <span class="vb-strong">Editing</span>
                    <span class="vb-muted">based on {{ baseLabel }}</span>
                    <span class="vb-sep">·</span>
                    <span
                        v-if="draftStatus === 'saving'"
                        class="vb-muted"
                        >Saving draft...</span
                    >
                    <span
                        v-else-if="draftStatus === 'error'"
                        class="vb-error"
                        >Draft not saved: {{ draftError }}</span
                    >
                    <span
                        v-else-if="layoutInfo.draft"
                        class="vb-muted"
                        >Draft saved {{ fmtTime(layoutInfo.draft.updatedAt, true) }}</span
                    >
                    <span
                        v-else
                        class="vb-muted"
                        >No changes yet</span
                    >
                    <LfTag
                        v-if="pendingChanges"
                        :label="`${pendingChanges} unsaved ${pendingChanges === 1 ? 'change' : 'changes'}`"
                        color="yellow"
                    />
                </template>
                <template v-else>
                    <span class="vb-strong">{{ headLabel }}</span>
                    <span
                        v-if="layoutInfo.updatedAt"
                        class="vb-muted"
                        >saved {{ fmtDateTime(layoutInfo.updatedAt) }}</span
                    >
                    <template v-if="layoutInfo.draft">
                        <span class="vb-sep">·</span>
                        <LfTag
                            :label="`Unsaved draft from ${fmtDateTime(layoutInfo.draft.updatedAt)}`"
                            color="yellow"
                        />
                        <LfButton
                            variant="tertiary_s"
                            label="Continue editing"
                            @click="startEdit"
                        />
                    </template>
                </template>
                <div class="vb-actions">
                    <LfButton
                        v-if="layoutInfo.draft"
                        variant="tertiary_s"
                        icon="delete-new"
                        label="Discard draft"
                        @click="discardDraft"
                    />
                    <LfButton
                        variant="tertiary_s"
                        icon="HistoryIcon"
                        label="Version history"
                        data-test-id="layout-history"
                        @click="historyOpen = true"
                    />
                </div>
            </div>
        </div>

        <div id="layout-page">
            <LfBreadcrumb
                class="crumbs"
                :items="crumbs"
            />
            <div
                v-if="loadError"
                class="load-error"
            >
                <LfEmptyState :error="loadError" />
            </div>
            <template v-else-if="entity && catalog">
                <template
                    v-for="(section, i) in sections"
                    :key="`${sectionKeys[i]}-${editing}`"
                >
                    <section
                        v-if="section.kind === 'details'"
                        :class="['section', 'details-section', { editing }, sectionDropMark(i) ? `drop-${sectionDropMark(i)}` : '', { 'is-dragged': sectionDrag?.from === i && sectionDrag.active }]"
                    >
                        <div
                            v-if="editing"
                            class="details-header"
                            title="Drag to move the details block"
                            @pointerdown="(e) => startSectionDrag(i, e)"
                        >
                            <span class="details-handle"><LfIcon name="dnd-drag-handle-icon" /></span>
                            <h2 class="details-title">Details</h2>
                            <span class="details-note">{{ pageTitle }} details · drag to place it anywhere on the page</span>
                        </div>
                        <PageAnchor
                            v-show="!sectionDrag?.active"
                            :entity-type="entityType"
                            :data="entity"
                        />
                    </section>
                    <LayoutSection
                        v-else
                        :section="section"
                        :page="page"
                        :catalog="catalog.byKey"
                        :sizes="catalog.sizes"
                        :entity-type="entityType"
                        :entity-id="id"
                        :editing="editing"
                        :can-move-up="i > 0"
                        :can-move-down="i < sections.length - 1"
                        :drop-mark="sectionDropMark(i)"
                        :dragged="sectionDrag?.from === i && sectionDrag.active"
                        :outline="!!sectionDrag?.active"
                        @drag-start="(e) => startSectionDrag(i, e)"
                        @update="(s) => updateSection(i, s)"
                        @remove="removeSection(i)"
                        @move="(d) => moveSection(i, d)"
                    />
                </template>
                <div
                    v-if="editing"
                    class="add-section"
                >
                    <h2>Add section</h2>
                    <div class="add-row">
                        <LfInput
                            v-model="newSectionName"
                            label="Section name"
                            class="layout-input"
                        />
                        <LfButton
                            label="Add section"
                            class="add-btn"
                            :disabled="!newSectionName.trim()"
                            @click="addSection"
                        />
                    </div>
                </div>
            </template>
            <div
                v-else
                class="loading"
            >
                <LfIcon
                    name="SpinnerIcon"
                    size="1.5rem"
                    class="spin"
                />
            </div>
        </div>

        <TileLibrary
            v-if="editing && catalog"
            :tiles="catalog.tiles"
            :sizes="catalog.sizes"
            :page="page"
            :sections="sections"
            @add="addTileToFirst"
        />
        <DragGhost />
        <Teleport to="body">
            <div
                v-if="sectionDrag?.active"
                class="section-ghost"
                :style="{ left: `${sectionDrag.x + 14}px`, top: `${sectionDrag.y + 10}px` }"
            >
                <LfIcon name="dnd-drag-handle-icon" />
                <span class="sg-name">{{ sections[sectionDrag.from]?.sectionName }}</span>
                <span class="sg-hint">Drop between sections · Esc cancels</span>
            </div>
        </Teleport>
        <EditEntityModal
            v-if="editOpen && entity && entityType !== 'organization'"
            :entity-type="entityType"
            :entity="editTarget"
            @close="editOpen = false"
            @saved="onSaved"
        />
        <CommitModal
            v-if="commit"
            :scope="commit.scope"
            :next-version="commit.next"
            :page-title="pageTitle"
            :summary="commit.summary"
            :busy="saving"
            :error="commit.error"
            @close="commit = undefined"
            @commit="doCommit"
        />
        <LayoutHistory
            :visible="historyOpen"
            :page="page"
            :page-title="pageTitle"
            @close="historyOpen = false"
            @restored="onRestored"
            @checkout="onCheckout"
        />
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import CommitModal from '../components/ccs/CommitModal.vue';
import DragGhost from '../components/ccs/DragGhost.vue';
import TileLibrary from '../components/ccs/TileLibrary.vue';
import LayoutHistory from '../components/ccs/LayoutHistory.vue';
import LfTag from '../components/ui/LfTag.vue';
import { fmtDateTime, fmtTime } from '../lib/format.ts';
import { changeCount } from '../lib/layoutChanges.ts';
import LayoutSection from '../components/ccs/LayoutSection.vue';
import PageAnchor from '../components/ccs/PageAnchor.vue';
import SupportActions from '../components/ccs/SupportActions.vue';
import EditEntityModal from '../components/ccs/EditEntityModal.vue';
import LfBreadcrumb from '../components/ui/LfBreadcrumb.vue';
import LfButton from '../components/ui/LfButton.vue';
import LfEmptyState from '../components/ui/LfEmptyState.vue';
import LfHeader from '../components/ui/LfHeader.vue';
import LfIcon from '../components/ui/LfIcon.vue';
import LfInput from '../components/ui/LfInput.vue';
import { api, downloadJson, pickTextFile } from '../lib/api.ts';
import { loadCatalog } from '../lib/catalog.ts';
import type { TileCatalog } from '../lib/catalog.ts';
import { compact, placeNew } from '../lib/grid.ts';
import { showToast, toastError } from '../lib/toast.ts';
import { PAGE_FOR_ENTITY, withDetails } from '../lib/types.ts';
import type { EntityType, LayoutChangeSummary, LayoutInfo, LayoutScope, LayoutSection as Section, LayoutVersionBrief } from '../lib/types.ts';

/** LayoutPage: Customer / Account / Subscriber Overview and Organization, with page edit mode. */
const props = defineProps<{ entityType: EntityType; id: string }>();
const page = PAGE_FOR_ENTITY[props.entityType];
const pageTitle = { user: 'Customer Overview', account: 'Account Overview', subscriber: 'Subscriber Overview', organization: 'Organization' }[props.entityType];
const editLabel = { user: 'Edit User', account: 'Edit Account', subscriber: 'Edit Subscriber', organization: '' }[props.entityType];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const entity = ref<Record<string, any>>();
const catalog = ref<TileCatalog>();
const loadError = ref('');
const layoutInfo = ref<LayoutInfo>();
const sections = ref<Section[]>([]);
const sectionKeys = ref<number[]>([]);
let keySeq = 0;
const editing = ref(false);
const saving = ref(false);
const editOpen = ref(false);
const historyOpen = ref(false);
const commit = ref<{ scope: LayoutScope; close: boolean; next: number; summary?: LayoutChangeSummary; error: string }>();
const newSectionName = ref('');

const setSections = (s: Section[]) => {
    sections.value = JSON.parse(JSON.stringify(withDetails(s))) as Section[];
    sectionKeys.value = sections.value.map(() => keySeq++);
};

async function reloadEntity(): Promise<void> {
    try {
        entity.value = await api(`/care/${props.entityType}/${props.id}`);
    } catch (e) {
        loadError.value = (e as Error).message;
    }
}
onMounted(async () => {
    try {
        const [c, l] = await Promise.all([loadCatalog(), api(`/care/layout/${page}`), reloadEntity()]);
        catalog.value = c;
        layoutInfo.value = l;
        setSections(l.sections);
    } catch (e) {
        loadError.value = (e as Error).message;
    }
});

const crumbs = computed(() => {
    const items: { label: string; to?: string }[] = [{ label: 'Search', to: '/customer-care/user-manager' }];
    const e = entity.value;
    const base = '/customer-care/user-manager';
    if (props.entityType === 'organization') items.push({ label: 'Organization' });
    else if (props.entityType === 'user') items.push({ label: 'User' });
    else if (props.entityType === 'account') {
        if (e?.owner) items.push({ label: 'User', to: `${base}/user/${e.owner.id}` });
        items.push({ label: 'Account' });
    } else {
        if (e?.user) items.push({ label: 'User', to: `${base}/user/${e.user.id}` });
        if (e?.account) items.push({ label: 'Account', to: `${base}/account/${e.account.id}` });
        items.push({ label: 'Subscriber' });
    }
    return items;
});

const editTarget = computed<Record<string, unknown>>(() => {
    const e = entity.value;
    if (!e) return {};
    if (props.entityType === 'user') return e.user;
    if (props.entityType === 'account') return e.account;
    return e.subscriber;
});
async function onSaved(): Promise<void> {
    editOpen.value = false;
    await reloadEntity();
}

// page edit mode with a working copy (draft) saved automatically, and committed versions
const draftStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle');
const draftError = ref('');
const draftSummary = ref<LayoutChangeSummary>();
const checkoutLabel = ref('');
let baseline = '';
let timer: ReturnType<typeof setTimeout> | undefined;
let pendingSave: Promise<void> | undefined;

const scopeLabel = (scope: string | undefined, version: number | undefined) =>
    scope === 'user' ? `My layout v${version ?? '?'}` : scope === 'operator' ? `Operator default v${version ?? '?'}` : 'Default layout';
const headLabel = computed(() => scopeLabel(layoutInfo.value?.source, layoutInfo.value?.version));
const baseLabel = computed(() => checkoutLabel.value || (layoutInfo.value?.draft ? scopeLabel(layoutInfo.value.draft.base.scope, layoutInfo.value.draft.base.version) : headLabel.value));
const pendingChanges = computed(() => changeCount(draftSummary.value));
const norm = (list: Section[]) =>
    JSON.stringify(withDetails(list).map((s) => ({ ...(s.kind ? { kind: s.kind } : {}), sectionName: s.sectionName, isInitiallyCollapsed: s.isInitiallyCollapsed, layout: compact(s.layout).map((t) => ({ i: t.i, x: t.x, y: t.y, w: t.w, h: t.h, componentKey: t.componentKey, ...(t.title ? { title: t.title } : {}) })) })));
const snapshot = () => norm(sections.value);

function startEdit(): void {
    const draft = layoutInfo.value?.draft;
    baseline = norm(layoutInfo.value?.sections ?? []);
    setSections(draft?.sections ?? layoutInfo.value?.sections ?? []);
    draftSummary.value = undefined;
    draftStatus.value = draft ? 'saved' : 'idle';
    checkoutLabel.value = '';
    editing.value = true;
    if (draft) {
        showToast('info', 'Draft restored', `You are continuing the draft saved ${fmtDateTime(draft.updatedAt)}.`);
        void saveDraftNow();
    }
}
function cancelEdit(): void {
    clearTimeout(timer);
    editing.value = false;
    setSections(layoutInfo.value?.sections ?? []);
    if (layoutInfo.value?.draft) showToast('info', 'Draft kept', 'Your changes are kept as a draft. Continue them from Page edit mode, or discard the draft.');
}

/** Save the working copy now (debounced saves call this). */
async function saveDraftNow(): Promise<void> {
    clearTimeout(timer);
    if (!editing.value) return;
    const body = snapshot();
    if (body === baseline && !layoutInfo.value?.draft) {
        draftSummary.value = undefined;
        return;
    }
    draftStatus.value = 'saving';
    const run = (async () => {
        try {
            const res = await api<{ updatedAt: string; base: { scope: string; version?: number }; summary: LayoutChangeSummary }>(`/care/layout/${page}/draft`, 'PUT', { sections: JSON.parse(body) });
            if (layoutInfo.value) layoutInfo.value = { ...layoutInfo.value, draft: { updatedAt: res.updatedAt, base: res.base, sections: JSON.parse(body) } };
            draftSummary.value = res.summary;
            draftStatus.value = 'saved';
            draftError.value = '';
        } catch (e) {
            draftStatus.value = 'error';
            draftError.value = (e as Error).message;
        }
    })();
    pendingSave = run;
    await run;
}
watch(
    sections,
    () => {
        if (!editing.value) return;
        clearTimeout(timer);
        timer = setTimeout(() => void saveDraftNow(), 600);
    },
    { deep: true },
);
// leaving the page with a pending change: save it first
onBeforeUnmount(() => {
    if (timer) {
        clearTimeout(timer);
        void saveDraftNow();
    }
});

async function discardDraft(): Promise<void> {
    clearTimeout(timer);
    try {
        layoutInfo.value = await api<LayoutInfo>(`/care/layout/${page}/draft`, 'DELETE');
        setSections(layoutInfo.value.sections);
        baseline = norm(layoutInfo.value.sections);
        draftSummary.value = undefined;
        draftStatus.value = 'idle';
        checkoutLabel.value = '';
        showToast('success', 'Draft discarded');
    } catch (e) {
        toastError(e);
    }
}

function updateSection(i: number, s: Section): void {
    sections.value[i] = s;
}
function removeSection(i: number): void {
    if (sections.value[i]?.kind === 'details') return;
    sections.value.splice(i, 1);
    sectionKeys.value.splice(i, 1);
}
function moveSection(i: number, d: number): void {
    const j = i + d;
    if (j < 0 || j >= sections.value.length) return;
    const s = sections.value;
    [s[i], s[j]] = [s[j]!, s[i]!];
    const k = sectionKeys.value;
    [k[i], k[j]] = [k[j]!, k[i]!];
}
// drag a section by its header to reorder; while dragging, every section shows only its header
const sectionDrag = ref<{ from: number; to: number; active: boolean; x: number; y: number }>();
function sectionDropMark(i: number): 'before' | 'after' | '' {
    const d = sectionDrag.value;
    if (!d?.active || d.to === d.from || d.to === d.from + 1) return '';
    if (d.to === i) return 'before';
    if (d.to === sections.value.length && i === sections.value.length - 1) return 'after';
    return '';
}
const sectionEls = () => [...document.querySelectorAll<HTMLElement>('#layout-page > section.section')];
function startSectionDrag(i: number, e: PointerEvent): void {
    if (e.button !== 0 || sectionDrag.value) return;
    const sx = e.clientX;
    const sy = e.clientY;
    sectionDrag.value = { from: i, to: i, active: false, x: sx, y: sy };
    const scroller = document.querySelector<HTMLElement>('.shell > .main');
    const target = (clientY: number) => {
        const els = sectionEls();
        const idx = els.findIndex((el) => {
            const r = el.getBoundingClientRect();
            return clientY < r.top + r.height / 2;
        });
        return idx === -1 ? els.length : idx;
    };
    let tick: ReturnType<typeof setInterval> | undefined;
    const activate = async () => {
        const d = sectionDrag.value;
        if (!d) return;
        const header = sectionEls()[d.from];
        const before = header?.getBoundingClientRect().top ?? 0;
        d.active = true;
        document.body.classList.add('lf-dragging');
        await nextTick();
        // keep the dragged header under the pointer after the sections fold up
        const after = sectionEls()[d.from]?.getBoundingClientRect().top ?? 0;
        if (scroller) scroller.scrollTop += after - before;
        d.to = target(d.y);
        tick = setInterval(() => {
            const cur = sectionDrag.value;
            if (!scroller || !cur) return;
            const h = window.innerHeight;
            if (cur.y < 140) scroller.scrollTop -= Math.ceil((140 - cur.y) / 5);
            else if (cur.y > h - 70) scroller.scrollTop += Math.ceil((cur.y - (h - 70)) / 4);
            cur.to = target(cur.y);
        }, 16);
    };
    const move = (ev: PointerEvent) => {
        const d = sectionDrag.value;
        if (!d) return;
        d.x = ev.clientX;
        d.y = ev.clientY;
        if (!d.active) {
            if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6) void activate();
            return;
        }
        d.to = target(ev.clientY);
    };
    const end = (drop: boolean) => {
        clearInterval(tick);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('keydown', key);
        const d = sectionDrag.value;
        sectionDrag.value = undefined;
        if (!d?.active) return;
        document.body.classList.remove('lf-dragging');
        // the release must not also toggle the section open or closed
        const swallow = (ev: Event) => {
            ev.stopPropagation();
            ev.preventDefault();
        };
        window.addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
        if (!drop || d.to === d.from || d.to === d.from + 1) return;
        const to = d.to > d.from ? d.to - 1 : d.to;
        const [sec] = sections.value.splice(d.from, 1);
        const [k] = sectionKeys.value.splice(d.from, 1);
        sections.value.splice(to, 0, sec!);
        sectionKeys.value.splice(to, 0, k!);
        void nextTick(() => sectionEls()[to]?.scrollIntoView({ block: 'nearest' }));
    };
    const up = () => end(true);
    const key = (ev: KeyboardEvent) => {
        if (ev.key === 'Escape') end(false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('keydown', key);
}
/** + in the tile library: add the tile at the end of the first section. */
function addTileToFirst(key: string): void {
    const def = catalog.value?.byKey.get(key);
    if (!def || !catalog.value) return;
    let at = sections.value.findIndex((x) => x.kind !== 'details');
    if (at === -1) {
        sections.value.push({ sectionName: 'Tiles', isInitiallyCollapsed: false, layout: [] });
        sectionKeys.value.push(keySeq++);
        at = sections.value.length - 1;
    }
    const sec = sections.value[at]!;
    const size = catalog.value.sizes[def.size] ?? { w: 12, h: 4 };
    const pos = placeNew(sec.layout, size.w, size.h);
    sections.value[at] = { ...sec, layout: [...sec.layout, { i: `${def.key}-${Date.now().toString(36)}`, x: pos.x, y: pos.y, w: size.w, h: size.h, componentKey: def.key }] };
    showToast('success', `${def.name} added`, `Added to ${sec.sectionName}. Drag it to place it.`);
}
function addSection(): void {
    const name = newSectionName.value.trim();
    if (!name) return;
    if (sections.value.some((s) => s.sectionName === name)) {
        showToast('error', 'A section with this name already exists');
        return;
    }
    sections.value.push({ sectionName: name, isInitiallyCollapsed: false, layout: [] });
    sectionKeys.value.push(keySeq++);
    newSectionName.value = '';
}

async function openCommit(scope: LayoutScope, close: boolean): Promise<void> {
    await (pendingSave ?? Promise.resolve());
    await saveDraftNow();
    let next = 1;
    try {
        const list = await api<LayoutVersionBrief[]>(`/care/layout/${page}/versions?scope=${scope}`);
        next = list.reduce((m, v) => Math.max(m, v.version), 0) + 1;
    } catch {
        /* the dialog still works without the number */
    }
    commit.value = { scope, close, next, summary: draftSummary.value, error: '' };
}
async function doCommit(message: string): Promise<void> {
    const c = commit.value;
    if (!c) return;
    saving.value = true;
    clearTimeout(timer);
    try {
        const res = await api<{ version: { version: number; scope: string }; layout: LayoutInfo }>(`/care/layout/${page}/${c.scope}/commit`, 'POST', {
            sections: JSON.parse(snapshot()),
            message,
        });
        layoutInfo.value = res.layout;
        baseline = norm(res.layout.sections);
        draftSummary.value = undefined;
        draftStatus.value = 'idle';
        checkoutLabel.value = '';
        commit.value = undefined;
        showToast(
            'success',
            c.scope === 'operator' ? `Operator default v${res.version.version} saved` : `Layout v${res.version.version} saved`,
            c.scope === 'operator' ? 'Everyone in the organization now sees this layout.' : 'Find it in Version history.',
        );
        if (c.close) {
            editing.value = false;
            setSections(res.layout.sections);
        }
    } catch (e) {
        if (commit.value) commit.value.error = (e as Error).message;
    } finally {
        saving.value = false;
    }
}

function onRestored(l: LayoutInfo): void {
    layoutInfo.value = l;
    if (!editing.value) setSections(l.sections);
    else baseline = norm(l.sections);
}
function onCheckout(e: { sections: Section[]; label: string }): void {
    historyOpen.value = false;
    if (!editing.value) {
        baseline = norm(layoutInfo.value?.sections ?? []);
        editing.value = true;
    }
    setSections(e.sections);
    checkoutLabel.value = e.label;
    showToast('info', `Opened ${e.label} in the editor`, 'Change it if you like, then Save to make it a new version.');
}

async function revert(): Promise<void> {
    try {
        layoutInfo.value = await api<LayoutInfo>(`/care/layout/${page}/user`, 'DELETE');
        setSections(layoutInfo.value.sections);
        baseline = norm(layoutInfo.value.sections);
        showToast('success', 'Layout reverted', 'The default layout is shown. Your versions stay in Version history.');
    } catch (e) {
        toastError(e);
    }
}
function exportLayout(): void {
    downloadJson(`layout-${page}.json`, { page, sections: sections.value });
}
async function importLayout(): Promise<void> {
    const text = await pickTextFile('application/json,.json');
    if (text === undefined) return;
    try {
        const parsed = JSON.parse(text) as { page?: string; sections?: unknown };
        const list = Array.isArray(parsed) ? parsed : parsed.sections;
        if (!Array.isArray(list)) throw new Error('The file has no "sections" list');
        if (parsed.page && parsed.page.toLowerCase() !== page.toLowerCase()) throw new Error(`This layout is for the ${parsed.page} page`);
        const known = catalog.value?.byKey;
        for (const s of list as Section[]) {
            if (!s?.sectionName || !Array.isArray(s.layout)) throw new Error('Every section needs a name and a tile list');
            for (const t of s.layout) {
                const def = known?.get(t.componentKey);
                if (!def) throw new Error(`Unknown tile "${t.componentKey}"`);
                if (!def.pages.includes(page)) throw new Error(`The ${def.name} tile cannot be placed on this page`);
            }
        }
        if (!editing.value) startEdit();
        setSections(list as Section[]);
        showToast('info', 'Layout imported', 'It is kept as your draft. Save to make it a version.');
    } catch (e) {
        toastError(e, 'Import failed');
    }
}
</script>

<style scoped>
.overview {
    min-height: 100%;
    background: var(--gray-100);
}
.details-section {
    position: relative;
}
.details-section.editing {
    background: var(--gray-100);
    border-bottom: 0.25rem dashed var(--blue-500);
}
.details-section.is-dragged {
    opacity: 0.45;
}
.details-section.drop-before::before,
.details-section.drop-after::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    height: 4px;
    border-radius: 2px;
    background: var(--blue-400);
    z-index: 5;
}
.details-section.drop-before::before {
    top: -0.625rem;
}
.details-section.drop-after::after {
    bottom: -0.625rem;
}
.details-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1.5rem 1.5rem 0.5rem 1.5rem;
    cursor: grab;
    user-select: none;
}
.details-handle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    margin-right: -0.25rem;
    color: var(--blue-300);
}
.details-title {
    font-size: 1.125rem;
    line-height: 1.75rem;
    font-weight: 400;
    color: var(--gray-800);
}
.details-note {
    font-size: 0.75rem;
    color: var(--gray-500);
}
.section-ghost {
    position: fixed;
    z-index: 1000;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-radius: var(--radius-xs);
    background: var(--blue-400);
    color: var(--white);
    font-size: 0.8125rem;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
    pointer-events: none;
}
.sg-name {
    font-weight: 600;
}
.sg-hint {
    opacity: 0.8;
    font-size: 0.75rem;
}
.overview.with-library {
    padding-right: 18rem;
}
.header-wrap {
    position: sticky;
    top: 0;
    z-index: 20;
    background: var(--white);
}
.header-wrap :deep(.lf-header) {
    padding: 0 var(--sp-md);
}
.header-wrap :deep(.bar) {
    padding: var(--sp-lg) 0;
}
.version-bar {
    display: flex;
    align-items: center;
    gap: var(--sp-xs);
    min-height: 2.5rem;
    padding: 0.375rem var(--sp-lg);
    border-bottom: 1px solid var(--gray-150);
    background: var(--gray-25);
    font-size: 0.75rem;
}
.version-bar.editing {
    background: var(--blue-50);
}
.vb-icon {
    color: var(--blue-300);
}
.vb-strong {
    font-weight: 600;
    color: var(--gray-800);
}
.vb-muted {
    color: var(--gray-600);
}
.vb-sep {
    color: var(--gray-300);
}
.vb-error {
    color: var(--red-600);
}
.vb-actions {
    display: flex;
    align-items: center;
    gap: var(--sp-lg);
    margin-left: auto;
}
.msisdn {
    margin-right: 1rem;
    font-size: 0.875rem;
    color: var(--gray-600);
}
.mr-4 {
    margin-right: 1rem;
}
.header-wrap :deep(.red) {
    color: var(--red-400);
}
.crumbs {
    padding: 1.5rem 1.5rem 0;
    background: var(--gray-100);
}
.loading,
.load-error {
    display: flex;
    justify-content: center;
    padding: 3rem;
    color: var(--blue-400);
}
.spin {
    animation: lf-spin 1s linear infinite;
}
@keyframes lf-spin {
    to {
        transform: rotate(360deg);
    }
}
.add-section {
    padding: 0.75rem 1.5rem 1.5rem;
    background: var(--gray-100);
}
.add-row {
    display: flex;
    align-items: flex-end;
    gap: var(--sp-xs);
    margin-top: var(--sp-xs);
}
.layout-input {
    width: 25%;
    margin-right: 1em;
}
.text {
    font-size: 0.875rem;
    color: var(--gray-600);
}
</style>
