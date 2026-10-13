<template>
    <LfDataTable
        class="standalone"
        title="Bills"
        show-count
        :columns="columns"
        :rows="rows"
        :loading="loading"
        :error="error"
        :raw="data"
        :row-actions="actions"
        :default-page-size="15"
        empty-text="No bills yet. Bills appear after the first bill run."
    />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import LfDataTable from '../ui/LfDataTable.vue';
import { api, useLoad } from '../../lib/api.ts';
import { fmtDate } from '../../lib/format.ts';
import type { Column, RowAction } from '../../lib/types.ts';

type Row = Record<string, unknown>;

/** Bills: invoices of the customer's billing accounts with PDF download. */
const props = defineProps<{ kind: 'residential' | 'business'; id: string }>();
const { data, loading, error } = useLoad(() => api<Row[]>(`/customer360/${props.kind}/${props.id}/bills`));
const rows = computed(() => data.value ?? []);
const columns: Column[] = [
    { key: 'billNo', label: 'Bill ID' },
    { key: 'billDate', label: 'Bill Date', format: (r) => fmtDate(r.billDate) },
    { key: 'paymentDueDate', label: 'Due Date', format: (r) => fmtDate(r.paymentDueDate) },
    { key: 'taxIncludedAmount', label: 'Total', type: 'money' },
    { key: 'remainingAmount', label: 'Amount Due', type: 'money' },
    { key: 'state', label: 'Status', type: 'status' },
];
const actions = (row: Row): RowAction[] => [
    {
        label: 'Download',
        icon: 'DownloadIcon',
        onClick: () => {
            const a = document.createElement('a');
            a.href = `/api/customer360/bill/${String(row.id)}/pdf`;
            a.download = `${String(row.billNo)}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
        },
    },
];
</script>
