<template>
    <div>
        <LfDataTable
            class="standalone"
            title="Subscriptions"
            show-count
            :columns="columns"
            :rows="rows"
            :loading="loading"
            :error="error"
            :raw="data"
            :show-json="false"
            :can-select-columns="false"
            :row-actions="actionsFor"
            :default-page-size="15"
            empty-text="No subscriptions"
            @row-click="(r) => (detail = r)"
        />
        <LfSidePanel
            :visible="!!detail"
            :header="String(detail?.name ?? '')"
            :cards="detailCards"
            @close="detail = undefined"
        />

        <!-- Purchase product offerings -->
        <LfModal
            v-if="modal === 'purchase'"
            title="Purchase product offerings"
            width="40rem"
            @close="modal = undefined"
        >
            <div class="form">
                <LfSelect
                    v-model="form.offeringId"
                    label="Product offering"
                    :options="offeringOptions"
                    filterable
                    placeholder="Select offering"
                />
                <div class="two">
                    <LfInput
                        v-model="form.quantity"
                        label="Quantity"
                        type="number"
                        min="1"
                    />
                    <LfSelect
                        v-model="form.term"
                        label="Offering term"
                        :options="[
                            { value: '', label: 'No term' },
                            { value: '12', label: '12 month' },
                        ]"
                    />
                </div>
                <LfSelect
                    v-model="form.accountId"
                    label="Billing account"
                    :options="accountOptions"
                />
                <p
                    v-if="formError"
                    class="error"
                >
                    {{ formError }}
                </p>
            </div>
            <template #footer>
                <LfButton
                    variant="tertiary_m"
                    label="Cancel"
                    @click="modal = undefined"
                />
                <LfButton
                    label="Submit order"
                    :loading="busy"
                    @click="purchase"
                />
            </template>
        </LfModal>

        <!-- Modify by order -->
        <LfModal
            v-if="modal === 'modifyOrder'"
            title="Modify by order"
            width="36rem"
            @close="modal = undefined"
        >
            <div class="form">
                <LfSelect
                    v-model="form.productId"
                    label="Product"
                    :options="productOptions"
                />
                <LfInput
                    v-model="form.quantity"
                    label="New quantity"
                    type="number"
                    min="1"
                />
                <p
                    v-if="formError"
                    class="error"
                >
                    {{ formError }}
                </p>
            </div>
            <template #footer>
                <LfButton
                    variant="tertiary_m"
                    label="Cancel"
                    @click="modal = undefined"
                />
                <LfButton
                    label="Submit order"
                    :loading="busy"
                    @click="modifyByOrder"
                />
            </template>
        </LfModal>

        <!-- Modify by quote -->
        <LfModal
            v-if="modal === 'modifyQuote'"
            title="Modify by quote"
            width="36rem"
            @close="modal = undefined"
        >
            <div class="form">
                <LfInput
                    v-model="form.quoteName"
                    label="Quote name"
                />
                <LfInput
                    v-model="form.description"
                    label="Requested change"
                    type="textarea"
                    :rows="3"
                />
                <LfInput
                    v-model="form.amount"
                    label="Quoted total"
                    type="number"
                    min="0"
                    optional
                />
                <p
                    v-if="formError"
                    class="error"
                >
                    {{ formError }}
                </p>
            </div>
            <template #footer>
                <LfButton
                    variant="tertiary_m"
                    label="Cancel"
                    @click="modal = undefined"
                />
                <LfButton
                    label="Create quote"
                    :loading="busy"
                    @click="createQuote"
                />
            </template>
        </LfModal>

        <!-- Modify status -->
        <LfModal
            v-if="modal === 'status'"
            title="Modify status"
            width="32rem"
            @close="modal = undefined"
        >
            <div class="form">
                <p class="text">{{ target?.kind === 'subscription' ? 'All products of the subscription change status.' : 'Only this product changes status.' }}</p>
                <LfSelect
                    v-model="form.status"
                    label="New status"
                    :options="statusOptions"
                />
                <p
                    v-if="form.status === 'terminated'"
                    class="warn"
                >
                    Terminating is final. Remaining recurring charges are prorated.
                </p>
                <p
                    v-if="formError"
                    class="error"
                >
                    {{ formError }}
                </p>
            </div>
            <template #footer>
                <LfButton
                    variant="tertiary_m"
                    label="Cancel"
                    @click="modal = undefined"
                />
                <LfButton
                    label="Confirm"
                    :loading="busy"
                    @click="modifyStatus"
                />
            </template>
        </LfModal>
    </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import LfButton from '../ui/LfButton.vue';
