<template>
    <div class="menu-editor">
        <p class="me-help">Drag entries to reorder, also across the line into the bottom area. Drag a sub-menu into another group to move it. Pencil: rename, icon, link. Eye: hide. Bin: delete.</p>
        <ul
            ref="listRef"
            class="me-list"
        >
            <li
                v-for="(item, i) in items"
                :key="item.key"
                :class="['me-item', { dragging: drag?.kind === 'top' && drag.active && drag.from === i, 'is-hidden': item.hidden }, topMark(i)]"
                :data-index="i"
            >
                <div
                    v-if="item.key === FOOTER_DIVIDER"
                    class="me-row me-divider"
                    data-test-id="menu-divider"
                >
                    <span>Bottom of the sidebar</span>
                </div>
                <form
                    v-else-if="editing === item.key"
                    class="me-form"
                    @submit.prevent="submitEdit(item)"
                >
                    <span class="me-form-title">Edit {{ item.original ?? item.name }}</span>
                    <input
                        :id="`me-edit-name-${item.key}`"
                        v-model="form.name"
                        class="me-input"
                        maxlength="40"
                        aria-label="Name"
                        data-test-id="me-edit-name"
                    />
                    <input
                        v-if="item.custom && item.link"
                        :id="`me-edit-link-${item.key}`"
                        v-model="form.link"
                        class="me-input"
                        list="me-pages"
                        aria-label="Link"
                        placeholder="Page (/...) or https:// address"
                    />
                    <div
                        class="me-icons"
                        role="radiogroup"
                        aria-label="Icon"
                    >
                        <button
                            v-for="ic in ICONS"
                            :key="ic"
                            type="button"
                            :class="['me-icon-pick', { on: form.icon === ic }]"
                            :aria-label="ic.split('/').pop()"
                            :aria-pressed="form.icon === ic"
                            @click="form.icon = ic"
                        >
                            <LfIcon :name="ic" />
                        </button>
                    </div>
                    <p
                        v-if="formError"
                        class="me-error"
                    >
                        {{ formError }}
                    </p>
                    <div class="me-form-actions">
                        <button
                            v-if="item.original && item.original !== item.name"
                            type="button"
                            class="me-small"
                            @click="form.name = item.original"
                        >
                            Original name
                        </button>
                        <button
                            type="button"
                            class="me-small"
                            @click="editing = ''"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            class="me-small primary"
                            data-test-id="me-edit-save"
                        >
                            Save
                        </button>
                    </div>
                </form>
                <div
                    v-else
                    class="me-row"
                    :data-test-id="`menu-row-${item.name}`"
                    @pointerdown="(e) => start(e, { kind: 'top', from: i })"
                >
                    <LfIcon
                        name="dnd-drag-handle-icon"
                        class="me-grip"
                    />
                    <LfIcon
                        v-if="item.icon"
                        :name="item.icon"
                        class="me-icon"
                    />
                    <span class="me-label">{{ item.name }}</span>
                    <button
                        type="button"
                        class="me-eye me-pen"
                        :aria-label="`Edit ${item.name}`"
                        title="Rename, change icon or link"
                        @pointerdown.stop
                        @click="openEdit(item)"
                    >
                        <LfIcon name="EditIcon" />
                    </button>
                    <button
                        type="button"
                        class="me-eye"
                        :aria-label="item.hidden ? `Show ${item.name}` : `Hide ${item.name}`"
                        :title="item.hidden ? 'Show in the menu' : 'Hide from the menu'"
                        @pointerdown.stop
                        @click="toggleHidden(i)"
                    >
                        <LfIcon :name="item.hidden ? 'EyeHideIcon' : 'EyeShowIcon'" />
                    </button>
                    <button
                        type="button"
                        :class="['me-del', { armed: armed === item.key }]"
                        :aria-label="armed === item.key ? `Confirm delete ${item.name}` : `Delete ${item.name}`"
                        :title="armed === item.key ? (item.subItems?.length ? 'Click again to delete the menu and its sub-menus' : 'Click again to delete') : 'Delete'"
                        @pointerdown.stop
                        @click="del(item.key)"
                    >
                        <LfIcon name="delete-new" />
                        <span
                            v-if="armed === item.key"
                            class="me-del-text"
                            >Delete?</span
                        >
                    </button>
                </div>
                <ul
                    v-if="item.subItems"
                    :class="['me-subs', { 'drop-end': subTarget?.group === i && subTarget.index === item.subItems.length && drag?.active }]"
                    :data-group="i"
                >
                    <li
                        v-for="(sub, j) in item.subItems"
                        :key="sub.key"
                        :class="[
                            'me-sub',
                            {
                                dragging: drag?.kind === 'sub' && drag.active && drag.group === i && drag.from === j,
                                'is-hidden': sub.hidden || item.hidden,
                                'drop-before': drag?.active && subTarget?.group === i && subTarget.index === j,
                            },
                        ]"
                        :data-test-id="`menu-sub-${sub.name}`"
                        @pointerdown.stop="(e) => start(e, { kind: 'sub', group: i, from: j })"
                    >
                        <LfIcon
                            name="dnd-drag-handle-icon"
                            class="me-grip"
                        />
                        <template v-if="editing === sub.key">
                            <input
                                :id="`me-edit-sub-${sub.key}`"
                                v-model="form.name"
                                class="me-input me-inline"
                                maxlength="40"
                                aria-label="Sub-menu name"
                                data-test-id="me-edit-sub-name"
                                @pointerdown.stop
                                @keydown.enter.prevent="submitSubEdit(sub)"
                                @keydown.esc.prevent="editing = ''"
                            />
                            <input
                                v-if="sub.custom"
                                :id="`me-edit-sub-link-${sub.key}`"
                                v-model="form.link"
                                class="me-input me-inline"
                                list="me-pages"
                                aria-label="Sub-menu link"
                                @pointerdown.stop
                                @keydown.enter.prevent="submitSubEdit(sub)"
                                @keydown.esc.prevent="editing = ''"
                            />
                            <button
                                type="button"
                                class="me-small primary"
                                data-test-id="me-edit-sub-save"
                                @pointerdown.stop
                                @click="submitSubEdit(sub)"
                            >
                                Save
                            </button>
                        </template>
                        <template v-else>
                            <span class="me-label">{{ sub.name }}</span>
                            <button
                                type="button"
                                class="me-eye me-pen"
                                :aria-label="`Edit ${sub.name}`"
                                title="Rename or change the link"
                                @pointerdown.stop
                                @click="openEdit(sub)"
                            >
                                <LfIcon name="EditIcon" />
                            </button>
                        </template>
                        <button
                            type="button"
                            class="me-eye"
                            :aria-label="sub.hidden ? `Show ${sub.name}` : `Hide ${sub.name}`"
                            :title="sub.hidden ? 'Show in the menu' : 'Hide from the menu'"
                            @pointerdown.stop
                            @click="toggleSubHidden(i, j)"
                        >
                            <LfIcon :name="sub.hidden ? 'EyeHideIcon' : 'EyeShowIcon'" />
                        </button>
                        <button
                            type="button"
                            :class="['me-del', { armed: armed === sub.key }]"
                            :aria-label="armed === sub.key ? `Confirm delete ${sub.name}` : `Delete ${sub.name}`"
                            :title="armed === sub.key ? 'Click again to delete' : 'Delete'"
                            @pointerdown.stop
                            @click="del(sub.key)"
                        >
                            <LfIcon name="delete-new" />
                            <span
                                v-if="armed === sub.key"
                                class="me-del-text"
                                >Delete?</span
                            >
                        </button>
                    </li>
                    <li
                        v-if="!item.subItems.length"
                        class="me-empty"
                    >
                        Empty group, hidden from the menu. Drop or add sub-menus here.
                    </li>
                    <li
                        v-if="adding?.kind === 'sub' && adding.group === item.key"
                        class="me-form-li"
                    >
                        <form
                            class="me-form"
                            @submit.prevent="submitSub(item.key)"
                        >
                            <input
                                :id="`me-sub-name-${item.key}`"
                                v-model="form.name"
                                class="me-input"
                                maxlength="40"
                                placeholder="Sub-menu name"
                                aria-label="Sub-menu name"
                                data-test-id="me-sub-name"
                            />
                            <input
                                :id="`me-sub-link-${item.key}`"
                                v-model="form.link"
                                class="me-input"
                                list="me-pages"
                                placeholder="Page (/...) or https:// address"
                                aria-label="Sub-menu link"
                                data-test-id="me-sub-link"
                            />
                            <p
                                v-if="formError"
                                class="me-error"
                            >
                                {{ formError }}
                            </p>
                            <div class="me-form-actions">
                                <button
                                    type="button"
                                    class="me-small"
                                    @click="adding = undefined"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    class="me-small primary"
                                    data-test-id="me-sub-add"
                                >
                                    Add
                                </button>
                            </div>
                        </form>
                    </li>
                    <li
                        v-else
                        class="me-add-sub-li"
                    >
                        <button
                            type="button"
                            class="me-add-sub"
                            :data-test-id="`me-add-sub-${item.name}`"
                            @click="openAdd({ kind: 'sub', group: item.key })"
                        >
                            <LfIcon
                                name="PlusIcon"
                                size="0.75rem"
                            />
                            Add sub-menu
                        </button>
                    </li>
                </ul>
            </li>
        </ul>
        <form
            v-if="adding?.kind === 'menu'"
            class="me-form top"
            @submit.prevent="submitMenu"
        >
            <span class="me-form-title">New menu</span>
            <input
                id="me-menu-name"
                v-model="form.name"
                class="me-input"
                maxlength="40"
                placeholder="Menu name"
                aria-label="Menu name"
                data-test-id="me-menu-name"
            />
            <div
                class="me-type"
                role="radiogroup"
                aria-label="Menu type"
            >
                <label><input
                    v-model="form.group"
                    type="radio"
                    :value="true"
                    name="me-type"
                /> Group with sub-menus</label>
                <label><input
                    v-model="form.group"
                    type="radio"
                    :value="false"
                    name="me-type"
                    data-test-id="me-menu-type-link"
                /> Single link</label>
            </div>
            <input
                v-if="!form.group"
                id="me-menu-link"
                v-model="form.link"
                class="me-input"
                list="me-pages"
                placeholder="Page (/...) or https:// address"
                aria-label="Menu link"
                data-test-id="me-menu-link"
            />
            <div
                class="me-icons"
                role="radiogroup"
                aria-label="Icon"
            >
                <button
                    v-for="ic in ICONS"
                    :key="ic"
                    type="button"
                    :class="['me-icon-pick', { on: form.icon === ic }]"
                    :aria-label="ic.split('/').pop()"
                    :aria-pressed="form.icon === ic"
                    @click="form.icon = ic"
                >
                    <LfIcon :name="ic" />
                </button>
            </div>
            <p
                v-if="formError"
                class="me-error"
            >
                {{ formError }}
            </p>
            <div class="me-form-actions">
                <button
                    type="button"
                    class="me-small"
                    @click="adding = undefined"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    class="me-small primary"
                    data-test-id="me-menu-add"
                >
                    Add menu
                </button>
            </div>
        </form>
        <button
            v-else
            type="button"
            class="me-add-menu"
            data-test-id="me-add-menu"
            @click="openAdd({ kind: 'menu' })"
        >
            <LfIcon name="PlusIcon" />
            Add menu
        </button>
        <div class="me-env">
            <span class="me-form-title">Environment label</span>
            <div class="me-env-row">
                <input
                    id="me-env-label"
                    :value="envLabel"
                    class="me-input"
                    maxlength="30"
                    aria-label="Environment label"
                    data-test-id="me-env-label"
                    @change="(e) => emit('env', { label: (e.target as HTMLInputElement).value.trim() || undefined })"
                />
                <button
                    type="button"
                    class="me-eye"
                    :aria-label="envHidden ? 'Show the environment label' : 'Hide the environment label'"
                    @click="emit('env', { hidden: !envHidden })"
                >
                    <LfIcon :name="envHidden ? 'EyeHideIcon' : 'EyeShowIcon'" />
                </button>
            </div>
        </div>
        <datalist id="me-pages">
            <option
                v-for="pg in pages"
                :key="pg.link"
                :value="pg.link"
            >
                {{ pg.name }}
            </option>
        </datalist>
        <Teleport to="body">
            <div
                v-if="drag?.active"
                class="me-ghost"
                :style="{ left: `${drag.x + 14}px`, top: `${drag.y + 8}px` }"
            >
                <LfIcon name="dnd-drag-handle-icon" />
                {{ dragLabel }}
            </div>
        </Teleport>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import LfIcon from '../ui/LfIcon.vue';
