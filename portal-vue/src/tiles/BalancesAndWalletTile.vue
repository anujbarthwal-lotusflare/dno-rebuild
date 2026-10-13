<template>
    <div class="balances">
        <div class="money-cards">
            <div class="mcard">
                <span class="mlabel">Wallet balance</span>
                <span class="mvalue">{{ data ? fmtMoney(data.wallet.amount, data.wallet.currency) : '' }}</span>
                <span
                    v-if="data?.wallet.activeEpoch"
                    class="msub"
                    >Expires {{ fmtDate(data.wallet.activeEpoch) }}</span
                >
            </div>
            <div class="mcard">
                <span class="mlabel">Credit balance</span>
                <span class="mvalue">{{ data ? fmtMoney(data.creditBalance) : '' }}</span>
            </div>
        </div>
        <div class="buckets">
            <div
                v-for="b in data?.buckets ?? []"
                :key="b.name"
                class="bucket"
            >
                <div class="b-top">
                    <span class="b-name">{{ b.name }}</span>
                    <span class="b-val">{{ b.remaining }} / {{ b.total }} {{ b.unit }}</span>
                </div>
                <span class="bar"
                    ><span
                        class="fill"
                        :style="{ width: `${Math.min(100, (b.remaining / b.total) * 100)}%` }"
                /></span>
                <span class="b-exp">Expires {{ fmtDate(b.expiresAt) }}</span>
            </div>
        </div>
        <LfEmptyState
            v-if="error"
            :error="error"
        />
    </div>
</template>

<script setup lang="ts">
import LfEmptyState from '../components/ui/LfEmptyState.vue';
import { api, useLoad } from '../lib/api.ts';
import { fmtDate, fmtMoney } from '../lib/format.ts';
import type { EntityType, TileDefinition } from '../lib/types.ts';

interface Balances {
    wallet: { amount: number; currency: string; activeEpoch?: string };
    creditBalance: { value: number; currency: string };
    buckets: { name: string; remaining: number; total: number; unit: string; expiresAt: string }[];
}

/** Balances and Wallet: wallet, credit balance and the remaining usage buckets. */
const props = defineProps<{ tile: TileDefinition; entityType: EntityType; entityId: string }>();
const { data, error } = useLoad(() => api<Balances>(`/care/${props.entityType}/${props.entityId}/balances`));
</script>

<style scoped>
.balances {
    display: flex;
    gap: var(--sp-lg);
    margin: var(--sp-xs) var(--sp-xxs) 0;
    flex-wrap: wrap;
}
.money-cards {
    display: flex;
    gap: var(--sp-md);
}
.mcard {
    display: flex;
    flex-direction: column;
    gap: var(--sp-xxs);
    min-width: 11rem;
    padding: var(--sp-md);
    border-radius: var(--radius-xs);
    background: var(--blue-50);
    border: 1px solid var(--blue-200);
}
.mlabel {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--gray-600);
}
.mvalue {
    font-size: 1.5rem;
    line-height: 2rem;
    font-weight: 600;
    color: var(--blue-400);
}
.msub {
    font-size: 0.75rem;
    color: var(--gray-600);
}
.buckets {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
    gap: var(--sp-md);
    min-width: 20rem;
}
.bucket {
    display: flex;
    flex-direction: column;
    gap: var(--sp-xxs);
    padding: var(--sp-sm) var(--sp-md);
    border: 1px solid var(--gray-150);
    border-radius: var(--radius-xs);
}
.b-top {
    display: flex;
    justify-content: space-between;
    font-size: 0.875rem;
}
.b-name {
    font-weight: 600;
}
.b-val {
    color: var(--gray-600);
}
.bar {
    height: 0.375rem;
    border-radius: 1rem;
    background: var(--gray-100);
    overflow: hidden;
}
.fill {
    display: block;
    height: 100%;
    background: var(--green-400);
}
.b-exp {
    font-size: 0.75rem;
    color: var(--gray-500);
}
</style>
