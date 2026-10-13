<template>
    <div>
        <LfDataTable
            :columns="columns"
            :rows="rows"
            :loading="loading"
            :error="error"
            clickable
            @row-click="openTx"
        />
        <LfDrawer
            :visible="!!tx"
            width="36rem"
            @close="tx = undefined"
        >
            <div
                v-if="tx"
                class="charges"
            >
                <section>
                    <h5 class="caps">Charges</h5>
                    <LfDataTable
                        v-model:selected="selectedCharges"
                        :columns="chargeColumns"
                        :rows="chargeRows"
                        :selectable="refundable"
                        :is-row-disabled="isChargeRefunded"
                        hide-header
                        :paginate="false"
                        :can-select-columns="false"
                    />
                </section>
                <section>
                    <h5 class="caps">Discount</h5>
                    <LfDataTable
                        :columns="discountColumns"
                        :rows="tx.discounts.map((d, i) => ({ id: String(i), ...d }))"
                        hide-header
                        :paginate="false"
                        :can-select-columns="false"
                    />
                </section>
                <section>
                    <h5 class="caps">Refund</h5>
                    <LfDataTable
                        :columns="refundColumns"
                        :rows="tx.refunds.map((r) => ({ id: r.refundId, ...r }))"
                        hide-header
                        :paginate="false"
                        :can-select-columns="false"
                    />
                </section>
                <section
                    v-if="refundable"
                    class="refund-form"
                >
                    <LfInput
                        v-model="reason"
                        label="Refund reason"
                        type="textarea"
                        :rows="3"
                        placeholder="Why is this refund given?"
                        :error="refundError"
                    />
                    <div class="refund-actions">
                        <span class="total">Refund amount: {{ fmtMoney(refundTotal, tx.currency) }}</span>
                        <LfButton
                            label="Refund"
                            icon="RefundIcon"
                            :disabled="!selectedCharges.length"
                            :loading="refunding"
                            @click="refund"
                        />
                    </div>
                </section>
                <p
                    v-else
                    class="note"
                >
                    {{ tx.status === 'Refunded' ? 'This transaction has been refunded in full.' : `A ${tx.type.toLowerCase()} transaction with status ${tx.status.toLowerCase()} cannot be refunded.` }}
                </p>
            </div>
        </LfDrawer>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import LfButton from '../components/ui/LfButton.vue';
import LfDataTable from '../components/ui/LfDataTable.vue';
import LfDrawer from '../components/ui/LfDrawer.vue';
import LfInput from '../components/ui/LfInput.vue';
import { api, useLoad } from '../lib/api.ts';
import { fmtMoney, fmtNumber } from '../lib/format.ts';
import { showToast } from '../lib/toast.ts';
import type { Column, EntityType, TileDefinition } from '../lib/types.ts';

interface Charge {
    id: string;
    offerName: string;
    amountWithoutTax: number;
    discount: number;
    taxes: number;
    refundedAmount: number;
}
interface Tx {
    id: string;
    type: string;
    timestamp: string;
    amount: number;
    originalAmount: number;
    currency: string;
    status: string;
    transactionType: string;
    charges: Charge[];
    discounts: { offerName: string; discount: number; pricingRuleName: string; pricingRuleId: string }[];
    refunds: { refundId: string; status: string; refundAmount: number; date: string; reason: string }[];
}

/** Billing Transaction V2: account transactions; a refundable row opens the charges sidebar with refund. */
const props = defineProps<{ tile: TileDefinition; entityType: EntityType; entityId: string }>();
const { data, loading, error, reload } = useLoad(() => api<Tx[]>(`/care/account/${props.entityId}/transactions`));
const rows = computed(() => (data.value ?? []) as unknown as Record<string, unknown>[]);

