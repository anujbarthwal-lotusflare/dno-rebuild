<template>
    <div class="lf-table">
        <div
            v-if="!hideHeader"
            class="header"
        >
            <div class="title-wrap">
                <h1
                    v-if="title"
                    class="title"
                >
                    {{ title }}
                </h1>
                <span
                    v-if="title && showCount"
                    class="count"
                    >({{ filtered.length }})</span
                >
                <slot name="headerLeft" />
            </div>
            <div class="actions">
                <LfSearch
                    v-if="showSearch"
                    v-model="query"
                    :width="searchWidth"
                />
                <div
                    v-if="showFilter"
                    ref="filterRef"
                    class="filter-wrap"
                >
                    <LfButton
                        variant="secondary"
                        icon="FilterIcon"
                        label="Filter"
                        :active="filterOpen"
                        @click="filterOpen = !filterOpen"
                    />
                    <div
                        v-if="filterOpen"
                        class="filter-pop"
                    >
                        <LfSelect
                            v-model="draft.column"
                            label="Column"
                            :options="visibleColumns.map((c) => ({ value: c.key, label: c.label }))"
                            placeholder="Select column"
                        />
                        <LfSelect
                            v-model="draft.operator"
                            label="Condition"
                            :options="FILTER_OPERATORS"
                        />
                        <LfInput
                            v-if="draft.operator !== 'isEmpty' && draft.operator !== 'isNotEmpty'"
                            v-model="draft.value"
                            label="Value"
                            placeholder="Value"
                        />
                        <div class="filter-actions">
                            <LfButton
                                variant="tertiary_m"
                                label="Cancel"
                                @click="filterOpen = false"
                            />
                            <LfButton
                                label="Apply"
                                :disabled="!draft.column"
                                @click="applyDraft"
                            />
                        </div>
                    </div>
                </div>
                <button
                    v-if="showJson"
                    type="button"
                    class="icon-btn"
                    title="Show data as JSON"
                    aria-label="Show data as JSON"
                    @click="jsonOpen = true"
                >
                    <LfIcon name="CurlyBracketsIcon" />
                </button>
                <slot name="headerActions" />
            </div>
        </div>
        <div
            v-if="filters.length"
            class="filter-tags"
        >
            <LfTag
                v-for="(f, i) in filters"
                :key="i"
                color="white"
                closable
                :label="filterLabel(f)"
                @close="filters.splice(i, 1)"
            />
            <LfButton
                variant="tertiary_s"
                label="Clear all"
                @click="filters.splice(0)"
            />
        </div>
        <div class="scroll lf-scroll">
            <table>
                <thead>
                    <tr>
                        <th
                            v-if="selectable"
                            class="sel"
                        >
                            <LfCheckbox
                                :model-value="allSelected"
                                :indeterminate="someSelected"
                                @update:model-value="toggleAll"
                            />
                        </th>
                        <th
                            v-for="col in visibleColumns"
                            :key="col.key"
                            :style="col.width ? { width: col.width } : undefined"
                            :class="{ sortable: col.sortable !== false }"
                            @click="col.sortable !== false && sortBy(col.key)"
                        >
                            <span class="th-inner">
                                <span class="th-text">{{ col.label }}</span>
                                <LfIcon
                                    v-if="sort.key === col.key"
                                    :name="sort.dir === 'asc' ? 'ArrowUpIcon' : 'ArrowDownIcon'"
                                    size="0.75rem"
                                    class="sort-icon"
                                />
                            </span>
                        </th>
                        <th
                            v-if="hasActions || canSelectColumns"
                            class="act"
                        >
                            <div
                                v-if="canSelectColumns"
                                ref="colsRef"
                                class="cols-wrap"
                            >
                                <button
                                    type="button"
                                    class="icon-btn small"
                                    aria-label="Select columns"
                                    @click.stop="colsOpen = !colsOpen"
                                >
                                    <LfIcon name="ContainedPlusIcon" />
                                </button>
                                <div
                                    v-if="colsOpen"
                                    class="cols-pop"
                                    @click.stop
                                >
                                    <div class="cols-title">Columns</div>
                                    <LfCheckbox
                                        v-for="col in columns"
                                        :key="col.key"
                                        class="col-opt"
                                        :model-value="!hidden.has(col.key)"
                                        :label="col.label"
                                        @update:model-value="toggleColumn(col.key)"
                                    />
                                </div>
                            </div>
                        </th>
                    </tr>
                </thead>
                <tbody v-if="!loading || pageRows.length">
                    <template
                        v-for="row in pageRows"
                        :key="keyOf(row.row)"
                    >
                        <tr
                            :class="['row', { clickable: clickable || isTree, child: row.depth > 0, selected: isSelected(row.row) }]"
                            @click="onRowClick(row)"
                        >
                            <td
                                v-if="selectable"
                                class="sel"
                                @click.stop
                            >
                                <LfCheckbox
                                    :model-value="isSelected(row.row)"
                                    :disabled="isRowDisabled?.(row.row)"
                                    @update:model-value="toggleRow(row.row)"
                                />
                            </td>
                            <td
                                v-for="(col, ci) in visibleColumns"
                                :key="col.key"
                                :class="{ first: ci === 0 }"
                            >
                                <div
                                    class="cell"
                                    :style="ci === 0 && isTree ? { paddingLeft: `${row.depth * 1.75}rem` } : undefined"
                                >
                                    <span
                                        v-if="ci === 0 && isTree && row.depth > 0"
                                        class="tree-line"
                                    />
                                    <button
                                        v-if="ci === 0 && isTree && row.hasChildren"
                                        type="button"
                                        class="caret"
                                        :aria-label="row.expanded ? 'Collapse' : 'Expand'"
                                        @click.stop="toggleExpand(row.row)"
                                    >
                                        <LfIcon
                                            name="CaretDownIcon"
                                            size="0.75rem"
                                            :style="{ transform: row.expanded ? 'none' : 'rotate(-90deg)' }"
                                        />
                                    </button>
                                    <slot
                                        :name="`cell-${col.key}`"
                                        :row="row.row"
                                        :value="row.row[col.key]"
                                    >
                                        <LfTag
                                            v-if="(col.type === 'status' || col.type === 'method' || col.type === 'code') && display(row.row, col)"
                                            :label="display(row.row, col)"
                                            :color="col.type === 'code' ? (Number(row.row[col.key]) < 400 ? 'green' : 'red') : undefined"
                                        />
                                        <span
                                            v-else-if="col.type === 'tags'"
                                            class="tags"
                                        >
                                            <LfTag
                                                v-for="t in (row.row[col.key] as string[]) ?? []"
                                                :key="t"
                                                :label="t"
                                                color="gray"
                                            />
                                        </span>
                                        <a
                                            v-else-if="col.type?.startsWith('link:') && display(row.row, col)"
                                            class="link ellipsis cell-text"
                                            :title="display(row.row, col)"
                                            @click.stop="emit('link', { type: col.type!.slice(5), id: String(row.row[col.key]), row: row.row })"
                                            >{{ display(row.row, col) }}</a
                                        >
                                        <span
                                            v-else
                                            :class="['cell-text', 'ellipsis', { mono: col.type === 'mono' && false }]"
                                            :title="display(row.row, col)"
                                            >{{ display(row.row, col) || (isTree ? '-' : '') }}</span
                                        >
                                    </slot>
                                </div>
                            </td>
                            <td
                                v-if="hasActions || canSelectColumns"
                                class="act"
                                @click.stop
                            >
                                <LfDropdownMenu
                                    v-if="hasActions && actionsFor(row.row).length"
                                    :items="actionsFor(row.row)"
                                >
                                    <template #trigger>
                                        <button
                                            type="button"
                                            class="icon-btn small more"
                                            aria-label="Row actions"
                                        >
                                            <LfIcon name="MoreIcon" />
                                        </button>
                                    </template>
                                </LfDropdownMenu>
                            </td>
                        </tr>
                    </template>
                </tbody>
            </table>
            <div
                v-if="loading && !pageRows.length"
                class="spinner"
            >
                <LfIcon
                    name="SpinnerIcon"
                    size="1.5rem"
                    class="spin"
                />
            </div>
        </div>
        <LfEmptyState
            v-if="!loading && error"
            :error="error"
        />
        <LfEmptyState
            v-else-if="!loading && rows.length && !filtered.length"
            description="No matching results found"
            icon="EmptyListSearchIcon"
            button-text="Clear Filter"
            @click="clearAll"
        />
        <LfEmptyState
            v-else-if="!loading && !rows.length"
            :description="emptyText"
        />
        <LfPagination
            v-if="paginate && filtered.length"
            v-model:page="page"
            v-model:page-size="pageSize"
            :total="filtered.length"
        />
        <LfModal
            v-if="jsonOpen"
            title="Data"
            width="50rem"
            @close="jsonOpen = false"
        >
            <pre class="json lf-scroll">{{ JSON.stringify(raw ?? rows, null, 2) }}</pre>
            <template #footer>
                <LfButton
                    variant="secondary"
                    icon="CopyIcon"
                    label="Copy"
                    @click="copy"
                />
                <LfButton
                    label="Close"
                    @click="jsonOpen = false"
                />
            </template>
        </LfModal>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import LfButton from './LfButton.vue';
