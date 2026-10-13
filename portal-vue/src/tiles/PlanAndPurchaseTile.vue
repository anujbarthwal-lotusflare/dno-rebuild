<template>
    <div class="plan-tile">
        <div class="plans">
            <div
                v-for="p in data?.plans ?? []"
                :key="p.subscriberId"
                class="plan"
            >
                <div class="plan-head">
                    <div>
                        <div class="plan-name">{{ p.planName }}</div>
                        <div class="sub">MSISDN {{ p.msisdn }} · renews {{ fmtDate(p.renewsOn) }}</div>
                    </div>
                    <div class="price">{{ fmtMoney(p.price) }}<span class="per">/mo</span></div>
                </div>
                <div class="allowances">
                    <div
                        v-for="a in p.allowances"
                        :key="a.name"
                        class="allowance"
                    >
                        <span class="a-name">{{ a.name }}</span>
                        <span class="a-val">{{ a.used }}{{ a.unit ? ' ' + a.unit : '' }} used of {{ a.total }}{{ a.total !== 'Unlimited' && a.unit ? ' ' + a.unit : '' }}</span>
                        <span class="bar"
                            ><span
                                class="fill"
                                :style="{ width: a.total === 'Unlimited' ? '15%' : `${Math.min(100, (a.used / Number(a.total)) * 100)}%` }"
                        /></span>
                    </div>
                </div>
            </div>
        </div>
        <h5 class="caps">Purchase history</h5>
        <LfDataTable
            :columns="columns"
            :rows="(data?.purchases ?? []) as unknown as Record<string, unknown>[]"
            :loading="loading"
            :error="error"
            row-key="purchaseId"
            :default-page-size="5"
        />
    </div>
</template>

<script setup lang="ts">
import LfDataTable from '../components/ui/LfDataTable.vue';
import { api, useLoad } from '../lib/api.ts';
import { fmtDate, fmtMoney } from '../lib/format.ts';
import type { Column, EntityType, TileDefinition } from '../lib/types.ts';

interface PlanData {
    plans: {
        subscriberId: string;
        msisdn: string;
        planName: string;
        price: { value: number; currency: string };
        renewsOn: string;
        allowances: { name: string; used: number; total: string; unit: string }[];
        state: string;
    }[];
    purchases: { purchaseId: string; item: string; amount: { value: number; currency: string }; purchasedAt: string; status: string }[];
}

/** Plan And Purchase: current plan(s) with allowances and the purchase history. */
const props = defineProps<{ tile: TileDefinition; entityType: EntityType; entityId: string }>();
const { data, loading, error } = useLoad(() => api<PlanData>(`/care/${props.entityType}/${props.entityId}/planAndPurchase`));
const columns: Column[] = [
    { key: 'purchaseId', label: 'Purchase ID' },
    { key: 'item', label: 'Item' },
    { key: 'amount', label: 'Amount', type: 'money' },
    { key: 'purchasedAt', label: 'Purchased At', type: 'date' },
    { key: 'status', label: 'Status', type: 'status' },
];
</script>

<style scoped>
.plan-tile {
    display: flex;
    flex-direction: column;
    gap: var(--sp-md);
    margin: var(--sp-xs) var(--sp-xxs) 0;
}
.plans {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
    gap: var(--sp-md);
}
.plan {
    padding: var(--sp-md);
    border: 1px solid var(--gray-150);
    border-radius: var(--radius-xs);
}
.plan-head {
    display: flex;
    justify-content: space-between;
    gap: var(--sp-md);
}
.plan-name {
    font-size: 1rem;
    font-weight: 600;
}
.sub {
    font-size: 0.75rem;
    color: var(--gray-600);
}
.price {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--blue-400);
    white-space: nowrap;
}
.per {
    font-size: 0.75rem;
    font-weight: 400;
    color: var(--gray-600);
}
.allowances {
    display: flex;
    flex-direction: column;
    gap: var(--sp-xs);
    margin-top: var(--sp-sm);
}
.allowance {
    display: grid;
    grid-template-columns: 4rem 1fr;
    gap: 0.125rem var(--sp-xs);
    font-size: 0.75rem;
}
.a-name {
    font-weight: 600;
}
.a-val {
    color: var(--gray-600);
}
.bar {
    grid-column: 1 / -1;
    height: 0.375rem;
    border-radius: 1rem;
    background: var(--gray-100);
    overflow: hidden;
}
.fill {
    display: block;
    height: 100%;
    background: var(--blue-400);
    border-radius: 1rem;
}
.caps {
    text-transform: uppercase;
    color: var(--blue-300);
}
</style>