import LfDataTable from '../ui/LfDataTable.vue';
import LfInput from '../ui/LfInput.vue';
import LfModal from '../ui/LfModal.vue';
import LfSelect from '../ui/LfSelect.vue';
import LfSidePanel from '../ui/LfSidePanel.vue';
import { api, useLoad } from '../../lib/api.ts';
import { fmtDateTime, fmtMoney } from '../../lib/format.ts';
import { statusLabel } from '../../lib/status.ts';
import { showToast } from '../../lib/toast.ts';
import type { Column, RowAction, SelectOption, SidePanelCard } from '../../lib/types.ts';

type Row = Record<string, unknown>;

/** Product portfolio: subscriptions with their products as a tree, subscription and product actions. */
const props = defineProps<{ kind: 'residential' | 'business'; id: string }>();
const emit = defineEmits<{ changed: [] }>();
const base = `/customer360/${props.kind}/${props.id}`;
const { data, loading, error, reload } = useLoad(() => api<Row[]>(`${base}/portfolio`));
const rows = computed(() => data.value ?? []);

const dt = (r: Row, k: string) => (r[k] ? fmtDateTime(r[k], true) : r.kind === 'subscription' && k === 'endDate' ? '' : '-');
const columns: Column[] = [
    { key: 'name', label: 'Name' },
    { key: 'quantity', label: 'Quantity', format: (r) => String(r.quantity ?? '-') },
    { key: 'offeringTerm', label: 'Offering Term' },
    { key: 'startDate', label: 'Start date', format: (r) => dt(r, 'startDate') },
    { key: 'endDate', label: 'End date', format: (r) => dt(r, 'endDate') },
    { key: 'status', label: 'Status', type: 'status' },
];

const target = ref<Row>();
const modal = ref<'purchase' | 'modifyOrder' | 'modifyQuote' | 'status'>();
const busy = ref(false);
const formError = ref('');
const form = reactive<Record<string, string | null>>({});
const offeringOptions = ref<SelectOption[]>([]);
const accountOptions = ref<SelectOption[]>([]);

function actionsFor(row: Row): RowAction[] {
    if (row.kind === 'subscription') {
        const list: RowAction[] = [
            { label: 'Purchase product offerings', icon: 'PlusIcon', onClick: () => openModal('purchase', row) },
            { label: 'Modify by order', icon: 'EditIcon', onClick: () => openModal('modifyOrder', row) },
        ];
        if (props.kind === 'business') list.push({ label: 'Modify by quote', icon: 'EditIcon', onClick: () => openModal('modifyQuote', row) });
        list.push({ label: 'Modify status', icon: 'EditIcon', disabled: row.status === 'terminated', onClick: () => openModal('status', row) });
        return list;
    }
    return [
        { label: 'Modify by order', icon: 'EditIcon', disabled: !['active', 'suspended'].includes(String(row.status)), onClick: () => openModal('modifyOrder', row) },
        { label: 'Modify status', icon: 'EditIcon', disabled: row.status === 'terminated', onClick: () => openModal('status', row) },
    ];
}

const productOptions = computed<SelectOption[]>(() => {
    const t = target.value;
    if (!t) return [];
    const products = t.kind === 'product' ? [t] : ((t.children as Row[]) ?? []);
    return products.filter((p) => ['active', 'suspended'].includes(String(p.status))).map((p) => ({ value: String(p.id), label: `${String(p.name)} (qty ${String(p.quantity)})` }));
});
const statusOptions = computed<SelectOption[]>(() =>
    ['active', 'suspended', 'terminated'].filter((s) => s !== target.value?.status).map((s) => ({ value: s, label: statusLabel(s) })),
);

