<template>
    <div
        v-if="data"
        class="label"
    >
        <div class="head">Broadband Facts</div>
        <div class="provider">{{ data.provider }}</div>
        <div class="plan">{{ data.planName }}</div>
        <div class="type">{{ data.serviceType }}</div>
        <div class="bar thick" />
        <div class="line big">
            <span>Monthly Price</span><span>{{ fmtMoney(data.monthlyPrice) }}</span>
        </div>
        <p class="small">{{ data.introductoryRate }}</p>
        <div class="line">
            <span>Contract length</span><span>{{ data.contractLength }}</span>
        </div>
        <div class="bar" />
        <div class="section">Additional Charges &amp; Terms</div>
        <div class="sub">Provider Monthly Fees</div>
        <div
            v-for="f in data.monthlyFees"
            :key="f.name"
            class="line indent"
        >
            <span>{{ f.name }}</span><span>{{ fmtMoney(f.value, data.monthlyPrice.currency) }}</span>
        </div>
        <div class="sub">One-time Fees at the Time of Purchase</div>
        <div
            v-for="f in data.oneTimeFees"
            :key="f.name"
            class="line indent"
        >
            <span>{{ f.name }}</span><span>{{ fmtMoney(f.value, data.monthlyPrice.currency) }}</span>
        </div>
        <div class="bar" />
        <div class="section">Discounts &amp; Bundles</div>
        <p class="small">{{ data.discounts }}</p>
        <div class="bar thick" />
        <div class="section">Speeds Provided with Plan</div>
        <div class="line indent">
            <span>Typical Download Speed</span><span>{{ data.speeds.download }} Mbps</span>
        </div>
        <div class="line indent">
            <span>Typical Upload Speed</span><span>{{ data.speeds.upload }} Mbps</span>
        </div>
        <div class="line indent">
            <span>Typical Latency</span><span>{{ data.speeds.latency }} ms</span>
        </div>
        <div class="bar" />
        <div class="line">
            <span class="section">Data Included with Monthly Price</span><span>{{ data.dataIncluded }}</span>
        </div>
        <div class="bar thick" />
        <p class="small">Unique Plan Identifier: {{ data.labelId }}</p>
    </div>
    <LfEmptyState
        v-else-if="!loading"
        :error="error"
    />
</template>

<script setup lang="ts">
import LfEmptyState from '../components/ui/LfEmptyState.vue';
import { api, useLoad } from '../lib/api.ts';
import { fmtMoney } from '../lib/format.ts';
import type { EntityType, TileDefinition } from '../lib/types.ts';

interface Facts {
    provider: string;
    planName: string;
    serviceType: string;
    monthlyPrice: { value: number; currency: string };
    introductoryRate: string;
    contractLength: string;
    oneTimeFees: { name: string; value: number }[];
    monthlyFees: { name: string; value: number }[];
    discounts: string;
    speeds: { download: number; upload: number; latency: number };
    dataIncluded: string;
    labelId: string;
}

/** Broadband facts: the consumer broadband label of the plan. */
const props = defineProps<{ tile: TileDefinition; entityType: EntityType; entityId: string }>();
const { data, loading, error } = useLoad(() => api<Facts>(`/care/${props.entityType}/${props.entityId}/broadbandFacts`));
</script>

<style scoped>
.label {
    margin: var(--sp-xs) var(--sp-xxs);
    padding: var(--sp-sm);
    border: 2px solid var(--gray-800);
    font-size: 0.75rem;
    line-height: 1.125rem;
    color: var(--gray-800);
}
.head {
    font-size: 1.25rem;
    line-height: 1.75rem;
    font-weight: 700;
}
.provider,
.plan {
    font-weight: 600;
}
.type {
    color: var(--gray-600);
}
.bar {
    border-top: 1px solid var(--gray-800);
    margin: var(--sp-xs) 0;
}
.bar.thick {
    border-top-width: 5px;
}
.line {
    display: flex;
    justify-content: space-between;
    gap: var(--sp-sm);
}
.line.big {
    font-size: 0.875rem;
    font-weight: 700;
}
.indent {
    padding-left: var(--sp-sm);
}
.section {
    font-weight: 700;
}
.sub {
    font-weight: 600;
    margin-top: var(--sp-xxs);
}
.small {
    color: var(--gray-600);
}
</style>
