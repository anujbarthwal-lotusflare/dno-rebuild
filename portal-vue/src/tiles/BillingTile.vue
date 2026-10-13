<template>
    <div class="billing">
        <div class="title">
            Amount due: <span class="amount">{{ summary ? fmtMoney(summary.amountDue, summary.currency) : '' }}</span>
        </div>
        <LfSelect
            v-if="accounts.length > 1"
            v-model="accountId"
            :options="accountOptions"
            placeholder="Select account"
        />
        <div class="actions">
            <LfButton
                variant="tertiary_m"
                label="View info"
                :disabled="!summary"
                @click="infoOpen = true"
            />
            <LfButton
                variant="secondary"
                label="Download invoice"
                class="ml-auto"
                :disabled="!summary || summary.amountDue <= 0"
                @click="downloadInvoice"
            />
        </div>
        <LfDrawer
            :visible="infoOpen"
            width="48rem"
            @close="infoOpen = false"
        >
            <div class="panel">
                <h3>Billing info</h3>
                <dl class="kv">
                    <dt>Account ID</dt>
                    <dd>{{ summary?.accountId }}</dd>
                    <dt>Amount due</dt>
                    <dd>{{ summary ? fmtMoney(summary.amountDue, summary.currency) : '' }}</dd>
                    <dt>Remaining balance</dt>
                    <dd>{{ summary ? fmtMoney(summary.remainingBalance, summary.currency) : '' }}</dd>
                </dl>
                <h5 class="caps">Transaction history</h5>
                <LfDataTable
                    :columns="columns"
                    :rows="summary?.transactions ?? []"
                    :show-filter="false"
                    :show-json="false"
                    :can-select-columns="false"
                    :default-page-size="5"
                />
            </div>
        </LfDrawer>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import LfButton from '../components/ui/LfButton.vue';
import LfDataTable from '../components/ui/LfDataTable.vue';
import LfDrawer from '../components/ui/LfDrawer.vue';
import LfSelect from '../components/ui/LfSelect.vue';
import { fmtMoney } from '../lib/format.ts';
import { useBilling } from './useBilling.ts';
import type { Column, EntityType, TileDefinition } from '../lib/types.ts';

/** Billing: amount due of the chosen account, transaction history sidebar and invoice download. */
const props = defineProps<{ tile: TileDefinition; entityType: EntityType; entityId: string }>();
const { accounts, accountId, accountOptions, summary, downloadInvoice } = useBilling(props.entityType, props.entityId);
const infoOpen = ref(false);
const columns: Column[] = [
    { key: 'id', label: 'Transaction ID' },
    { key: 'type', label: 'Type' },
    { key: 'timestamp', label: 'Timestamp', type: 'date' },
    { key: 'amount', label: 'Amount', format: (r) => fmtMoney(r.amount, String(r.currency)) },
    { key: 'status', label: 'Status', type: 'status' },
];
</script>

<style scoped>
.billing {
    display: flex;
    flex-direction: column;
    gap: var(--sp-sm);
    margin: var(--sp-xs) var(--sp-xxs) 0;
}
.title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--blue-400);
}
.amount {
    font-size: 1rem;
}
.actions {
    display: flex;
    align-items: center;
}
.panel {
    display: flex;
    flex-direction: column;
    gap: var(--sp-lg);
    padding-right: var(--sp-xl);
}
.kv {
    display: grid;
    grid-template-columns: 10rem 1fr;
    gap: var(--sp-sm) var(--sp-md);
    margin: 0;
    font-size: 0.875rem;
}
dt {
    font-weight: 600;
}
dd {
    margin: 0;
    color: var(--gray-600);
}
.caps {
    text-transform: uppercase;
    color: var(--blue-300);
}
</style>