import { FOOTER_DIVIDER } from '../../lib/menuArrangement.ts';
import type { ArrangedItem, ArrangedSub } from '../../lib/menuArrangement.ts';

/** Sidebar menu editor: drag top-level entries and sub-entries (also between groups), hide entries. */
const props = defineProps<{ items: ArrangedItem[]; pages: { name: string; link: string }[]; icons: string[]; envLabel: string; envHidden: boolean }>();
const emit = defineEmits<{
    edit: [string, { name: string; icon?: string; link?: string }];
    env: [{ label?: string; hidden?: boolean }];
    change: [ArrangedItem[]];
    addMenu: [{ name: string; icon: string; link?: string; group: boolean }];
    addSub: [string, { name: string; link?: string }];
    remove: [string];
}>();

// add and delete
const ICONS = computed(() => props.icons);
const adding = ref<{ kind: 'menu' } | { kind: 'sub'; group: string }>();
const form = ref({ name: '', link: '', icon: '', group: true });
const formError = ref('');
function openAdd(a: { kind: 'menu' } | { kind: 'sub'; group: string }): void {
    adding.value = a;
    form.value = { name: '', link: '', icon: props.icons[0] ?? '', group: true };
    formError.value = '';
}
const linkOk = (l: string) => !l || (/^\/(?!\/)\S*$/.test(l) || /^https:\/\/\S+$/.test(l));
function check(needsLink: boolean): boolean {
    const name = form.value.name.trim();
    const link = form.value.link.trim();
    if (!name) formError.value = 'Enter a name.';
    else if (needsLink && !linkOk(link)) formError.value = 'The link must be a portal page starting with / or a web address starting with https://';
    else formError.value = '';
    return !formError.value;
}
function submitMenu(): void {
    if (!check(!form.value.group)) return;
    emit('addMenu', { name: form.value.name.trim(), icon: form.value.icon, link: form.value.group ? undefined : form.value.link.trim() || undefined, group: form.value.group });
    adding.value = undefined;
}
function submitSub(group: string): void {
    if (!check(true)) return;
    emit('addSub', group, { name: form.value.name.trim(), link: form.value.link.trim() || undefined });
    adding.value = undefined;
}
// edit (rename, icon, link)
const editing = ref('');
function openEdit(e: ArrangedItem | ArrangedSub): void {
    adding.value = undefined;
    editing.value = e.key;
    form.value = { name: e.name, link: e.link ?? '', icon: 'icon' in e ? e.icon : '', group: false };
    formError.value = '';
}
function submitEdit(item: ArrangedItem): void {
    if (!check(!!(item.custom && item.link))) return;
    emit('edit', item.key, { name: form.value.name.trim(), icon: form.value.icon || undefined, ...(item.custom && item.link ? { link: form.value.link.trim() } : {}) });
    editing.value = '';
}
function submitSubEdit(sub: ArrangedSub): void {
    if (!form.value.name.trim() || (sub.custom && !linkOk(form.value.link.trim()))) return;
    emit('edit', sub.key, { name: form.value.name.trim(), ...(sub.custom ? { link: form.value.link.trim() } : {}) });
    editing.value = '';
}
const armed = ref('');
let armTimer: ReturnType<typeof setTimeout> | undefined;
function del(key: string): void {
    clearTimeout(armTimer);
    if (armed.value !== key) {
        armed.value = key;
        armTimer = setTimeout(() => (armed.value = ''), 3000);
        return;
    }
    armed.value = '';
    emit('remove', key);
}