const columns: Column[] = [
    { key: 'id', label: 'Payment Transaction ID' },
    { key: 'type', label: 'Type' },
    { key: 'timestamp', label: 'Timestamp', type: 'date' },
    { key: 'amount', label: 'Amount', format: (r) => fmtMoney(r.amount, String(r.currency)) },
    { key: 'originalAmount', label: 'Original Amount', format: (r) => fmtMoney(r.originalAmount, String(r.currency)) },
    { key: 'status', label: 'Status', type: 'status' },
    { key: 'transactionType', label: 'Transaction Type' },
];
const chargeColumns: Column[] = [
    { key: 'offerName', label: 'Offer name' },
    { key: 'amountWithoutTax', label: 'Amount without tax', format: (r) => fmtNumber(r.amountWithoutTax) },
    { key: 'discount', label: 'Discount', format: (r) => fmtNumber(r.discount) },
    { key: 'taxes', label: 'Taxes', format: (r) => fmtNumber(r.taxes) },
    { key: 'refundedAmount', label: 'Refunded', format: (r) => fmtNumber(r.refundedAmount) },
];
const discountColumns: Column[] = [
    { key: 'offerName', label: 'Offer name' },
    { key: 'discount', label: 'Discount', format: (r) => fmtNumber(r.discount) },
    { key: 'pricingRuleName', label: 'Pricing Rule Name' },
    { key: 'pricingRuleId', label: 'Pricing Rule ID' },
];
const refundColumns: Column[] = [
    { key: 'refundId', label: 'Refund ID' },
    { key: 'status', label: 'Status', type: 'status' },
    { key: 'refundAmount', label: 'Refund Amount', format: (r) => fmtNumber(r.refundAmount) },
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'reason', label: 'Reason' },
];

const tx = ref<Tx>();
const selectedCharges = ref<string[]>([]);
const reason = ref('');
const refundError = ref('');
const refunding = ref(false);

const chargeRows = computed(() => (tx.value?.charges ?? []) as unknown as Record<string, unknown>[]);
const refundable = computed(() => Boolean(tx.value && ['Succeeded', 'Partially refunded'].includes(tx.value.status) && !['Reserve', 'Refund'].includes(tx.value.type)));
const remaining = (c: Charge) => Math.round((c.amountWithoutTax - c.discount + c.taxes - c.refundedAmount) * 100) / 100;
const isChargeRefunded = (row: Record<string, unknown>) => remaining(row as unknown as Charge) <= 0;
const refundTotal = computed(() => (tx.value?.charges ?? []).filter((c) => selectedCharges.value.includes(c.id)).reduce((s, c) => s + remaining(c), 0));

function openTx(row: Record<string, unknown>): void {
    tx.value = row as unknown as Tx;
    selectedCharges.value = [];
    reason.value = '';
    refundError.value = '';
}
async function refund(): Promise<void> {
    if (!tx.value) return;
    if (!reason.value.trim()) {
        refundError.value = 'Refund reason is required';
        return;
    }
    refunding.value = true;
    try {
        await api(`/care/transaction/${tx.value.id}/refund`, 'POST', { chargeIds: selectedCharges.value, reason: reason.value });
        showToast('success', 'Refund submitted', `${fmtMoney(refundTotal.value, tx.value.currency)} refunded`);
        tx.value = undefined;
        await reload();
    } catch (e) {
        refundError.value = (e as Error).message;
    } finally {
        refunding.value = false;
    }
}
</script>

<style scoped>
.charges {
    display: flex;
    flex-direction: column;
    gap: var(--sp-xl);
    padding-right: var(--sp-xl);
}
.caps {
    margin-bottom: var(--sp-sm);
    font-size: 0.75rem;
    font-weight: 400;
    text-transform: uppercase;
    color: var(--blue-300);
}
.charges :deep(th:first-child),
.charges :deep(td:first-child) {
    padding-left: var(--sp-2xl);
}
.refund-form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-md);
}
.refund-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
}
.total {
    font-size: 0.875rem;
    font-weight: 600;
}
.note {
    font-size: 0.875rem;
    color: var(--gray-600);
}
</style>
