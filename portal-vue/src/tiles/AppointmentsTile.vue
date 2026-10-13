<template>
    <div class="appointments">
        <div
            v-if="loading && !appt"
            class="muted"
        >
            Loading...
        </div>
        <LfEmptyState
            v-else-if="!appt"
            description="No appointments found"
        />
        <div
            v-else
            class="card"
        >
            <div class="date-block">
                <div class="day">{{ dayNumber }}</div>
                <div class="month">{{ monthYear }}</div>
            </div>
            <div class="info">
                <div class="weekday">{{ weekday(appt.start) }}</div>
                <div class="time">{{ fmtTime(appt.start) }} - {{ fmtTime(appt.end) }}</div>
                <div class="meta"><span class="k">Type:</span> {{ appt.activityType }}</div>
                <div class="meta"><span class="k">ID:</span> {{ appt.id }}</div>
                <div class="links">
                    <LfButton
                        v-if="appt.agentNote"
                        variant="tertiary_s"
                        label="Read note"
                        @click="noteOpen = !noteOpen"
                    />
                    <LfButton
                        variant="tertiary_s"
                        icon="EditIcon"
                        label="Edit"
                        @click="openEdit"
                    />
                </div>
                <div
                    v-if="noteOpen && appt.agentNote"
                    class="note"
                >
                    <div class="note-time">{{ fmtDateTime(appt.agentNoteTime) }}</div>
                    {{ appt.agentNote }}
                </div>
            </div>
        </div>
        <LfModal
            v-if="editOpen && appt"
            :title="`Edit ${appt.activityType} Appointment`"
            width="40rem"
            @close="editOpen = false"
        >
            <div class="form">
                <div class="current">
                    <div class="k">Current time slot</div>
                    <div>{{ fmtDate(appt.start) }}, {{ fmtTime(appt.start) }} - {{ fmtTime(appt.end) }}</div>
                </div>
                <LfToggle
                    v-model="changeTime"
                    label="Change appointment time"
                />
                <div
                    v-if="changeTime"
                    class="two"
                >
                    <LfInput
                        v-model="date"
                        type="date"
                        label="Appointment date"
                        :min="today"
                    />
                    <LfSelect
                        v-model="time"
                        label="Appointment time"
                        :options="slots"
                        placeholder="Select time"
                    />
                </div>
                <LfInput
                    v-model="agentNote"
                    type="textarea"
                    :rows="3"
                    label="Agent notes"
                    optional
                    hint="Not visible to end users"
                />
                <LfToggle
                    v-model="notify"
                    label="Notify customer about the appointment schedule"
                />
                <p
                    v-if="formError"
                    class="error"
                >
                    {{ formError }}
                </p>
            </div>
            <template #footer>
                <LfButton
                    variant="tertiary_m"
                    label="Cancel"
                    @click="editOpen = false"
                />
                <LfButton
                    label="Save"
                    @click="askConfirm"
                />
            </template>
        </LfModal>
        <LfModal
            v-if="confirmOpen"
            title="Are you sure you want to edit this appointment?"
            width="32rem"
            @close="confirmOpen = false"
        >
            <p class="confirm-text">The customer's appointment will be updated{{ notify ? ' and they will be notified' : '' }}.</p>
            <template #footer>
                <LfButton
                    variant="tertiary_m"
                    label="Cancel"
                    @click="confirmOpen = false"
                />
                <LfButton
                    label="Confirm"
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
import LfEmptyState from '../components/ui/LfEmptyState.vue';
import LfInput from '../components/ui/LfInput.vue';
import LfModal from '../components/ui/LfModal.vue';
import LfSelect from '../components/ui/LfSelect.vue';
import LfToggle from '../components/ui/LfToggle.vue';
import { api, useLoad } from '../lib/api.ts';
import { fmtDate, fmtDateTime, fmtTime, isoDay, localHM, weekday, zonedToUtc } from '../lib/format.ts';
import { showToast } from '../lib/toast.ts';
import type { EntityType, TileDefinition } from '../lib/types.ts';

interface Appointment {
    id: string;
    activityType: string;
    start: string;
    end: string;
    agentNote?: string;
    agentNoteTime?: string;
    notifyCustomer: boolean;
}