type Source = { kind: 'top'; from: number } | { kind: 'sub'; group: number; from: number };
type DragState = Source & { active: boolean; x: number; y: number; sx: number; sy: number; to?: number };
const drag = ref<DragState>();
const subTarget = ref<{ group: number; index: number }>();
const listRef = ref<HTMLElement>();

const clone = (): ArrangedItem[] => JSON.parse(JSON.stringify(props.items)) as ArrangedItem[];
const dragLabel = computed(() => {
    const d = drag.value;
    if (!d) return '';
    return d.kind === 'top' ? props.items[d.from]?.name : props.items[d.group]?.subItems?.[d.from]?.name;
});

function topMark(i: number): string {
    const d = drag.value;
    if (!d?.active || d.kind !== 'top' || d.to === undefined || d.to === d.from || d.to === d.from + 1) return '';
    if (d.to === i) return 'drop-before';
    if (d.to === props.items.length && i === props.items.length - 1) return 'drop-after';
    return '';
}

function toggleHidden(i: number): void {
    const next = clone();
    next[i]!.hidden = !next[i]!.hidden;
    emit('change', next);
}
function toggleSubHidden(i: number, j: number): void {
    const next = clone();
    const sub = next[i]!.subItems![j]!;
    sub.hidden = !sub.hidden;
    emit('change', next);
}

