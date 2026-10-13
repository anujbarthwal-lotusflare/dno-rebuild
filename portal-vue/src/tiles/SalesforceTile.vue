<template>
    <div>
        <LfDataTable
            :columns="columns"
            :rows="rows"
            :loading="loading"
            :raw="rows"
            clickable
            @row-click="(r) => (selected = r)"
        >
            <template #headerActions>
                <LfSelect
                    v-model="accountId"
                    class="account"
                    :options="accountOptions"
                    placeholder="Account ID"
                />
                <LfButton
                    icon="SearchIcon"
                    label="Search"
                    :disabled="!accountId"
                    :loading="loading"
                    @click="search"
                />
            </template>
        </LfDataTable>
        <LfSidePanel
            :visible="!!selected"
            header="Salesforce Message"
            :cards="panelCards"
            @close="selected = undefined"
        />
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import LfButton from '../components/ui/LfButton.vue';
import LfDataTable from '../components/ui/LfDataTable.vue';
import LfSelect from '../components/ui/LfSelect.vue';
import LfSidePanel from '../components/ui/LfSidePanel.vue';
import { api } from '../lib/api.ts';
import { fmtDateTime } from '../lib/format.ts';
import { toastError } from '../lib/toast.ts';
import type { Column, EntityType, SelectOption, SidePanelCard, TileDefinition } from '../lib/types.ts';

/** Salesforce Message History: pick an account of the user, Search, open a message in the side panel. */
const props = defineProps<{ tile: TileDefinition; entityType: EntityType; entityId: string }>();
const accountOptions = ref<SelectOption[]>([]);
const accountId = ref<string | null>(null);
const rows = ref<Record<string, unknown>[]>([]);
const loading = ref(false);
const selected = ref<Record<string, unknown>>();

const columns: Column[] = [
    { key: 'campaignName', label: 'Campaign Name' },
    { key: 'messageSent', label: 'Message Sent', type: 'date' },
    { key: 'subject', label: 'Subject' },
];
const panelCards = computed<SidePanelCard[]>(() => {
    const m = selected.value;
    if (!m) return [];
    return [
        {
            title: 'General',
            items: [
                { label: 'Campaign Name', value: m.campaignName },
                { label: 'Message Sent', value: fmtDateTime(m.messageSent) },
                { label: 'Sender', value: m.sender },
                { label: 'Subject', value: m.subject },
                { label: 'Message', value: m.message },
            ],
        },
    ];
});

onMounted(async () => {
    try {
        const u = await api<{ accounts: { id: string }[] }>(`/care/user/${props.entityId}`);
        accountOptions.value = u.accounts.map((a) => ({ value: a.id, label: a.id }));
    } catch (e) {
        toastError(e);
    }
});
async function search(): Promise<void> {
    if (!accountId.value) return;
    loading.value = true;
    try {
        rows.value = await api(`/care/account/${accountId.value}/salesforceMessages`);
    } catch (e) {
        toastError(e, 'Could not load messages');
    } finally {
        loading.value = false;
    }
}
</script>

<style scoped>
.account {
    width: 20.75rem;
}
</style>
