<template>
    <LfDataTable
        class="standalone"
        title="Quotes"
        show-count
        :columns="columns"
        :rows="rows"
        :loading="loading"
        :error="error"
        :raw="data"
        :row-actions="actions"
        :default-page-size="15"
        empty-text="No quotes. Use Modify by quote on a subscription to create one."
    />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import LfDataTable from '../ui/LfDataTable.vue';
import { api, useLoad } from '../../lib/api.ts';
import { fmtDateTime, fmtMoney } from '../../lib/format.ts';
import { showToast, toastError } from '../../lib/toast.ts';
import type { Column, RowAction } from '../../lib/types.ts';

type Row = Record<string, unknown>;

/** Quotes (business customers): quote lifecycle in progress > pending > approved > accepted. */
const props = defineProps<{ kind: 'residential' | 'business'; id: string }>();
const { data, loading, error, reload } = useLoad(() => api<Row[]>(`/customer360/${props.kind}/${props.id}/quotes`));
const rows = computed(() => data.value ?? []);
const columns: Column[] = [
    { key: 'id', label: 'Quote ID' },
    { key: 'name', label: 'Name' },
    { key: 'description', label: 'Requested change' },
    { key: 'quoteDate', label: 'Quote date', format: (r) => fmtDateTime(r.quoteDate) },
    { key: 'validUntil', label: 'Valid until', format: (r) => fmtDateTime(r.validUntil) },
    { key: 'totalAmount', label: 'Total', format: (r) => fmtMoney(r.totalAmount, String(r.currency)) },
    { key: 'state', label: 'Status', type: 'status' },
];
const NEXT: Record<string, { state: string; label: string }[]> = {
    inProgress: [
        { state: 'pending', label: 'Submit for approval' },
        { state: 'cancelled', label: 'Cancel' },
    ],
    pending: [
        { state: 'approved', label: 'Approve' },
        { state: 'rejected', label: 'Reject' },
        { state: 'cancelled', label: 'Cancel' },
    ],
    approved: [
        { state: 'accepted', label: 'Mark accepted by customer' },
        { state: 'cancelled', label: 'Cancel' },
    ],
};
const actions = (row: Row): RowAction[] =>
    (NEXT[String(row.state)] ?? []).map((n) => ({
        label: n.label,
        icon: 'EditIcon',
        onClick: async () => {
            try {
                await api(`/customer360/quote/${String(row.id)}/state`, 'POST', { state: n.state });
                showToast('success', 'Quote updated');
                await reload();
            } catch (e) {
                toastError(e);
            }
        },
    }));
</script>
