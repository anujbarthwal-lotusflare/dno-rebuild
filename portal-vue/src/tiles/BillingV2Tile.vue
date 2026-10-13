<template>
    <div class="billing-v2">
        <div class="title-row">
            <div class="title">
                Amount due: <span class="amount">{{ summary ? formatDue(summary.amountDue, summary.currency) : '' }}</span>
            </div>
        </div>
        <LfSelect
            v-if="entityType === 'user'"
            v-model="accountId"
            class="account"
            :options="accountOptions"
            placeholder="Select account"
        />
        <div
            v-else
            class="account-box"
        >
            {{ accountId }}
        </div>
        <div class="row">
            <LfButton
                variant="secondary"
                label="Download invoice"
                class="ml-auto"
                @click="downloadInvoice"
            />
        </div>
    </div>
</template>

<script setup lang="ts">
import LfButton from '../components/ui/LfButton.vue';
import LfSelect from '../components/ui/LfSelect.vue';
import { useBilling } from './useBilling.ts';
import type { EntityType, TileDefinition } from '../lib/types.ts';

/** Billing V2: amount due on the latest unpaid bill and its invoice PDF. */
const props = defineProps<{ tile: TileDefinition; entityType: EntityType; entityId: string }>();
const { accountId, accountOptions, summary, downloadInvoice } = useBilling(props.entityType, props.entityId);
const formatDue = (n: number, currency: string) => (n === 0 ? '0' : `${currency} ${n.toFixed(2)}`);
</script>

<style scoped>
.billing-v2 {
    display: flex;
    flex-direction: column;
    gap: var(--sp-sm);
    height: 100%;
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
.account-box {
    min-height: 3.25rem;
    padding: var(--sp-xs);
    border-radius: var(--radius-xs);
    box-shadow: inset 0 0 0 1px var(--gray-150);
    font-size: 0.75rem;
    line-height: 1rem;
    color: var(--gray-800);
    word-break: break-all;
}
.row {
    display: flex;
}
</style>
