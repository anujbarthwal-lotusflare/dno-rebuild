<template>
    <div class="assoc">
        <div
            v-if="entityType === 'organization' && data?.organization"
            class="org"
        >
            <h3>Organization: {{ data.organization.name }}</h3>
            <LfCopy
                :value="data.organization.id"
                what="organization ID"
            />
        </div>
        <LfDataTable
            :columns="columns"
            :rows="rows"
            :loading="loading"
            :error="error"
            :raw="data"
            row-key="id"
            @link="open"
        />
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import LfCopy from '../components/ui/LfCopy.vue';
import LfDataTable from '../components/ui/LfDataTable.vue';
import { api, useLoad } from '../lib/api.ts';
import type { Column, EntityType, TileDefinition } from '../lib/types.ts';

interface Assoc {
    organization?: { id: string; name: string };
    rows: { level: string; entityType: EntityType; id: string; name: string; msisdn: string; state: string }[];
}

/** Associated Entities: the profile's parents and children; IDs open that profile. */
const props = defineProps<{ tile: TileDefinition; entityType: EntityType; entityId: string }>();
const router = useRouter();
const { data, loading, error } = useLoad(() => api<Assoc>(`/care/${props.entityType}/${props.entityId}/associatedEntities`));
const rows = computed(() => (data.value?.rows ?? []) as unknown as Record<string, unknown>[]);
const columns: Column[] = [
    { key: 'level', label: 'Level' },
    { key: 'msisdn', label: 'MSISDN' },
    { key: 'id', label: 'ID', type: 'link:account', format: (r) => String(r.id) },
    { key: 'state', label: 'State', type: 'status' },
];
function open(e: { row: Record<string, unknown> }): void {
    void router.push(`/customer-care/user-manager/${String(e.row.entityType)}/${String(e.row.id)}`);
}
</script>

<style scoped>
.org {
    display: flex;
    align-items: center;
    gap: var(--sp-xs);
    margin: 0 var(--sp-xxs) var(--sp-sm);
}
.org h3 {
    font-size: 1rem;
}
</style>