import LfCheckbox from './LfCheckbox.vue';
import LfDropdownMenu from './LfDropdownMenu.vue';
import LfEmptyState from './LfEmptyState.vue';
import LfIcon from './LfIcon.vue';
import LfInput from './LfInput.vue';
import LfModal from './LfModal.vue';
import LfPagination from './LfPagination.vue';
import LfSearch from './LfSearch.vue';
import LfSelect from './LfSelect.vue';
import LfTag from './LfTag.vue';
import { FILTER_OPERATORS, applyFilters, searchRows } from '../../lib/search.ts';
import type { FilterItem, FilterOperator } from '../../lib/search.ts';
import { fmtDateTime, fmtMoney } from '../../lib/format.ts';
import { statusLabel } from '../../lib/status.ts';
import { copyText } from '../../lib/api.ts';
import { showToast } from '../../lib/toast.ts';
import type { Column, RowAction } from '../../lib/types.ts';

type Row = Record<string, unknown>;

/**
 * Table with the portal's TableHeader (search, filter, JSON view, header actions), column picker,
 * sorting, row actions, optional selection and tree rows, empty states and pagination.
 */
const props = withDefaults(
    defineProps<{
        columns: Column[];
        rows: Row[];
        title?: string;
        showCount?: boolean;
        rowKey?: string;
        loading?: boolean;
        error?: string;
        emptyText?: string;
        showSearch?: boolean;
        showFilter?: boolean;
        showJson?: boolean;
        hideHeader?: boolean;
        canSelectColumns?: boolean;
        clickable?: boolean;
        rowActions?: (row: Row) => RowAction[];
        selectable?: boolean;
        selected?: string[];
        isRowDisabled?: (row: Row) => boolean;
        paginate?: boolean;
        defaultPageSize?: number;
        raw?: unknown;
        searchWidth?: string;
    }>(),
    {
        rowKey: 'id',
        emptyText: 'No data',
        showSearch: true,
        showFilter: true,
        showJson: true,
        canSelectColumns: true,
        paginate: true,
        defaultPageSize: 10,
        selected: () => [],
    },
);
const emit = defineEmits<{ rowClick: [Row]; link: [{ type: string; id: string; row: Row }]; 'update:selected': [string[]] }>();

