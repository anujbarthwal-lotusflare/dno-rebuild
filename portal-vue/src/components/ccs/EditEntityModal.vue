<template>
    <LfModal
        :title="title"
        width="40rem"
        @close="emit('close')"
    >
        <form
            class="form"
            @submit.prevent="save"
        >
            <template v-if="entityType === 'user'">
                <div class="two">
                    <LfInput
                        v-model="form.firstName"
                        label="First name"
                    />
                    <LfInput
                        v-model="form.lastName"
                        label="Last name"
                    />
                </div>
                <LfInput
                    v-model="form.middleName"
                    label="Middle name"
                    optional
                />
                <div class="two">
                    <LfInput
                        v-model="form.email"
                        label="E-mail"
                        type="email"
                    />
                    <LfInput
                        v-model="form.msisdn"
                        label="MSISDN"
                    />
                </div>
                <div class="two">
                    <LfInput
                        v-model="form.birthday"
                        label="Birthday"
                        type="date"
                        optional
                    />
                    <LfInput
                        v-model="form.nationality"
                        label="Nationality"
                        optional
                    />
                </div>
            </template>
            <template v-else-if="entityType === 'account'">
                <LfInput
                    v-model="form.name"
                    label="Account name"
                />
                <LfInput
                    v-model="form.address"
                    label="Address"
                />
                <div class="two">
                    <LfInput
                        v-model="form.paymentMethod"
                        label="Payment method"
                    />
                    <LfInput
                        v-model="form.billingDay"
                        label="Billing day"
                        type="number"
                        min="1"
                        max="28"
                    />
                </div>
                <LfCheckbox
                    :model-value="form.taxExempt === 'true'"
                    label="Tax exempt"
                    @update:model-value="(v) => (form.taxExempt = String(v))"
                />
            </template>
            <template v-else>
                <LfSelect
                    v-model="form.state"
                    label="State"
                    :options="stateOptions"
                />
                <LfInput
                    v-model="form.planName"
                    label="Plan"
                />
                <LfInput
                    v-model="form.deviceModel"
                    label="Device"
                />
            </template>
            <p
                v-if="error"
                class="error"
            >
                {{ error }}
            </p>
        </form>
        <template #footer>
            <LfButton
                variant="tertiary_m"
                label="Cancel"
                @click="emit('close')"
            />
            <LfButton
                label="Save"
                :loading="saving"
                @click="save"
            />
        </template>
    </LfModal>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import LfButton from '../ui/LfButton.vue';
import LfCheckbox from '../ui/LfCheckbox.vue';
import LfInput from '../ui/LfInput.vue';
import LfModal from '../ui/LfModal.vue';
import LfSelect from '../ui/LfSelect.vue';
import { api } from '../../lib/api.ts';
import { showToast } from '../../lib/toast.ts';
import type { EntityType, SelectOption } from '../../lib/types.ts';

/** Edit User / Edit Account / Edit Subscriber. */
const props = defineProps<{ entityType: Exclude<EntityType, 'organization'>; entity: Record<string, unknown> }>();
const emit = defineEmits<{ close: []; saved: [] }>();

const title = computed(() => ({ user: 'Edit User', account: 'Edit Account', subscriber: 'Edit Subscriber' })[props.entityType]);
const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));
const form = reactive<Record<string, string | null>>(Object.fromEntries(Object.entries(props.entity).map(([k, v]) => [k, str(v)])));
const saving = ref(false);
const error = ref('');

const NEXT: Record<string, string[]> = {
    'Pending activation': ['Active', 'Terminated'],
    Active: ['Suspended', 'Terminated'],
    Suspended: ['Active', 'Terminated'],
    Terminated: [],
};
const stateOptions = computed<SelectOption[]>(() => {
    const cur = str(props.entity.state);
    return [cur, ...(NEXT[cur] ?? [])].map((s) => ({ value: s, label: s }));
});

async function save(): Promise<void> {
    error.value = '';
    saving.value = true;
    try {
        let body: Record<string, unknown>;
        if (props.entityType === 'user') body = { firstName: form.firstName, lastName: form.lastName, middleName: form.middleName, email: form.email, msisdn: form.msisdn, birthday: form.birthday, nationality: form.nationality };
        else if (props.entityType === 'account') body = { name: form.name, address: form.address, paymentMethod: form.paymentMethod, billingDay: Number(form.billingDay), taxExempt: form.taxExempt === 'true' };
        else body = { state: form.state, planName: form.planName, deviceModel: form.deviceModel };
        await api(`/care/${props.entityType}/${str(props.entity.id)}`, 'PATCH', body);
        showToast('success', `${title.value.replace('Edit ', '')} updated`);
        emit('saved');
    } catch (e) {
        error.value = (e as Error).message;
    } finally {
        saving.value = false;
    }
}
</script>

<style scoped>
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