const scroller = () => listRef.value?.closest<HTMLElement>('.nav') ?? null;
let tick: ReturnType<typeof setInterval> | undefined;

function topTarget(y: number): number {
    const els = [...(listRef.value?.querySelectorAll<HTMLElement>(':scope > .me-item > .me-row') ?? [])];
    const idx = els.findIndex((el) => {
        const r = el.getBoundingClientRect();
        return y < r.top + r.height / 2;
    });
    return idx === -1 ? els.length : idx;
}
function findSubTarget(x: number, y: number): { group: number; index: number } | undefined {
    const items = [...(listRef.value?.querySelectorAll<HTMLElement>(':scope > .me-item') ?? [])];
    for (const li of items) {
        const r = li.getBoundingClientRect();
        if (y < r.top || y > r.bottom || x < r.left - 40 || x > r.right + 40) continue;
        const subs = li.querySelector<HTMLElement>(':scope > .me-subs');
        if (!subs) return undefined; // a single link cannot hold sub-entries
        const group = Number(subs.dataset.group);
        const rows = [...subs.querySelectorAll<HTMLElement>(':scope > .me-sub')];
        const idx = rows.findIndex((row) => {
            const rr = row.getBoundingClientRect();
            return y < rr.top + rr.height / 2;
        });
        return { group, index: idx === -1 ? rows.length : idx };
    }
    return undefined;
}
function update(): void {
    const d = drag.value;
    if (!d?.active) return;
    if (d.kind === 'top') d.to = topTarget(d.y);
    else subTarget.value = findSubTarget(d.x, d.y);
}

