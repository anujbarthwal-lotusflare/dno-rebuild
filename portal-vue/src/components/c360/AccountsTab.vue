<template>
    <div>
        <LfDataTable
            class="standalone"
            title="Accounts"
            show-count
            :columns="columns"
            :rows="rows"
            :loading="loading"
            :error="error"
            :raw="data"
            :row-actions="kind === 'business' ? actions : undefined"
            :default-page-size="15"
            empty-text="No accounts"
        />
        <LfModal
            v-if="closing"
            title="Delete financial account"
            width="32rem"
            @close="closing = undefined"
        >
            <p class="text">Account {{ closing.name }} will be closed. It must have no products in service.</p>
            <p
                v-if="err"
                class="error"
            >
                {{ err }}
            </p>
            <template #footer>
                <LfButton
                    variant="tertiary_m"
                    label="Cancel"
                    @click="closing = undefined"
                />
                <LfButton
                    label="Delete"
                    :loading="busy"
                    @click="confirmClose"
                />
            </template>
        </LfModal>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import LfButton from '../ui/LfButton.vue';
import LfDataTable from '../ui/LfDataTable.vue';
import LfModal from '../ui/LfModal.vue';
import { api, useLoad } from '../../lib/api.ts';
import { fmtMoney } from '../../lib/format.ts';
import { showToast } from '../../lib/toast.ts';
import type { Column, RowAction } from '../../lib/types.ts';

type Row = Record<string, unknown>;

/** Accounts: billing and financial accounts with balance; business customers can delete one. */
const props = defineProps<{ kind: 'residential' | 'business'; id: string }>();
const emit = defineEmits<{ changed: [] }>();
const { data, loading, error, reload } = useLoad(() => api<Row[]>(`/customer360/${props.kind}/${props.id}/accounts`));
const rows = computed(() => data.value ?? []);
const columns: Column[] = [
    { key: 'id', label: 'Account ID' },
    { key: 'name', label: 'Account Name' },
    { key: 'state', label: 'Status', type: 'status' },
    { key: 'ratingType', label: 'Type', format: (r) => String(r.ratingType ?? '').replace(/^./, (c) => c.toUpperCase()) },
    { key: 'balance', label: 'Balance', type: 'money' },
    { key: 'creditLimit', label: 'Credit limit', format: (r) => (r.creditLimit ? fmtMoney(r.creditLimit) : '-') },
];
const closing = ref<Row>();
const busy = ref(false);
const err = ref('');
const actions = (row: Row): RowAction[] => [{ label: 'Delete Financial Account', icon: 'delete-new', disabled: row.state === 'closed', onClick: () => ((closing.value = row), (err.value = '')) }];
async function confirmClose(): Promise<void> {
    if (!closing.value) return;
    busy.value = true;
    try {
        await api(`/customer360/${props.kind}/${props.id}/accounts/${String(closing.value.id)}`, 'DELETE');
        showToast('success', 'Account closed');
        closing.value = undefined;
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
.text {
    font-size: 0.875rem;
    color: var(--gray-600);
}
.error {
    margin-top: 0.5rem;
    font-size: 0.75rem;
    color: var(--red-600);
}
</style>
