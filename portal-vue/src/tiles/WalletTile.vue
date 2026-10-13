<template>
    <div class="wallet">
        <EntityPicker
            v-model="picked"
            :entity-type="entityType"
            :entity-id="entityId"
            @pick="target = $event"
        />
        <div class="amount-row">
            <div class="amount">{{ wallet ? fmtMoney(wallet.amount, wallet.currency) : '' }}</div>
            <div class="epochs">
                <div v-if="wallet?.activeEpoch">Expire {{ fmtDate(wallet.activeEpoch) }}</div>
                <div v-if="wallet?.graceEpoch">Grace {{ fmtDate(wallet.graceEpoch) }}</div>
            </div>
        </div>
        <div class="buttons">
            <LfButton
                variant="tertiary_m"
                label="Deduct balance"
                :disabled="!wallet || wallet.amount <= 0"
                @click="open('deduct')"
            />
            <LfButton
                variant="secondary"
                label="Top-up"
                class="ml-auto"
                :disabled="!wallet"
                @click="open('topUp')"
            />
        </div>
        <LfModal
            v-if="mode"
            :title="sensitiveOk ? (mode === 'topUp' ? 'Top Up' : 'Deduct Balance') : ''"
            width="47.5rem"
            @close="close"
        >
            <SensitiveEdit
                v-if="!sensitiveOk"
                @close="close"
                @proceed="sensitiveOk = true"
            />
            <form
                v-else
                class="form"
                @submit.prevent="submit"
            >
                <p class="current">Current balance: {{ wallet ? fmtMoney(wallet.amount, wallet.currency) : '' }}</p>
                <LfInput
                    v-model="amount"
                    type="number"
                    step="0.01"
                    min="0"
                    :label="mode === 'topUp' ? 'Top Up Amount' : 'Deduct Amount'"
                    size="large"
                    :error="formError"
                />
                <LfInput
                    v-if="mode === 'topUp'"
                    v-model="voucher"
                    label="Voucher Code"
                    optional
                    size="large"
                />
            </form>
            <template
                v-if="sensitiveOk"
                #footer
            >
                <LfButton
                    variant="tertiary_m"
                    label="Cancel"
                    @click="close"
                />
                <LfButton
                    label="Update"
                    :loading="saving"
                    @click="submit"
                />
            </template>
        </LfModal>
    </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import EntityPicker from '../components/ccs/EntityPicker.vue';
import SensitiveEdit from '../components/ccs/SensitiveEdit.vue';
import LfButton from '../components/ui/LfButton.vue';
import LfInput from '../components/ui/LfInput.vue';
import LfModal from '../components/ui/LfModal.vue';
import { api } from '../lib/api.ts';
import { fmtDate, fmtMoney } from '../lib/format.ts';
import { showToast, toastError } from '../lib/toast.ts';
import type { EntityType, TileDefinition } from '../lib/types.ts';

interface Wallet {
    id: string;
    currency: string;
    amount: number;
    activeEpoch?: string;
    graceEpoch?: string;
}

/** Wallet tile: balance of the picked entity, top-up and deduction behind a sensitive-edit confirmation. */
const props = defineProps<{ tile: TileDefinition; entityType: EntityType; entityId: string }>();
const picked = ref<string | null>(null);
const target = ref<{ entityType: EntityType; id: string }>();
const wallet = ref<Wallet>();
const mode = ref<'topUp' | 'deduct'>();
const sensitiveOk = ref(false);
const amount = ref('');
const voucher = ref('');
const formError = ref('');
const saving = ref(false);

async function load(): Promise<void> {
    if (!target.value) return;
    try {
        wallet.value = await api<Wallet>(`/care/${target.value.entityType}/${target.value.id}/wallet`);
    } catch (e) {
        toastError(e, 'Could not load the wallet');
    }
}
watch(target, load);

function open(m: 'topUp' | 'deduct'): void {
    mode.value = m;
    sensitiveOk.value = false;
    amount.value = '';
    voucher.value = '';
    formError.value = '';
}
function close(): void {
    mode.value = undefined;
}
async function submit(): Promise<void> {
    if (!target.value || !wallet.value) return;
    const n = Number(amount.value);
    if (!amount.value || !Number.isFinite(n) || n <= 0) {
        formError.value = 'Enter an amount greater than 0';
        return;
    }
    if (mode.value === 'deduct' && n > wallet.value.amount) {
        formError.value = 'Amount cannot be greater than the balance';
        return;
    }
    saving.value = true;
    try {
        const path = `/care/${target.value.entityType}/${target.value.id}/wallet/${mode.value}`;
        wallet.value = await api<Wallet>(path, 'POST', mode.value === 'topUp' ? { amount: n, voucherCode: voucher.value || undefined } : { amount: n });
        showToast('success', mode.value === 'topUp' ? 'Wallet topped up' : 'Balance deducted', `New balance ${fmtMoney(wallet.value.amount, wallet.value.currency)}`);
        close();
    } catch (e) {
        formError.value = (e as Error).message;
    } finally {
        saving.value = false;
    }
}
void props;
</script>

<style scoped>
.wallet {
    display: flex;
    flex-direction: column;
    gap: var(--sp-md);
    margin: var(--sp-xs) var(--sp-xxs) 0;
}
.amount-row {
    display: flex;
    align-items: flex-start;
}
.amount {
    font-size: 1.5rem;
    line-height: 2rem;
    font-weight: 600;
    color: var(--blue-400);
}
.epochs {
    margin-left: auto;
    min-height: 2.125rem;
    font-size: 0.75rem;
    line-height: 1rem;
    color: var(--blue-400);
    text-align: right;
}
.buttons {
    display: flex;
    align-items: center;
}
.form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-md);
    padding-top: var(--sp-xs);
}
.current {
    font-size: 0.875rem;
    color: var(--gray-600);
}
</style>