function start(e: PointerEvent, src: Source): void {
    if (e.button !== 0 || drag.value) return;
    drag.value = { ...src, active: false, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey);
}
function onMove(e: PointerEvent): void {
    const d = drag.value;
    if (!d) return;
    d.x = e.clientX;
    d.y = e.clientY;
    if (!d.active) {
        if (Math.hypot(d.x - d.sx, d.y - d.sy) < 5) return;
        d.active = true;
        document.body.classList.add('lf-dragging');
        tick = setInterval(() => {
            const el = scroller();
            const cur = drag.value;
            if (!el || !cur) return;
            const r = el.getBoundingClientRect();
            if (cur.y < r.top + 40) el.scrollTop -= 8;
            else if (cur.y > r.bottom - 40) el.scrollTop += 8;
            update();
        }, 16);
    }
    update();
}
function finish(drop: boolean): void {
    clearInterval(tick);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('keydown', onKey);
    const d = drag.value;
    const target = subTarget.value;
    drag.value = undefined;
    subTarget.value = undefined;
    if (!d?.active) return;
    document.body.classList.remove('lf-dragging');
    // the release must not also follow the link under the pointer
    const swallow = (ev: Event) => {
        ev.stopPropagation();
        ev.preventDefault();
    };
    window.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
    if (!drop) return;
    const next = clone();
    if (d.kind === 'top') {
        const to = d.to ?? d.from;
        if (to === d.from || to === d.from + 1) return;
        const [moved] = next.splice(d.from, 1);
        next.splice(to > d.from ? to - 1 : to, 0, moved!);
    } else {
        if (!target) return;
        const fromList = next[d.group]!.subItems!;
        const toList = next[target.group]!.subItems!;
        let index = target.index;
        if (target.group === d.group) {
            if (index === d.from || index === d.from + 1) return;
            if (index > d.from) index -= 1;
        }
        const [moved] = fromList.splice(d.from, 1);
        toList.splice(index, 0, moved!);
    }
    emit('change', next);
}
const onUp = () => finish(true);
const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') finish(false);
};
onBeforeUnmount(() => finish(false));
</script>