const query = ref('');
const filters = reactive<FilterItem[]>([]);
const filterOpen = ref(false);
const draft = reactive<{ column: string | null; operator: FilterOperator; value: string }>({ column: null, operator: 'contains', value: '' });
const jsonOpen = ref(false);
const colsOpen = ref(false);
const hidden = reactive(new Set<string>());
const sort = reactive<{ key: string; dir: 'asc' | 'desc' }>({ key: '', dir: 'asc' });
const page = ref(0);
const pageSize = ref(props.defaultPageSize);
const collapsed = reactive(new Set<string>());
const filterRef = ref<HTMLElement>();
const colsRef = ref<HTMLElement>();

const visibleColumns = computed(() => props.columns.filter((c) => !hidden.has(c.key)));
const hasActions = computed(() => Boolean(props.rowActions));
const isTree = computed(() => props.rows.some((r) => Array.isArray(r.children)));

function display(row: Row, col: Column): string {
    if (col.format) return col.format(row);
    const v = row[col.key];
    if (v === null || v === undefined) return '';
    switch (col.type) {
        case 'date':
            return fmtDateTime(v);
        case 'money':
            return fmtMoney(v);
        case 'status':
            return statusLabel(v);
        case 'boolean':
            return v ? 'Yes' : 'No';
        case 'tags':
            return Array.isArray(v) ? v.join(', ') : String(v);
        default:
            return typeof v === 'object' ? JSON.stringify(v) : String(v);
    }
}
const displayByKey = (row: Row, key: string) => {
    const col = props.columns.find((c) => c.key === key);
    return col ? display(row, col) : String(row[key] ?? '');
};

const keyOf = (row: Row): string => String(row[props.rowKey] ?? JSON.stringify(row));