async function openModal(m: NonNullable<typeof modal.value>, row: Row): Promise<void> {
    target.value = row;
    formError.value = '';
    for (const k of Object.keys(form)) delete form[k];
    form.quantity = '1';
    form.term = '12';
    form.status = statusOptions.value[0]?.value ?? null;
    if (m === 'modifyOrder') {
        form.productId = productOptions.value[0]?.value ?? null;
        form.quantity = row.kind === 'product' ? String(row.quantity) : '1';
    }
    modal.value = m;
    if (m === 'purchase') {
        const [offerings, accounts] = await Promise.all([api<{ id: string; name: string }[]>('/customer360/offerings'), api<{ id: string; name: string }[]>(`${base}/accounts`)]);
        offeringOptions.value = offerings.map((o) => ({ value: o.id, label: o.name }));
        accountOptions.value = accounts.map((a) => ({ value: a.id, label: a.name }));
        const ba = (row.billingAccount as { id?: string } | undefined)?.id;
        form.accountId = ba ?? accountOptions.value[0]?.value ?? null;
    }
}
async function run(fn: () => Promise<string>): Promise<void> {
    busy.value = true;
    formError.value = '';
    try {
        const message = await fn();
        modal.value = undefined;
        showToast('success', message);
        await reload();
        emit('changed');
    } catch (e) {
        formError.value = (e as Error).message;
    } finally {
        busy.value = false;
    }
}
const orderMessage = (o: { state: string; stateReason?: { label: string }[] }) => (o.state === 'completed' ? 'Order completed' : `Order ${o.state}${o.stateReason?.[0] ? `: ${o.stateReason[0].label}` : ''}`);
function purchase(): Promise<void> {
    return run(async () => {
        if (!form.offeringId) throw new Error('Choose a product offering');
        const order = await api(`${base}/purchase`, 'POST', { offeringId: form.offeringId, quantity: Number(form.quantity), billingAccountId: form.accountId, termMonths: form.term ? Number(form.term) : undefined });
        if (order.state !== 'completed') throw new Error(orderMessage(order));
        return orderMessage(order);
    });
}
function modifyByOrder(): Promise<void> {
    return run(async () => {
        const order = await api(`${base}/modifyByOrder`, 'POST', { productId: form.productId, quantity: Number(form.quantity) });
        if (order.state !== 'completed') throw new Error(orderMessage(order));
        return orderMessage(order);
    });
}
function createQuote(): Promise<void> {
    return run(async () => {
        await api(`${base}/quotes`, 'POST', { subscriptionId: target.value?.id, name: form.quoteName ?? '', description: form.description ?? '', totalAmount: Number(form.amount || 0) });
        return 'Quote created. Find it under Quotes.';
    });
}
function modifyStatus(): Promise<void> {
    return run(async () => {
        const t = target.value!;
        await api(`/customer360/${t.kind === 'subscription' ? 'subscription' : 'product'}/${String(t.id)}/status`, 'POST', { status: form.status });
        return `Status changed to ${statusLabel(form.status)}`;
    });
}

const detail = ref<Row>();
const detailCards = computed<SidePanelCard[]>(() => {
    const r = detail.value;
    if (!r) return [];
    const general: SidePanelCard = {
        title: 'General',
        items: [
            { label: 'ID', value: r.id },
            { label: 'Type', value: r.kind === 'subscription' ? 'Subscription' : r.isBundle ? 'Bundle product' : 'Product' },
            { label: 'Name', value: r.name },
            { label: 'Status', value: statusLabel(r.status), tag: true },
            { label: 'Quantity', value: r.quantity },
            { label: 'Offering term', value: r.offeringTerm },
            { label: 'Start date', value: fmtDateTime(r.startDate, true) },
            { label: 'End date', value: fmtDateTime(r.endDate, true) },
            { label: 'Billing account', value: (r.billingAccount as { id?: string } | undefined)?.id ?? '' },
        ],
    };
    const prices = (r.productPrice as { priceType: string; recurringChargePeriod?: string; price: { taxIncludedAmount?: { value: number; unit: string }; dutyFreeAmount?: { value: number; unit: string } } }[] | undefined) ?? [];
    if (!prices.length) return [general];
    return [
        general,
        {
            title: 'Prices',
            items: prices.map((p) => ({
                label: statusLabel(p.priceType) + (p.recurringChargePeriod ? ` (${p.recurringChargePeriod})` : ''),
                value: p.price.taxIncludedAmount ? `${fmtMoney(p.price.taxIncludedAmount.value, p.price.taxIncludedAmount.unit)} incl. tax` : '',
            })),
        },
    ];
});
</script>

<style scoped>
.form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-md);
    padding: var(--sp-md) 0;
}
.two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--sp-md);
}
.text {
    font-size: 0.875rem;
    color: var(--gray-600);
}
.warn {
    font-size: 0.75rem;
    color: var(--yellow-600);
}
.error {
    font-size: 0.75rem;
    color: var(--red-600);
}
</style>