<style scoped>
.menu-editor {
    display: flex;
    flex-direction: column;
    gap: var(--sp-xs);
    padding: 0 var(--sp-xs) var(--sp-md) var(--sp-xs);
}
.me-help {
    padding: 0 var(--sp-xs);
    font-size: 0.75rem;
    line-height: 1.1rem;
    color: var(--gray-500);
}
.me-list,
.me-subs {
    margin: 0;
    padding: 0;
    list-style: none;
}
.me-item {
    position: relative;
    border-radius: 8px;
}
.me-row,
.me-sub {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    height: 2.25rem;
    padding: 0 0.25rem 0 0.375rem;
    border-radius: 6px;
    color: var(--gray-600);
    font-size: 0.875rem;
    cursor: grab;
    user-select: none;
    touch-action: none;
}
.me-row:hover,
.me-sub:hover {
    background: var(--gray-100);
}
.me-sub {
    height: 2rem;
    margin-left: 1.5rem;
    font-size: 0.8125rem;
}
.me-grip {
    flex-shrink: 0;
    color: var(--gray-400);
}
.me-icon {
    flex-shrink: 0;
    color: var(--gray-600);
}
.me-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.me-eye {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    flex-shrink: 0;
    border-radius: var(--radius-xxs);
    color: var(--blue-300);
    cursor: pointer;
}
.me-eye:hover {
    background: var(--white);
    color: var(--blue-400);
}
.is-hidden > .me-row .me-label,
.me-sub.is-hidden .me-label {
    color: var(--gray-400);
    text-decoration: line-through;
}
.dragging > .me-row,
.me-sub.dragging {
    opacity: 0.4;
}
.me-item.drop-before::before,
.me-item.drop-after::after,
.me-sub.drop-before::before,
.me-subs.drop-end::after {
    content: '';
    position: absolute;
    left: 0.25rem;
    right: 0.25rem;
    height: 3px;
    border-radius: 2px;
    background: var(--blue-400);
    z-index: 2;
}
.me-item.drop-before::before {
    top: -2px;
}
.me-item.drop-after::after {
    bottom: -2px;
}
.me-sub.drop-before::before {
    top: -2px;
    left: 0;
}
.me-subs {
    position: relative;
}
.me-subs.drop-end::after {
    bottom: -1px;
    left: 1.5rem;
}
.me-empty {
    margin: 0.125rem 0 0.25rem 1.5rem;
    padding: 0.375rem 0.5rem;
    border: 1px dashed var(--gray-300);
    border-radius: 6px;
    font-size: 0.75rem;
    color: var(--gray-500);
}
.me-del {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    height: 1.5rem;
    min-width: 1.5rem;
    justify-content: center;
    flex-shrink: 0;
    border-radius: var(--radius-xxs);
    color: var(--gray-400);
    cursor: pointer;
}
.me-del:hover {
    color: var(--red-400);
    background: var(--white);
}
.me-del.armed {
    padding: 0 0.375rem;
    color: var(--white);
    background: var(--red-400);
}
.me-del-text {
    font-size: 0.6875rem;
    font-weight: 600;
}
.me-add-sub-li,
.me-form-li {
    margin-left: 1.5rem;
}
.me-add-sub {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    height: 1.75rem;
    padding: 0 0.5rem;
    border-radius: 6px;
    font-size: 0.75rem;
    color: var(--blue-400);
    cursor: pointer;
}
.me-add-sub:hover,
.me-add-menu:hover {
    background: var(--blue-100);
}
.me-add-menu {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    height: 2.25rem;
    margin: 0 0.25rem;
    border: 1px dashed var(--blue-300);
    border-radius: 6px;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--blue-400);
    cursor: pointer;
}
.me-form {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    padding: 0.5rem;
    margin: 0.25rem 0;
    border-radius: 6px;
    background: var(--white);
    box-shadow: inset 0 0 0 1px var(--gray-200);
}
.me-form.top {
    margin: 0 0.25rem;
}
.me-form-title {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--gray-800);
}
.me-input {
    height: 2rem;
    padding: 0 0.5rem;
    border: 0;
    border-radius: var(--radius-xxs);
    box-shadow: inset 0 0 0 1px var(--gray-300);
    font: inherit;
    font-size: 0.8125rem;
    outline: none;
    min-width: 0;
}
.me-input:focus {
    box-shadow: inset 0 0 0 1px var(--blue-400);
}
.me-type {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    font-size: 0.75rem;
    color: var(--gray-700, #374151);
}
.me-type label {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    cursor: pointer;
}
.me-icons {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 0.25rem;
}
.me-icon-pick {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 1.75rem;
    border-radius: var(--radius-xxs);
    color: var(--gray-600);
    cursor: pointer;
}
.me-icon-pick:hover {
    background: var(--gray-100);
}
.me-icon-pick.on {
    color: var(--white);
    background: var(--blue-400);
}
.me-error {
    font-size: 0.6875rem;
    color: var(--red-600);
}
.me-form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.375rem;
}
.me-small {
    padding: 0.25rem 0.625rem;
    border-radius: var(--radius-xxs);
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--blue-400);
    box-shadow: inset 0 0 0 1px var(--blue-300);
    cursor: pointer;
}
.me-small.primary {
    color: var(--white);
    background: var(--blue-400);
    box-shadow: none;
}
.me-divider {
    cursor: default;
    margin: 0.5rem 0;
    height: 1.75rem;
    border-top: 2px solid var(--gray-200);
    border-radius: 0;
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--gray-500);
}
.me-divider:hover {
    background: transparent;
}
.me-inline {
    height: 1.625rem;
    flex: 1;
    font-size: 0.75rem;
}
.me-env {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin: 0.25rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--gray-200);
}
.me-env-row {
    display: flex;
    align-items: center;
    gap: 0.375rem;
}
.me-env-row .me-input {
    flex: 1;
}
.me-ghost {
    position: fixed;
    z-index: 1000;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.75rem;
    border-radius: var(--radius-xs);
    background: var(--blue-400);
    color: var(--white);
    font-size: 0.8125rem;
    font-weight: 600;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
    pointer-events: none;
}
</style>