const filtered = computed(() => {
    let list = searchRows(props.rows, query.value);
    list = applyFilters(list, filters, displayByKey);
    if (sort.key) {
        const col = props.columns.find((c) => c.key === sort.key);
        const val = (r: Row) => {
            const v = r[sort.key];
            if (col?.type === 'money' && v && typeof v === 'object') return Number((v as { value: number }).value);
            if (typeof v === 'number') return v;
            return col ? display(r, col).toLowerCase() : String(v ?? '');
        };
        list = [...list].sort((a, b) => {
            const x = val(a);
            const y = val(b);
            const c = typeof x === 'number' && typeof y === 'number' ? x - y : col?.type === 'date' ? String(a[sort.key] ?? '').localeCompare(String(b[sort.key] ?? '')) : String(x).localeCompare(String(y));
            return sort.dir === 'asc' ? c : -c;
        });
    }
    return list;
});

interface FlatRow {
    row: Row;
    depth: number;
    hasChildren: boolean;
    expanded: boolean;
}
const pageRows = computed<FlatRow[]>(() => {
    const top = props.paginate ? filtered.value.slice(page.value * pageSize.value, (page.value + 1) * pageSize.value) : filtered.value;
    const out: FlatRow[] = [];
    const walk = (rows: Row[], depth: number) => {
        for (const r of rows) {
            const kids = Array.isArray(r.children) ? (r.children as Row[]) : [];
            const expanded = !collapsed.has(keyOf(r));
            out.push({ row: r, depth, hasChildren: kids.length > 0, expanded });
            if (kids.length && expanded) walk(kids, depth + 1);
        }
    };
    walk(top, 0);
    return out;
});

watch([query, () => filters.length, pageSize], () => {
    page.value = 0;
});
watch(
    () => filtered.value.length,
    (n) => {
        if (page.value * pageSize.value >= n) page.value = Math.max(0, Math.ceil(n / pageSize.value) - 1);
    },
);

function sortBy(key: string): void {
    if (sort.key !== key) {
        sort.key = key;
        sort.dir = 'asc';
    } else if (sort.dir === 'asc') sort.dir = 'desc';
    else sort.key = '';
}
function toggleColumn(key: string): void {
    if (hidden.has(key)) hidden.delete(key);
    else if (visibleColumns.value.length > 1) hidden.add(key);
}
function toggleExpand(row: Row): void {
    const k = keyOf(row);
    if (collapsed.has(k)) collapsed.delete(k);
    else collapsed.add(k);
}
function onRowClick(r: FlatRow): void {
    if (props.clickable) emit('rowClick', r.row);
    else if (r.hasChildren) toggleExpand(r.row);
}
const actionsFor = (row: Row): RowAction[] => props.rowActions?.(row) ?? [];

const filterLabel = (f: FilterItem) => {
    const col = props.columns.find((c) => c.key === f.column)?.label ?? f.column;
    const op = FILTER_OPERATORS.find((o) => o.value === f.operator)?.label.toLowerCase() ?? f.operator;
    return f.operator === 'isEmpty' || f.operator === 'isNotEmpty' ? `${col} ${op}` : `${col} ${op} "${f.value}"`;
};
function applyDraft(): void {
    if (!draft.column) return;
    filters.push({ column: draft.column, operator: draft.operator, value: draft.value });
    draft.value = '';
    filterOpen.value = false;
}
function clearAll(): void {
    query.value = '';
    filters.splice(0);
}

// selection
const selectableRows = computed(() => filtered.value.filter((r) => !props.isRowDisabled?.(r)));
const isSelected = (row: Row) => props.selected.includes(keyOf(row));
const allSelected = computed(() => selectableRows.value.length > 0 && selectableRows.value.every(isSelected));
const someSelected = computed(() => !allSelected.value && selectableRows.value.some(isSelected));
function toggleRow(row: Row): void {
    const k = keyOf(row);
    emit('update:selected', isSelected(row) ? props.selected.filter((x) => x !== k) : [...props.selected, k]);
}
function toggleAll(on: boolean): void {
    emit('update:selected', on ? selectableRows.value.map(keyOf) : []);
}

async function copy(): Promise<void> {
    await copyText(JSON.stringify(props.raw ?? props.rows, null, 2));
    showToast('success', 'Copied to clipboard');
}

const onDoc = (e: MouseEvent) => {
    const t = e.target as Node;
    if (filterOpen.value && filterRef.value && !filterRef.value.contains(t) && !(t as HTMLElement).closest?.('.lf-select-menu')) filterOpen.value = false;
    if (colsOpen.value && colsRef.value && !colsRef.value.contains(t)) colsOpen.value = false;
};
onMounted(() => document.addEventListener('mousedown', onDoc));
onBeforeUnmount(() => document.removeEventListener('mousedown', onDoc));

