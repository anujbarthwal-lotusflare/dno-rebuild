<template>
    <div class="general">
        <div
            v-if="data"
            class="cards"
        >
            <section class="card">
                <div class="card-head">
                    <h3>Profile</h3>
                </div>
                <dl class="kv">
                    <template v-if="data.party['@type'] === 'Organization'">
                        <dt>Name</dt>
                        <dd>{{ data.party.name }}</dd>
                        <dt>Trading name</dt>
                        <dd>{{ data.party.tradingName || '-' }}</dd>
                        <dt>Organization type</dt>
                        <dd>{{ data.party.organizationType || '-' }}</dd>
                        <dt>Legal entity</dt>
                        <dd>{{ data.party.isLegalEntity ? 'Yes' : 'No' }}</dd>
                        <dt>Head office</dt>
                        <dd>{{ data.party.isHeadOffice ? 'Yes' : 'No' }}</dd>
                    </template>
                    <template v-else>
                        <dt>Given name</dt>
                        <dd>{{ data.party.givenName }}</dd>
                        <dt>Family name</dt>
                        <dd>{{ data.party.familyName }}</dd>
                    </template>
                    <dt>Status</dt>
                    <dd><LfTag :label="statusLabel(data.party.status)" /></dd>
                    <dt>Last update</dt>
                    <dd>{{ fmtDateTime(data.party.lastUpdate) || '-' }}</dd>
                </dl>
            </section>

            <section class="card">
                <div class="card-head">
                    <h3>Contact Medium</h3>
                    <LfButton
                        variant="secondary"
                        icon="EditIcon"
                        label="Edit"
                        @click="openEdit"
                    />
                </div>
                <LfDataTable
                    :columns="contactColumns"
                    :rows="contactRows"
                    hide-header
                    :paginate="false"
                    :can-select-columns="false"
                    empty-text="No contact medium"
                />
            </section>

            <section class="card">
                <div class="card-head"><h3>Identifications</h3></div>
                <LfDataTable
                    :columns="idColumns"
                    :rows="data.identifications.map((r, i) => ({ id: i, ...r }))"
                    hide-header
                    :paginate="false"
                    :can-select-columns="false"
                    empty-text="No identifications"
                />
            </section>

            <section class="card">
                <div class="card-head"><h3>Credit Profiles</h3></div>
                <LfDataTable
                    :columns="creditColumns"
                    :rows="data.creditProfile.map((r, i) => ({ id: i, ...r }))"
                    hide-header
                    :paginate="false"
                    :can-select-columns="false"
                    empty-text="No credit profile"
                />
            </section>
        </div>
        <LfEmptyState
            v-else-if="error"
            :error="error"
        />

        <LfModal
            v-if="editOpen"
            title="Edit contact medium"
            width="40rem"
            @close="editOpen = false"
        >
            <div class="form">
                <LfInput
                    v-model="edit.phone"
                    label="Phone Number"
                />
                <LfInput
                    v-model="edit.email"
                    label="Email"
                    type="email"
                />
                <LfInput
                    v-model="edit.street"
                    label="Street"
                />
                <div class="two">
                    <LfInput
                        v-model="edit.city"
                        label="City"
                    />
                    <LfInput
                        v-model="edit.postCode"
                        label="Post code"
                    />
                </div>
                <p
                    v-if="editError"
                    class="error"
                >
                    {{ editError }}
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
                    :loading="saving"
                    @click="save"
                />
            </template>
        </LfModal>
    </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import LfButton from '../ui/LfButton.vue';
import LfDataTable from '../ui/LfDataTable.vue';
import LfEmptyState from '../ui/LfEmptyState.vue';
import LfInput from '../ui/LfInput.vue';
import LfModal from '../ui/LfModal.vue';
import LfTag from '../ui/LfTag.vue';
import { api, useLoad } from '../../lib/api.ts';
import { fmtDateTime } from '../../lib/format.ts';
import { statusLabel } from '../../lib/status.ts';
import { showToast } from '../../lib/toast.ts';
import type { Column } from '../../lib/types.ts';

interface ContactMedium {
    '@type': string;
    preferred?: boolean;
    [k: string]: unknown;
}
interface General {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    party: Record<string, any>;
    contactMedium: ContactMedium[];
    identifications: { type: string; value: string; issuedBy?: string }[];
    creditProfile: { creditScore?: number; creditProfileDate?: string; creditRiskRating?: number }[];
}

