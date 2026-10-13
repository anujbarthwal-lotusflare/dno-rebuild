<template>
    <div>
        <LfDataTable
            :columns="columns"
            :rows="rows"
            :loading="loading"
            :error="error"
            :raw="data"
            clickable
            :row-actions="rowActions"
            @row-click="(r) => (selected = r as unknown as Note)"
        >
            <template #headerActions>
                <LfButton
                    icon="PlusIcon"
                    label="New Note"
                    class="new-note"
                    @click="openModal"
                />
            </template>
        </LfDataTable>
        <LfSidePanel
            :visible="!!selected"
            header="Agent Note"
            :cards="panelCards"
            @close="selected = undefined"
        >
            <section
                v-if="selected?.attachments.length"
                class="files"
            >
                <h5 class="caps">Attachments</h5>
                <a
                    v-for="a in selected.attachments"
                    :key="a.id"
                    class="file link"
                    :href="`/api/care/attachment/${a.id}`"
                    :download="a.name"
                >
                    <LfIcon name="DownloadIcon" />
                    {{ a.name }}
                </a>
            </section>
        </LfSidePanel>
        <LfModal
            v-if="modalOpen"
            title="New Note"
            width="47.5rem"
            @close="modalOpen = false"
        >
            <template
                v-if="msisdn"
                #headerRight
            >
                <span class="msisdn">MSISDN: {{ msisdn }}</span>
            </template>
            <div class="form">
                <LfSelect
                    v-model="tags"
                    label="Note tags"
                    :options="tagOptions"
                    multiple
                    placeholder="Select note tags"
                    :error="tagsError"
                />
                <div class="notes-label">Agent notes</div>
                <LfInput
                    v-model="text"
                    type="textarea"
                    :rows="4"
                    placeholder="Add a note"
                    :error="textError"
                    :maxlength="5000"
                />
                <LfFileUploader
                    v-model="files"
                    class="uploader"
                    :disabled="saving"
                />
            </div>
            <template #footer>
                <LfButton
                    variant="tertiary_m"
                    label="Cancel"
                    @click="modalOpen = false"
                />
                <LfButton
                    label="Save"
                    :loading="saving"
                    @click="save"
                />
            </template>
        </LfModal>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import LfButton from '../components/ui/LfButton.vue';
import LfDataTable from '../components/ui/LfDataTable.vue';
import LfFileUploader from '../components/ui/LfFileUploader.vue';
import LfIcon from '../components/ui/LfIcon.vue';
import LfInput from '../components/ui/LfInput.vue';
import LfModal from '../components/ui/LfModal.vue';
import LfSelect from '../components/ui/LfSelect.vue';
import LfSidePanel from '../components/ui/LfSidePanel.vue';
import { api, fileToBase64, useLoad } from '../lib/api.ts';
import { fmtDateTime } from '../lib/format.ts';
import { showToast, toastError } from '../lib/toast.ts';
import type { Column, EntityType, RowAction, SidePanelCard, TileDefinition } from '../lib/types.ts';

interface Note {
    id: string;
    entityType: string;
    entityId: string;
    timestamp: string;
    agentName: string;
    note: string;
    tags: string[];
    attachments: { id: string; name: string; type: string; size: number }[];
}

/** Agent Notes: notes with tags and attachments; New Note modal, details side panel, attachment download. */
const props = defineProps<{ tile: TileDefinition; entityType: EntityType; entityId: string }>();
const { data, loading, error, reload } = useLoad(() => api<Note[]>(`/care/${props.entityType}/${props.entityId}/notes`));
const rows = computed(() => (data.value ?? []) as unknown as Record<string, unknown>[]);
const ENTITY_LABEL: Record<string, string> = { user: 'User', account: 'Account', subscriber: 'Subscriber', organization: 'Organization' };

