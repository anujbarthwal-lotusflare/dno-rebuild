<template>
    <div>
        <LfDataTable
            class="standalone"
            title="Orders"
            show-count
            :columns="columns"
            :rows="rows"
            :loading="loading"
            :error="error"
            :raw="data"
            clickable
            :default-page-size="15"
            empty-text="No orders"
            @row-click="(r) => (selected = r)"
        />
        <LfSidePanel
            :visible="!!selected"
            header="Product Order"
            :cards="cards"
            @close="selected = undefined"
        />
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import LfDataTable from '../ui/LfDataTable.vue';
import LfSidePanel from '../ui/LfSidePanel.vue';
import { api, useLoad } from '../../lib/api.ts';
import { fmtDateTime, fmtMoney } from '../../lib/format.ts';
import { statusLabel } from '../../lib/status.ts';
import type { Column, SidePanelCard } from '../../lib/types.ts';

type Row = Record<string, unknown>;
interface OrderItem {
    id: string;
    action: string;
    quantity?: number;
    state?: string;
    productOffering?: { id: string; name?: string };
}

/** Orders: the customer's product orders, details per order in the side panel. */
const props = defineProps<{ kind: 'residential' | 'business'; id: string }>();
const { data, loading, error } = useLoad(() => api<Row[]>(`/customer360/${props.kind}/${props.id}/orders`));
const rows = computed(() => data.value ?? []);
const totalOf = (r: Row) => {
    const t = (r.orderTotalPrice as { priceType: string; price: { taxIncludedAmount?: { value: number; unit: string } } }[] | undefined) ?? [];
    return t.map((p) => `${statusLabel(p.priceType)} ${p.price.taxIncludedAmount ? fmtMoney(p.price.taxIncludedAmount.value, p.price.taxIncludedAmount.unit) : ''}`).join(', ');
};
const columns: Column[] = [
    { key: 'id', label: 'Order ID' },
    { key: 'orderDate', label: 'Order date', format: (r) => fmtDateTime(r.orderDate, true) },
    { key: 'channel', label: 'Channel', format: (r) => String((r.channel as { name?: string } | undefined)?.name ?? '') },
    { key: 'items', label: 'Items', format: (r) => String((r.productOrderItem as unknown[]).length) },
    { key: 'total', label: 'Order total', format: totalOf },
    { key: 'state', label: 'Status', type: 'status' },
];
const selected = ref<Row>();
const cards = computed<SidePanelCard[]>(() => {
    const o = selected.value;
    if (!o) return [];
    const items = (o.productOrderItem as OrderItem[]) ?? [];
    return [
        {
            title: 'General',
            items: [
                { label: 'Order ID', value: o.id },
                { label: 'Status', value: statusLabel(o.state), tag: true },
                { label: 'Order date', value: fmtDateTime(o.orderDate, true) },
                { label: 'Completion date', value: fmtDateTime(o.completionDate, true) },
                { label: 'Billing account', value: (o.billingAccount as { id?: string } | undefined)?.id ?? '' },
                { label: 'Order total', value: totalOf(o) },
                { label: 'Reason', value: ((o.stateReason as { label: string }[] | undefined) ?? []).map((s) => s.label).join('; ') },
            ],
        },
        ...items.map((it, i) => ({
            title: `Item ${i + 1}`,
            items: [
                { label: 'Action', value: it.action },
                { label: 'Offering', value: it.productOffering?.name ?? it.productOffering?.id ?? '' },
                { label: 'Quantity', value: it.quantity ?? 1 },
                { label: 'State', value: statusLabel(it.state ?? ''), tag: Boolean(it.state) },
            ],
        })),
    ];
});
</script>
