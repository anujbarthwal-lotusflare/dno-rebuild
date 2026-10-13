<template>
    <div class="table-tile">
        <dl
            v-if="items"
            class="kv"
        >
            <template
                v-for="it in items"
                :key="it.label"
            >
                <dt>{{ it.label }}</dt>
                <dd>{{ looksLikeDate(it.value) ? fmtDateTime(it.value) : it.value }}</dd>
            </template>
        </dl>
        <LfDataTable
            v-else
            :columns="columns"
            :rows="rows"
            :loading="loading"
            :error="error"
            :raw="data"
            clickable
            :row-key="rowKey"
            @row-click="openRow"
            @link="openLink"
        />
        <LfSidePanel
            :visible="!!selected"
            :header="tile.name"
            :cards="panelCards"
            @close="selected = undefined"
        />
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import LfDataTable from '../components/ui/LfDataTable.vue';
import LfSidePanel from '../components/ui/LfSidePanel.vue';
import { api, useLoad } from '../lib/api.ts';
import { fmtDateTime, fmtMoney } from '../lib/format.ts';
import { statusLabel } from '../lib/status.ts';
import type { Column, EntityType, SidePanelCard, TileDefinition } from '../lib/types.ts';

/** Generic table tile (AbstractTableTile): rows from /care/:entity/:id/tile/:tile, row details in a side panel. */
const props = defineProps<{ tile: TileDefinition; entityType: EntityType; entityId: string }>();
const router = useRouter();

type Row = Record<string, unknown>;
const { data, error, loading } = useLoad(() => api<{ rows?: Row[]; items?: { label: string; value: string }[] }>(`/care/${props.entityType}/${props.entityId}/tile/${props.tile.key}`));
const rows = computed(() => (data.value?.rows ?? []).map((r, i) => ({ __i: i, ...r })));
const items = computed(() => data.value?.items);
const columns = computed<Column[]>(() => props.tile.columns ?? []);
const rowKey = '__i';

const looksLikeDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v);

const selected = ref<Row>();
function openRow(row: Row): void {
    selected.value = row;
}
const panelCards = computed<SidePanelCard[]>(() => {
    const r = selected.value;
    if (!r) return [];
    const shownKeys = new Set(columns.value.map((c) => c.key));
    const general = columns.value.map((c) => {
        const v = r[c.key];
        const text = c.type === 'date' ? fmtDateTime(v) : c.type === 'money' ? fmtMoney(v) : c.type === 'status' ? statusLabel(v) : v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
        return { label: c.label, value: text, tag: c.type === 'status' && Boolean(text) };
    });
    const extra = Object.entries(r)
        .filter(([k]) => k !== '__i' && !shownKeys.has(k))
        .map(([k, v]) => ({ label: k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()), value: looksLikeDate(v) ? fmtDateTime(v) : typeof v === 'object' ? JSON.stringify(v) : String(v ?? '') }));
    return extra.length ? [{ title: 'General', items: general }, { title: 'Additional details', items: extra }] : [{ title: 'General', items: general }];
});

function openLink(e: { type: string; id: string }): void {
    void router.push(`/customer-care/user-manager/${e.type}/${e.id}`);
}
</script>

<style scoped>
.table-tile {
    width: 100%;
}
.kv {
    display: grid;
    grid-template-columns: minmax(8rem, max-content) 1fr;
    gap: var(--sp-sm) var(--sp-lg);
    margin: var(--sp-xs) var(--sp-xxs);
    font-size: 0.875rem;
}
dt {
    font-weight: 600;
    color: var(--gray-800);
}
dd {
    margin: 0;
    color: var(--gray-600);
    word-break: break-all;
}
</style>