const columns: Column[] = [
    { key: 'timestamp', label: 'Timestamp', type: 'date' },
    { key: 'agentName', label: 'Agent name' },
    { key: 'note', label: 'Note' },
    { key: 'tags', label: 'Tags', type: 'tags' },
    { key: 'entityId', label: 'Entity ID' },
    { key: 'entityType', label: 'Entity Type', format: (r) => ENTITY_LABEL[String(r.entityType)] ?? String(r.entityType) },
];

const rowActions = (row: Record<string, unknown>): RowAction[] => {
    const note = row as unknown as Note;
    return [
        { label: 'View', icon: 'EyeShowIcon', onClick: () => (selected.value = note) },
        { label: 'Download', icon: 'DownloadIcon', disabled: !note.attachments.length, onClick: () => downloadAll(note) },
    ];
};
function downloadAll(note: Note): void {
    for (const a of note.attachments) {
        const link = document.createElement('a');
        link.href = `/api/care/attachment/${a.id}`;
        link.download = a.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
    }
}

const selected = ref<Note>();
const panelCards = computed<SidePanelCard[]>(() => {
    const n = selected.value;
    if (!n) return [];
    return [
        {
            title: 'General',
            items: [
                { label: 'Timestamp', value: fmtDateTime(n.timestamp) },
                { label: 'Agent name', value: n.agentName },
                { label: 'Note', value: n.note },
                { label: 'Tags', value: n.tags.join(', ') },
                { label: 'Entity ID', value: n.entityId },
                { label: 'Entity Type', value: ENTITY_LABEL[n.entityType] ?? n.entityType },
            ],
        },
    ];
});

// new note
const modalOpen = ref(false);
const tagOptions = ref<{ value: string; label: string }[]>([]);
const tags = ref<string[]>([]);
const text = ref('');
const files = ref<File[]>([]);
const saving = ref(false);
const tagsError = ref('');
const textError = ref('');
const msisdn = ref('');

async function openModal(): Promise<void> {
    tags.value = [];
    text.value = '';
    files.value = [];
    tagsError.value = '';
    textError.value = '';
    modalOpen.value = true;
    try {
        if (!tagOptions.value.length) tagOptions.value = (await api<string[]>('/care/noteTags')).map((t) => ({ value: t, label: t }));
        if (props.entityType === 'subscriber' && !msisdn.value) msisdn.value = (await api<{ subscriber: { msisdn: string } }>(`/care/subscriber/${props.entityId}`)).subscriber.msisdn;
    } catch (e) {
        toastError(e);
    }
}
async function save(): Promise<void> {
    tagsError.value = tags.value.length ? '' : 'Select at least one tag';
    textError.value = text.value.trim() ? '' : 'Agent notes are required';
    if (tagsError.value || textError.value) return;
    saving.value = true;
    try {
        const attachments = await Promise.all(files.value.map(async (f) => ({ name: f.name, type: f.type || guessType(f.name), content: await fileToBase64(f) })));
        await api(`/care/${props.entityType}/${props.entityId}/notes`, 'POST', { tags: tags.value, note: text.value, attachments });
        modalOpen.value = false;
        showToast('success', 'Note saved', 'The agent note was added.');
        await reload();
    } catch (e) {
        toastError(e, 'Could not save the note');
    } finally {
        saving.value = false;
    }
}
function guessType(name: string): string {
    const ext = name.split('.').pop()?.toLowerCase();
    return ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'doc' ? 'application/msword' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
}
</script>

<style scoped>
.form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-md);
    padding: var(--sp-xl) 0;
}
.notes-label {
    font-size: 0.75rem;
    color: var(--gray-800);
    margin-bottom: calc(-1 * var(--sp-xs));
}
.uploader {
    margin-top: var(--sp-sm);
}
.msisdn {
    font-size: 0.875rem;
    color: var(--gray-600);
}
.new-note {
    white-space: nowrap;
}
.files {
    display: flex;
    flex-direction: column;
    gap: var(--sp-xs);
}
.caps {
    text-transform: uppercase;
    color: var(--blue-300);
}
.file {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-xs);
    font-size: 0.875rem;
}
</style>