defineExpose({ clearAll });
</script>

<style scoped>
.lf-table {
    width: 100%;
    min-width: 0;
}
.header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-lg);
    padding: 0.25rem 0 1rem 0;
}
.title-wrap {
    display: flex;
    align-items: center;
    gap: var(--sp-xs);
    min-width: 0;
}
.title {
    font-size: 1.25rem;
    line-height: 2rem;
    font-weight: 600;
}
.count {
    font-size: 0.875rem;
    color: var(--gray-600);
}
.actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--sp-md);
    margin-left: auto;
    min-width: 0;
}
.icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    flex-shrink: 0;
    border-radius: var(--radius-xxs);
    color: var(--blue-300);
}
.icon-btn:hover {
    background: var(--gray-100);
    color: var(--blue-400);
}
.icon-btn.more {
    color: var(--blue-400);
}
.filter-wrap {
    position: relative;
}
.filter-pop {
    position: absolute;
    right: 0;
    top: calc(100% + 0.25rem);
    z-index: 30;
    width: 18rem;
    display: flex;
    flex-direction: column;
    gap: var(--sp-sm);
    padding: var(--sp-md);
    background: var(--white);
    border-radius: var(--radius-xs);
    box-shadow: var(--shadow-gray-s);
}
.filter-actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: var(--sp-md);
}
.filter-tags {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-xs);
    padding-bottom: var(--sp-sm);
}
.scroll {
    position: relative;
    width: 100%;
    overflow-x: auto;
}
table {
    width: 100%;
    border-collapse: collapse;
    table-layout: auto;
}
th {
    position: relative;
    padding: var(--sp-md) var(--sp-sm);
    border-bottom: 1px solid var(--gray-150);
    text-align: left;
    font-size: 0.75rem;
    line-height: 1rem;
    font-weight: 600;
    color: var(--gray-800);
    white-space: nowrap;
    background: var(--white);
}
th.sortable {
    cursor: pointer;
}
th:hover {
    background: var(--gray-50);
}
th:first-child,
td:first-child {
    padding-left: var(--sp-2xl);
}
th:last-child,
td:last-child {
    padding-right: var(--sp-3xl);
}
th.act,
td.act {
    width: 3rem;
    padding-right: var(--sp-md);
    text-align: right;
}
th.sel,
td.sel {
    width: 2.5rem;
    padding-right: 0;
}
.th-inner {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-xs);
}
.sort-icon {
    color: var(--blue-400);
}
td {
    padding: var(--sp-sm);
    border-bottom: 1px solid var(--gray-150);
    font-size: 0.875rem;
    line-height: 1.5rem;
    color: var(--gray-600);
    vertical-align: middle;
    max-width: 16rem;
}
.row {
    transition: background 0.2s;
}
.row:hover {
    background: var(--gray-25);
}
.row.clickable {
    cursor: pointer;
}
.row.selected {
    background: var(--gray-50);
}
.cell {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--sp-xs);
    min-width: 0;
}
.cell-text {
    display: block;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.tags {
    display: inline-flex;
    flex-wrap: wrap;
    gap: var(--sp-xxs);
}
.caret {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1rem;
    margin-left: -1.5rem;
    margin-right: 0.5rem;
    color: var(--blue-300);
}
.tree-line {
    position: absolute;
    left: calc(var(--sp-xs) * -1);
    top: -0.75rem;
    bottom: 50%;
    width: 0.75rem;
    border-left: 1px solid var(--gray-200);
    border-bottom: 1px solid var(--gray-200);
}
.row.child .cell {
    margin-left: -0.25rem;
}
.cols-wrap {
    position: relative;
    display: inline-flex;
}
.cols-pop {
    position: absolute;
    right: 0;
    top: calc(100% + 0.25rem);
    z-index: 30;
    min-width: 12rem;
    max-height: 18rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--sp-xs);
    padding: var(--sp-sm);
    text-align: left;
    background: var(--white);
    border-radius: var(--radius-xs);
    box-shadow: var(--shadow-gray-s);
}
.cols-title {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--gray-800);
}
.col-opt :deep(.text) {
    font-weight: 400;
    font-size: 0.75rem;
}
.spinner {
    display: flex;
    height: 7rem;
    align-items: center;
    justify-content: center;
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
.json {
    margin: 0;
    max-height: 60vh;
    overflow: auto;
    padding: var(--sp-md);
    background: var(--gray-50);
    border-radius: var(--radius-xs);
    font-size: 0.75rem;
    line-height: 1.125rem;
    color: var(--gray-800);
}
</style>
