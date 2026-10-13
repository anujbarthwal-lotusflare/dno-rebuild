<template>
    <div class="page">
        <LfHeader title="Message History" />
        <div class="body">
            <LfDataTable
                :columns="columns"
                :rows="rows"
                :loading="loading"
                :error="error"
                :raw="data"
                clickable
                @row-click="(r) => (selected = r)"
                @link="(e) => router.push(`/customer-care/user-manager/user/${e.id}`)"
            />
        </div>
        <LfSidePanel
            :visible="!!selected"
            header="Message"
            :cards="cards"
            @close="selected = undefined"
        />
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import LfDataTable from '../components/ui/LfDataTable.vue';
import LfHeader from '../components/ui/LfHeader.vue';
import LfSidePanel from '../components/ui/LfSidePanel.vue';
import { api, useLoad } from '../lib/api.ts';
import { fmtDateTime } from '../lib/format.ts';
import type { Column, SidePanelCard } from '../lib/types.ts';

/** Messages > Message History: messages sent to end users across the tenant. */
const router = useRouter();
const { data, loading, error } = useLoad(() => api<Record<string, unknown>[]>('/care/messageHistory'));
const rows = computed(() => (data.value ?? []).map((r, i) => ({ id: i, ...r })));
const columns: Column[] = [
    { key: 'sentAt', label: 'Sent at', type: 'date' },
    { key: 'recipient', label: 'Recipient' },
    { key: 'userId', label: 'User ID', type: 'link:user' },
    { key: 'channel', label: 'Channel' },
    { key: 'message', label: 'Message' },
    { key: 'status', label: 'Status', type: 'status' },
];
const selected = ref<Record<string, unknown>>();
const cards = computed<SidePanelCard[]>(() =>
    selected.value
        ? [
              {
                  title: 'General',
                  items: [
                      { label: 'Sent at', value: fmtDateTime(selected.value.sentAt) },
                      { label: 'Recipient', value: selected.value.recipient },
                      { label: 'Channel', value: selected.value.channel },
                      { label: 'Message', value: selected.value.message },
                      { label: 'Status', value: selected.value.status, tag: true },
                  ],
              },
          ]
        : [],
);
</script>

<style scoped>
.body {
    padding: var(--sp-xl) var(--sp-2xl);
}
</style>