/** General information: profile, contact medium (editable), identifications, credit profiles. */
const props = defineProps<{ kind: 'residential' | 'business'; id: string }>();
const emit = defineEmits<{ changed: [] }>();
const { data, error, reload } = useLoad(() => api<General>(`/customer360/${props.kind}/${props.id}/general`));

const TYPE: Record<string, string> = { PhoneContactMedium: 'Phone', EmailContactMedium: 'Email', GeographicAddressContactMedium: 'Postal address' };
const cmValue = (c: ContactMedium) =>
    c['@type'] === 'PhoneContactMedium' ? String(c.phoneNumber ?? '') : c['@type'] === 'EmailContactMedium' ? String(c.emailAddress ?? '') : [c.street1, c.city, c.postCode, c.country].filter(Boolean).join(', ');
const contactRows = computed(() => (data.value?.contactMedium ?? []).map((c, i) => ({ id: i, type: TYPE[c['@type']] ?? c['@type'], value: cmValue(c), preferred: c.preferred ? 'Yes' : 'No' })));
const contactColumns: Column[] = [
    { key: 'type', label: 'Type' },
    { key: 'value', label: 'Value' },
    { key: 'preferred', label: 'Preferred' },
];
const idColumns: Column[] = [
    { key: 'type', label: 'Type' },
    { key: 'value', label: 'Number' },
    { key: 'issuedBy', label: 'Issued by' },
];
const creditColumns: Column[] = [
    { key: 'creditScore', label: 'Credit score' },
    { key: 'creditRiskRating', label: 'Risk rating' },
    { key: 'creditProfileDate', label: 'Date' },
];

const editOpen = ref(false);
const saving = ref(false);
const editError = ref('');
const edit = reactive({ phone: '', email: '', street: '', city: '', postCode: '' });
function openEdit(): void {
    const cms = data.value?.contactMedium ?? [];
    const find = (t: string) => cms.find((c) => c['@type'] === t);
    edit.phone = String(find('PhoneContactMedium')?.phoneNumber ?? '');
    edit.email = String(find('EmailContactMedium')?.emailAddress ?? '');
    const addr = find('GeographicAddressContactMedium');
    edit.street = String(addr?.street1 ?? '');
    edit.city = String(addr?.city ?? '');
    edit.postCode = String(addr?.postCode ?? '');
    editError.value = '';
    editOpen.value = true;
}
async function save(): Promise<void> {
    if (edit.email && !/^[^\s@]+@[^\s@]+$/.test(edit.email)) {
        editError.value = 'Enter a valid email address';
        return;
    }
    const others = (data.value?.contactMedium ?? []).filter((c) => !TYPE[c['@type']]);
    const contactMedium: ContactMedium[] = [...others];
    if (edit.phone) contactMedium.push({ '@type': 'PhoneContactMedium', preferred: true, phoneNumber: edit.phone });
    if (edit.email) contactMedium.push({ '@type': 'EmailContactMedium', preferred: true, emailAddress: edit.email });
    if (edit.street || edit.city) contactMedium.push({ '@type': 'GeographicAddressContactMedium', preferred: true, street1: edit.street, city: edit.city, postCode: edit.postCode });
    saving.value = true;
    try {
        await api(`/customer360/${props.kind}/${props.id}/general`, 'PATCH', { contactMedium });
        editOpen.value = false;
        showToast('success', 'Contact medium updated');
        await reload();
        emit('changed');
    } catch (e) {
        editError.value = (e as Error).message;
    } finally {
        saving.value = false;
    }
}
</script>

<style scoped>
.general {
    padding: 1.5rem 2rem;
    background: var(--gray-100);
    min-height: 30rem;
}
.cards {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1.25rem;
}
.card {
    padding: 1.25rem 1.5rem;
    border-radius: 0.5rem;
    background: var(--white);
    border: 1px solid var(--gray-150);
}
.card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 2.5rem;
    margin-bottom: 0.75rem;
}
.card :deep(th:first-child),
.card :deep(td:first-child) {
    padding-left: 0.75rem;
}
.kv {
    display: grid;
    grid-template-columns: 10rem 1fr;
    gap: 0.75rem 1rem;
    margin: 0;
    font-size: 0.875rem;
}
dt {
    font-weight: 600;
}
dd {
    margin: 0;
    color: var(--gray-600);
}
.form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-md);
    padding: var(--sp-md) 0;
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
</style>