/** Appointments: the next field-service appointment, note preview, edit with confirmation. */
const props = defineProps<{ tile: TileDefinition; entityType: EntityType; entityId: string }>();
const { data, loading, reload } = useLoad(() => api<Appointment[]>(`/care/subscriber/${props.entityId}/appointments`));
const appt = computed(() => data.value?.[0]);
const noteOpen = ref(false);

const dayNumber = computed(() => (appt.value ? isoDay(appt.value.start).slice(8) : ''));
const monthYear = computed(() => {
    if (!appt.value) return '';
    const d = new Date(appt.value.start);
    return d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
});

const editOpen = ref(false);
const confirmOpen = ref(false);
const changeTime = ref(false);
const date = ref('');
const time = ref<string | null>(null);
const agentNote = ref('');
const notify = ref(true);
const saving = ref(false);
const formError = ref('');
const today = isoDay(new Date().toISOString());
const slots = ['08:00', '10:00', '12:00', '13:00', '15:00', '17:00'].map((t) => ({ value: t, label: `${t} - ${String(Number(t.slice(0, 2)) + 2).padStart(2, '0')}:00` }));

function openEdit(): void {
    if (!appt.value) return;
    changeTime.value = false;
    date.value = isoDay(appt.value.start);
    time.value = localHM(appt.value.start);
    agentNote.value = '';
    notify.value = appt.value.notifyCustomer;
    formError.value = '';
    editOpen.value = true;
}
function askConfirm(): void {
    formError.value = '';
    if (changeTime.value && (!date.value || !time.value)) {
        formError.value = 'Choose the appointment date and time';
        return;
    }
    confirmOpen.value = true;
}
async function save(): Promise<void> {
    if (!appt.value) return;
    saving.value = true;
    try {
        // the agent picks a slot in their own time zone; the API takes UTC
        const utc = changeTime.value && time.value ? zonedToUtc(date.value, time.value).toISOString() : '';
        await api(`/care/appointment/${appt.value.id}`, 'PATCH', {
            changeTime: changeTime.value,
            date: utc.slice(0, 10),
            startTime: utc.slice(11, 16),
            agentNote: agentNote.value,
            notifyCustomer: notify.value,
        });
        confirmOpen.value = false;
        editOpen.value = false;
        showToast('success', 'Appointment updated');
        await reload();
    } catch (e) {
        confirmOpen.value = false;
        formError.value = (e as Error).message;
    } finally {
        saving.value = false;
    }
}
</script>

<style scoped>
.appointments {
    margin: var(--sp-xs) var(--sp-xxs) 0;
}
.muted {
    font-size: 0.875rem;
    color: var(--gray-500);
}
.card {
    display: flex;
    gap: var(--sp-md);
    padding: var(--sp-md);
    border: 1px solid var(--gray-150);
    border-radius: var(--radius-xs);
}
.date-block {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-width: 4rem;
    padding: var(--sp-xs);
    border-radius: var(--radius-xs);
    background: var(--blue-100);
    color: var(--blue-400);
    align-self: flex-start;
}
.day {
    font-size: 1.5rem;
    line-height: 2rem;
    font-weight: 600;
}
.month {
    font-size: 0.75rem;
}
.info {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
    font-size: 0.875rem;
}
.weekday {
    font-weight: 600;
    color: var(--gray-800);
}
.time {
    color: var(--gray-800);
}
.meta {
    font-size: 0.75rem;
    color: var(--gray-600);
    word-break: break-all;
}
.k {
    font-weight: 600;
    color: var(--gray-800);
}
.links {
    display: flex;
    gap: var(--sp-md);
    margin-top: var(--sp-xs);
}
.note {
    margin-top: var(--sp-xs);
    padding: var(--sp-xs);
    border-radius: var(--radius-xs);
    background: var(--gray-50);
    font-size: 0.75rem;
    color: var(--gray-600);
}
.note-time {
    font-weight: 600;
    color: var(--gray-800);
}
.form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-lg);
    padding: var(--sp-md) 0;
}
.current {
    font-size: 0.875rem;
    color: var(--gray-600);
}
.two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--sp-md);
}
.error {
    font-size: 0.75rem;
    color: var(--red-600);
}
.confirm-text {
    font-size: 0.875rem;
    color: var(--gray-600);
    padding-bottom: var(--sp-xs);
}
</style>
