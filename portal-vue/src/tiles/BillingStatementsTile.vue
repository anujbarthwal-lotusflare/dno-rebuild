<template>
    <LfDataTable
        :columns="columns"
        :rows="rows"
        :loading="loading"
        :error="error"
        :raw="data"
        :row-actions="actions"
    />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import LfDataTable from '../components/ui/LfDataTable.vue';
import { api, useLoad } from '../lib/api.ts';
import { fmtDate, fmtMoney } from '../lib/format.ts';
import type { Column, EntityType, RowAction, TileDefinition } from '../lib/types.ts';

/** Billing Statements: invoices of the account; Download saves the statement PDF. */
const props = defineProps<{ tile: TileDefinition; entityType: EntityType; entityId: string }>();
const { data, loading, error } = useLoad(() => api<Record<string, unknown>[]>(`/care/account/${props.entityId}/invoices`));
const rows = computed(() => data.value ?? []);
const columns: Column[] = [
    { key: 'number', label: 'Statement' },
    { key: 'period', label: 'Billing Period', format: (r) => `${fmtDate(r.periodStart)} - ${fmtDate(r.periodEnd)}` },
    { key: 'issueDate', label: 'Issue Date', format: (r) => fmtDate(r.issueDate) },
    { key: 'dueDate', label: 'Due Date', format: (r) => fmtDate(r.dueDate) },
    { key: 'amount', label: 'Amount', format: (r) => fmtMoney(r.amount, String(r.currency)) },
    { key: 'amountDue', label: 'Amount Due', format: (r) => fmtMoney(r.amountDue, String(r.currency)) },
    { key: 'status', label: 'Status', type: 'status' },
];
const actions = (row: Record<string, unknown>): RowAction[] => [
    {
        label: 'Download',
        icon: 'DownloadIcon',
        onClick: () => {
            const a = document.createElement('a');
            a.href = `/api/care/invoice/${String(row.id)}/pdf`;
            a.download = `${String(row.number)}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
        },
    },
    { label: 'Open', icon: 'OpenLinkIcon', onClick: () => window.open(`/api/care/invoice/${String(row.id)}/pdf`, '_blank', 'noopener') },
];
</script>
