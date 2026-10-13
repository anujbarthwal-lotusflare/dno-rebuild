<template>
    <div class="page">
        <LfHeader title="External Log History" />
        <div class="body">
            <form
                class="filters"
                @submit.prevent="reload"
            >
                <LfSelect
                    v-model="entityType"
                    class="type"
                    :options="types"
                    placeholder="All users"
                    clearable
                />
                <LfInput
                    v-model="entityId"
                    class="id"
                    :placeholder="entityType ? 'Entity ID' : 'Choose an entity type to filter by ID'"
                    :disabled="!entityType"
                    mono
                />
                <LfButton
                    type="submit"
                    icon="SearchIcon"
                    label="Search"
                    :loading="loading"
                />
            </form>
            <LfDataTable
                :columns="columns"
                :rows="rows"
                :loading="loading"
                :error="error"
                :raw="data"
                clickable
                :default-page-size="15"
                @row-click="(r) => (selected = r)"
            />
        </div>
        <LfSidePanel
            :visible="!!selected"
            header="External Log"
            :cards="cards"
            @close="selected = undefined"
        />
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import LfButton from '../components/ui/LfButton.vue';
import LfDataTable from '../components/ui/LfDataTable.vue';
import LfHeader from '../components/ui/LfHeader.vue';
import LfInput from '../components/ui/LfInput.vue';
import LfSelect from '../components/ui/LfSelect.vue';
import LfSidePanel from '../components/ui/LfSidePanel.vue';
import { api, useLoad } from '../lib/api.ts';
import { fmtDateTime } from '../lib/format.ts';
import type { Column, SidePanelCard } from '../lib/types.ts';

/** Customer Care > External Log History: calls the portal made to external systems on behalf of customers. */
const entityType = ref<string | null>(null);
const entityId = ref('');
const types = [
    { value: 'user', label: 'User' },
    { value: 'account', label: 'Account' },
    { value: 'subscriber', label: 'Subscriber' },
];
const { data, loading, error, reload } = useLoad(() => {
    const q = entityType.value && entityId.value.trim() ? `?entityType=${entityType.value}&entityId=${encodeURIComponent(entityId.value.trim())}` : '';
    return api<Record<string, unknown>[]>(`/care/externalLogHistory${q}`);
});
const rows = computed(() => data.value ?? []);
const columns: Column[] = [
    { key: 'id', label: 'ID' },
    { key: 'timestamp', label: 'Timestamp', type: 'date' },
    { key: 'agent', label: 'Agent' },
    { key: 'service', label: 'Service' },
    { key: 'method', label: 'Method', type: 'method' },
    { key: 'endpoint', label: 'Endpoint' },
    { key: 'statusCode', label: 'Status', type: 'code' },
];
const selected = ref<Record<string, unknown>>();
const cards = computed<SidePanelCard[]>(() =>
    selected.value
        ? [
              {
                  title: 'General',
                  items: [
                      { label: 'ID', value: selected.value.id },
                      { label: 'Timestamp', value: fmtDateTime(selected.value.timestamp) },
                      { label: 'Agent', value: selected.value.agent },
                      { label: 'Service', value: selected.value.service },
                      { label: 'Request', value: `${String(selected.value.method)} ${String(selected.value.endpoint)}` },
                      { label: 'Status', value: selected.value.statusCode },
                      { label: 'Entity', value: `${String(selected.value.entityType)} ${String(selected.value.entityId)}` },
                  ],
              },
          ]
        : [],
);
</script>

<style scoped>
.body {
    display: flex;
    flex-direction: column;
    gap: var(--sp-lg);
    padding: var(--sp-xl) var(--sp-2xl);
}
.filters {
    display: flex;
    align-items: center;
    gap: var(--sp-sm);
}
.type {
    width: 12rem;
}
.id {
    width: 24rem;
}
</style>
