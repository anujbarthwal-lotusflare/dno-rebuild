<template>
    <div class="page">
        <LfHeader title="Customer Care Suite" />
        <div class="content-container">
            <SearchBanner
                title="Search for users"
                primary-text="Choose parameter by which you want to search users."
            />
            <form
                class="search-form"
                data-test-id="um-search-form"
                @submit.prevent="onSearch"
            >
                <span class="caps">Find users with</span>
                <LfSelect
                    v-model="option"
                    class="option-select"
                    :options="optionChoices"
                    menu-min-width="12rem"
                    @change="onOptionChange"
                />
                <LfSelect
                    v-model="operator"
                    class="operator-select"
                    :options="operatorChoices"
                    menu-min-width="12rem"
                />
                <div class="value">
                    <LfInput
                        v-model="value"
                        :placeholder="placeholder"
                        mono
                        :error="validation"
                    />
                </div>
                <div class="go">
                    <LfButton
                        type="submit"
                        label="Search"
                        icon="SearchIcon"
                        :loading="loading"
                    />
                </div>
            </form>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import LfHeader from '../components/ui/LfHeader.vue';
import LfSelect from '../components/ui/LfSelect.vue';
import LfInput from '../components/ui/LfInput.vue';
import LfButton from '../components/ui/LfButton.vue';
import SearchBanner from '../components/ccs/SearchBanner.vue';
import { api, ApiError } from '../lib/api.ts';
import { settings } from '../lib/settings.ts';
import { showToast, toastError } from '../lib/toast.ts';
import type { SelectOption } from '../lib/types.ts';

interface SearchOptionDef {
    key: string;
    label: string;
    placeholder: string;
    operators: string[];
}

const router = useRouter();
const options = ref<SearchOptionDef[]>([]);
const operators = ref<{ key: string; label: string }[]>([]);
const option = ref<string | null>(null);
const operator = ref<string | null>('match');
const value = ref('');
const validation = ref('');
const loading = ref(false);

// the original lists Account ID, E-mail, IMSI, Subscriber ID, MSISDN (+ User ID where enabled)
const optionChoices = computed<SelectOption[]>(() => options.value.filter((o) => o.key !== 'organizationId').map((o) => ({ value: o.key, label: o.label })));
const current = computed(() => options.value.find((o) => o.key === option.value));
const operatorChoices = computed<SelectOption[]>(() => operators.value.map((o) => ({ value: o.key, label: o.label, disabled: !current.value?.operators.includes(o.key) })));
const placeholder = computed(() => current.value?.placeholder ?? '');

function onOptionChange(): void {
    if (current.value && !current.value.operators.includes(operator.value ?? '')) operator.value = current.value.operators[0] ?? 'match';
    validation.value = '';
}

onMounted(async () => {
    try {
        const res = await api<{ options: SearchOptionDef[]; operators: { key: string; label: string }[] }>('/care/searchOptions');
        options.value = res.options;
        operators.value = res.operators;
        option.value = settings.userSearchParam && res.options.some((o) => o.key === settings.userSearchParam) ? settings.userSearchParam : (res.options[0]?.key ?? null);
        onOptionChange();
    } catch (e) {
        toastError(e, 'Could not load the search parameters');
    }
});
// the default parameter may arrive after the page (settings load in the background)
watch(
    () => settings.userSearchParam,
    (p) => {
        if (!value.value && options.value.some((o) => o.key === p)) {
            option.value = p;
            onOptionChange();
        }
    },
);

async function onSearch(): Promise<void> {
    validation.value = '';
    const v = value.value.trim();
    if (!v) {
        validation.value = `${current.value?.label ?? 'Value'} is required`;
        return;
    }
    if (option.value === 'email' && operator.value === 'match' && !/^[^\s@]+@[^\s@]+$/.test(v)) {
        validation.value = 'Enter a valid e-mail address';
        return;
    }
    loading.value = true;
    try {
        const res = await api<{ entityType: string; results: { entityType: string; id: string }[] }>('/care/search', 'POST', { option: option.value, operator: operator.value, value: v });
        if (res.results.length === 1) {
            const r = res.results[0]!;
            await router.push(`/customer-care/user-manager/${r.entityType}/${r.id}`);
        } else {
            await router.push({ path: '/customer-care/user-manager/search-results', query: { option: option.value ?? '', operator: operator.value ?? 'match', value: v } });
        }
    } catch (e) {
        if (e instanceof ApiError && e.status === 404) showToast('error', e.message);
        else toastError(e, 'Search failed');
    } finally {
        loading.value = false;
    }
}
</script>

<style scoped>
.page {
    min-height: 100%;
    background: var(--white);
}
.content-container {
    width: 70%;
    margin: 0 15%;
}
.search-form {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    flex-wrap: wrap;
    row-gap: var(--sp-sm);
}
.caps {
    padding-right: var(--sp-md);
    line-height: 2rem;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--blue-300);
}
.option-select,
.operator-select {
    width: fit-content;
    min-width: 9rem;
    margin-right: var(--sp-xs);
    white-space: nowrap;
}
.value {
    flex: 1;
    max-width: 600px;
    padding-right: 1.25rem;
}
.go {
    margin-left: auto;
}
.go :deep(.lf-button) {
    margin-top: -0.25rem;
}
</style>
