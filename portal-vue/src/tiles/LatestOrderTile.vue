<template>
    <div class="latest">
        <LfEmptyState
            v-if="!loading && !data"
            description="No orders"
        />
        <dl
            v-else-if="data"
            class="kv"
        >
            <dt>Order ID</dt>
            <dd class="id">{{ data.orderId }}</dd>
            <dt>Friendly ID</dt>
            <dd>{{ data.friendlyOrderId }}</dd>
            <dt>Order date</dt>
            <dd>{{ fmtDateTime(data.orderDate) }}</dd>
            <dt>Status</dt>
            <dd><LfTag :label="String(data.status)" /></dd>
            <dt>Total</dt>
            <dd>{{ fmtMoney(data.total) }}</dd>
            <dt>Payment</dt>
            <dd>{{ data.paymentMethod }}</dd>
        </dl>
    </div>
</template>

<script setup lang="ts">
import LfEmptyState from '../components/ui/LfEmptyState.vue';
import LfTag from '../components/ui/LfTag.vue';
import { api, useLoad } from '../lib/api.ts';
import { fmtDateTime, fmtMoney } from '../lib/format.ts';
import type { EntityType, TileDefinition } from '../lib/types.ts';

/** Latest Order Details V2: the most recent order of the user's first account. */
const props = defineProps<{ tile: TileDefinition; entityType: EntityType; entityId: string }>();
const { data, loading } = useLoad(() => api<Record<string, unknown> | null>(`/care/user/${props.entityId}/latestOrder`));
</script>

<style scoped>
.kv {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: var(--sp-xs) var(--sp-md);
    margin: var(--sp-xs) var(--sp-xxs);
    font-size: 0.875rem;
}
dt {
    font-weight: 600;
}
dd {
    margin: 0;
    color: var(--gray-600);
    min-width: 0;
}
.id {
    font-size: 0.75rem;
    word-break: break-all;
}
</style>
