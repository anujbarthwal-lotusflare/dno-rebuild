<template>
    <div>
        <LfDataTable
            class="standalone"
            title="Payments"
            show-count
            :columns="columns"
            :rows="rows"
            :loading="loading"
            :error="error"
            :raw="data"
            :default-page-size="15"
            empty-text="No payments"
        >
            <template #headerActions>
                <LfButton
                    icon="PlusIcon"
                    label="Create payment"
                    @click="open"
                />
            </template>
        </LfDataTable>
        <LfModal
            v-if="modalOpen"
            title="Create payment"
            width="36rem"
            @close="modalOpen = false"
        >
            <div class="form">
                <LfSelect
                    v-model="accountId"
                    label="Billing account"
                    :options="accountOptions"
                />
                <LfSelect
                    v-model="billId"
                    label="Settle bill"
                    optional
                    clearable
                    :options="billOptions"
                    placeholder="Oldest unpaid bills first"
                />
                <LfInput
                    v-model="amount"
                    label="Amount"
                    type="number"
                    min="0"
                    step="0.01"
                />
                <LfInput
                    v-model="description"
                    label="Description"
                    optional
                />
                <p
                    v-if="err"
                    class="error"
                >
                    {{ err }}
                </p>
            </div>
            <template #footer>
                <LfButton
                    variant="tertiary_m"
                    label="Cancel"
                    @click="modalOpen = false"
                />
                <LfButton
                    label="Create payment"
                    :loading="busy"
                    @click="create"
                />
            </template>
        </LfModal>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import LfButton from '../ui/LfButton.vue';
import LfDataTable from '../ui/LfDataTable.vue';
import LfInput from '../ui/LfInput.vue';
import LfModal from '../ui/LfModal.vue';
import LfSelect from '../ui/LfSelect.vue';
import { api, useLoad } from '../../lib/api.ts';
import { fmtDateTime, fmtMoney } from '../../lib/format.ts';
import { showToast } from '../../lib/toast.ts';
import type { Column, SelectOption } from '../../lib/types.ts';

type Row = Record<string, unknown>;

/** Payments: payment transactions of the customer's accounts; create a payment against an account or bill. */
const props = defineProps<{ kind: 'residential' | 'business'; id: string }>();
const emit = defineEmits<{ changed: [] }>();
const base = `/customer360/${props.kind}/${props.id}`;
const { data, loading, error, reload } = useLoad(() => api<Row[]>(`${base}/payments`));
const rows = computed(() => data.value ?? []);
const columns: Column[] = [
    { key: 'id', label: 'Payment ID' },
    { key: 'paymentDate', label: 'Date', format: (r) => fmtDateTime(r.paymentDate, true) },
    { key: 'account', label: 'Account', format: (r) => String((r.account as { id?: string }).id ?? '') },
    { key: 'totalAmount', label: 'Amount', type: 'money' },
    { key: 'matchingStatus', label: 'Matching', format: (r) => String(r.matchingStatus ?? '').replace(/([a-z])([A-Z])/g, '$1 $2') },
    { key: 'status', label: 'Status', type: 'status' },
];

const modalOpen = ref(false);
const accountOptions = ref<SelectOption[]>([]);
const billOptions = ref<SelectOption[]>([]);
const accountId = ref<string | null>(null);
const billId = ref<string | null>(null);
const amount = ref('');
const description = ref('');
const busy = ref(false);
const err = ref('');

async function open(): Promise<void> {
    err.value = '';
    amount.value = '';
    description.value = '';
    billId.value = null;
    modalOpen.value = true;
    const [accounts, bills] = await Promise.all([api<Row[]>(`${base}/accounts`), api<Row[]>(`${base}/bills`)]);
    accountOptions.value = accounts.filter((a) => a.state !== 'closed').map((a) => ({ value: String(a.id), label: String(a.name) }));
    accountId.value = accountOptions.value[0]?.value ?? null;
    billOptions.value = bills
        .filter((b) => Number((b.remainingAmount as { value: number }).value) > 0)
        .map((b) => ({ value: String(b.id), label: `${String(b.billNo)} - due ${fmtMoney(b.remainingAmount)}` }));
}
async function create(): Promise<void> {
    err.value = '';
    busy.value = true;
    try {
        const p = await api(`${base}/payments`, 'POST', { accountId: accountId.value, amount: Number(amount.value), description: description.value, customerBillId: billId.value ?? undefined });
        modalOpen.value = false;
        showToast('success', 'Payment created', `${fmtMoney(p.totalAmount)} - ${String(p.matchingStatus ?? '').replace(/([a-z])([A-Z])/g, '$1 $2')}`);
        await reload();
        emit('changed');
    } catch (e) {
        err.value = (e as Error).message;
    } finally {
        busy.value = false;
    }
}
</script>

<style scoped>
.form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-md);
    padding: var(--sp-md) 0;
}
.error {
    font-size: 0.75rem;
    color: var(--red-600);
}
</style>
