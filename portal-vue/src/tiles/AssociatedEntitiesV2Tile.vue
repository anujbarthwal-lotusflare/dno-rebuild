<template>
    <div class="cards">
        <LfEmptyState
            v-if="!loading && !(data?.rows.length)"
            :error="error"
        />
        <RouterLink
            v-for="r in data?.rows ?? []"
            :key="r.entityType + r.id"
            :to="`/customer-care/user-manager/${r.entityType}/${r.id}`"
            class="card"
        >
            <div class="top">
                <span class="level">{{ r.level }}</span>
                <LfTag :label="r.state" />
            </div>
            <div class="name">{{ r.name }}</div>
            <div class="id">{{ r.id }}</div>
            <div
                v-if="r.msisdn"
                class="msisdn"
            >
                MSISDN {{ r.msisdn }}
            </div>
        </RouterLink>
    </div>
</template>

<script setup lang="ts">
import LfEmptyState from '../components/ui/LfEmptyState.vue';
import LfTag from '../components/ui/LfTag.vue';
import { api, useLoad } from '../lib/api.ts';
import type { EntityType, TileDefinition } from '../lib/types.ts';

/** Associated Entities Tiles: the same hierarchy as cards. */
const props = defineProps<{ tile: TileDefinition; entityType: EntityType; entityId: string }>();
const { data, loading, error } = useLoad(() =>
    api<{ rows: { level: string; entityType: string; id: string; name: string; msisdn: string; state: string }[] }>(`/care/${props.entityType}/${props.entityId}/associatedEntities`),
);
</script>

<style scoped>
.cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
    gap: var(--sp-sm);
    margin: var(--sp-xs) var(--sp-xxs);
}
.card {
    display: flex;
    flex-direction: column;
    gap: var(--sp-xxs);
    padding: var(--sp-sm);
    border: 1px solid var(--gray-150);
    border-radius: var(--radius-xs);
    color: var(--gray-800);
    transition: background 0.15s;
}
.card:hover {
    background: var(--gray-25);
    border-color: var(--blue-300);
}
.top {
    display: flex;
    justify-content: space-between;
    align-items: center;
}
.level {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--blue-300);
}
.name {
    font-size: 0.875rem;
    font-weight: 600;
}
.id {
    font-size: 0.75rem;
    color: var(--blue-400);
    word-break: break-all;
}
.msisdn {
    font-size: 0.75rem;
    color: var(--gray-600);
}
</style>
