<template>
    <div class="page">
        <LfHeader title="Search Results" />
        <div class="section-layout">
            <LfBreadcrumb
                :items="[
                    { label: 'Search', to: '/customer-care/user-manager' },
                    { label: 'Search Results' },
                ]"
            />
            <p class="query">
                {{ optionLabel }} {{ operatorLabel }} <strong>{{ value }}</strong>
            </p>
            <LfDataTable
                :columns="columns"
                :rows="rows"
                :loading="loading"
                :error="error"
                clickable
                empty-text="No results found"
                @row-click="open"
                @link="(e) => open(e.row)"
            />
        </div>
        <div class="section-layout">
            <LfButton
                label="Cancel"
                @click="router.push('/customer-care/user-manager')"
            />
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import LfBreadcrumb from '../components/ui/LfBreadcrumb.vue';
import LfButton from '../components/ui/LfButton.vue';
import LfDataTable from '../components/ui/LfDataTable.vue';
import LfHeader from '../components/ui/LfHeader.vue';
import { api, useLoad } from '../lib/api.ts';
import type { Column } from '../lib/types.ts';

/** UserSearchResultsPage: shown when a search ("starts with") matches more than one profile. */
const route = useRoute();
const router = useRouter();
const option = String(route.query.option ?? '');
const operator = String(route.query.operator ?? 'match');
const value = String(route.query.value ?? '');
const LABELS: Record<string, string> = { accountId: 'Account ID', email: 'E-mail', imsi: 'IMSI', subscriberId: 'Subscriber ID', msisdn: 'MSISDN', userId: 'User ID', organizationId: 'Organization ID' };
const optionLabel = LABELS[option] ?? option;
const operatorLabel = operator === 'startsWith' ? 'starts with' : 'equal to';

const { data, loading, error } = useLoad(() => api<{ results: Record<string, unknown>[] }>('/care/search', 'POST', { option, operator, value }));
const rows = computed(() => data.value?.results ?? []);
const TYPE: Record<string, string> = { user: 'User', account: 'Account', subscriber: 'Subscriber', organization: 'Organization' };
const columns: Column[] = [
    { key: 'name', label: 'Name' },
    { key: 'id', label: 'ID', type: 'link:user' },
    { key: 'entityType', label: 'Type', format: (r) => TYPE[String(r.entityType)] ?? String(r.entityType) },
    { key: 'email', label: 'E-mail' },
    { key: 'msisdn', label: 'MSISDN' },
    { key: 'state', label: 'State', type: 'status' },
];
function open(row: Record<string, unknown>): void {
    void router.push(`/customer-care/user-manager/${String(row.entityType)}/${String(row.id)}`);
}
</script>

<style scoped>
.page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-xl);
    min-height: 100%;
}
.section-layout {
    display: flex;
    flex-direction: column;
    gap: var(--sp-md);
    padding: 0 var(--sp-2xl);
}
.query {
    font-size: 0.875rem;
    color: var(--gray-600);
}
</style>
