<template>
    <LfDataTable
        class="standalone"
        title="Provisioning Records"
        show-count
        :columns="columns"
        :rows="rows"
        :loading="loading"
        :error="error"
        :raw="data"
        :default-page-size="15"
        empty-text="No provisioning records"
    />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import LfDataTable from '../ui/LfDataTable.vue';
import { api, useLoad } from '../../lib/api.ts';
import { fmtDateTime } from '../../lib/format.ts';
import type { Column } from '../../lib/types.ts';

/** Provisioning Records: the service records behind each product. */
const props = defineProps<{ kind: 'residential' | 'business'; id: string }>();
const { data, loading, error } = useLoad(() => api<Record<string, unknown>[]>(`/customer360/${props.kind}/${props.id}/provisioning`));
const rows = computed(() => data.value ?? []);
const columns: Column[] = [
    { key: 'id', label: 'Record ID' },
    { key: 'productName', label: 'Product' },
    { key: 'serviceType', label: 'Service' },
    { key: 'createdAt', label: 'Created', format: (r) => fmtDateTime(r.createdAt, true) },
    { key: 'state', label: 'State', type: 'status' },
];
</script>
