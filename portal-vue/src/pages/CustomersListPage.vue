<template>
    <div class="page">
        <LfHeader
            :title="title"
            :count="rows.length"
        />
        <div class="body">
            <LfDataTable
                :columns="columns"
                :rows="rows"
                :loading="loading"
                :error="error"
                :raw="data"
                clickable
                :default-page-size="15"
                @row-click="open"
                @link="(e) => open(e.row)"
            />
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import LfDataTable from '../components/ui/LfDataTable.vue';
import LfHeader from '../components/ui/LfHeader.vue';
import { api, useLoad } from '../lib/api.ts';
import type { Column } from '../lib/types.ts';

/** Residential / Business customers (TMF632 parties) with a link into Customer 360. */
const props = defineProps<{ kind: 'residential' | 'business' }>();
const router = useRouter();
const title = props.kind === 'business' ? 'Business Customers' : 'Residential Customers';
const { data, loading, error } = useLoad(() => api<Record<string, unknown>[]>(`/customer360/${props.kind}`));
const rows = computed(() => data.value ?? []);
const columns: Column[] = [
    { key: 'name', label: 'Name', type: 'link:user' },
    { key: 'id', label: 'Customer ID' },
    { key: 'status', label: 'Status', type: 'status' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone Number' },
    { key: 'category', label: 'Category' },
    { key: 'accounts', label: 'Accounts' },
];
function open(row: Record<string, unknown>): void {
    void router.push(`/customer-management/${props.kind}-customer/${String(row.id)}`);
}
</script>

<style scoped>
.body {
    padding: var(--sp-xl) var(--sp-2xl);
}
</style>
