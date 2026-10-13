<template>
    <div class="page">
        <LfHeader title="Settings" />
        <div class="layout">
            <nav class="menu">
                <RouterLink
                    v-for="item in MENU"
                    :key="item.slug"
                    :to="`/settings/${item.slug}`"
                    :class="['menu-item', { active: item.slug === section }]"
                    >{{ item.label }}</RouterLink
                >
            </nav>
            <div class="content">
                <template v-if="section === 'user-settings'">
                    <h1 class="title">User Settings</h1>
                    <p class="subtitle">These changes will impact entire portal</p>

                    <h2 class="group">General</h2>
                    <LfSelect
                        class="field"
                        label="Timezone"
                        size="large"
                        filterable
                        :model-value="settings.timezone"
                        :options="zoneOptions"
                        @update:model-value="(v) => update({ timezone: String(v) })"
                    />

                    <div class="field">
                        <LfLabel>Date format</LfLabel>
                        <div class="cards three">
                            <button
                                v-for="f in DATE_FORMATS"
                                :key="f.value"
                                type="button"
                                :class="['card', { selected: settings.dateFormat === f.value }]"
                                @click="update({ dateFormat: f.value })"
                            >
                                <span class="card-title">{{ f.value }}</span>
                                <span class="card-example">Example: {{ f.example }}</span>
                            </button>
                        </div>
                    </div>

                    <div class="field">
                        <LfLabel>Time format</LfLabel>
                        <div class="cards two">
                            <button
                                v-for="f in TIME_FORMATS"
                                :key="f.value"
                                type="button"
                                :class="['card', { selected: settings.timeFormat === f.value }]"
                                @click="update({ timeFormat: f.value })"
                            >
                                <span class="card-title">{{ f.label }}</span>
                                <span class="card-example">Example {{ f.example }}</span>
                            </button>
                        </div>
                    </div>

                    <h2 class="group">Preferences</h2>
                    <LfSelect
                        class="field"
                        label="Default user search parameter"
                        size="large"
                        :model-value="settings.userSearchParam"
                        :options="SEARCH_PARAMS"
                        @update:model-value="(v) => update({ userSearchParam: String(v) })"
                    />
                </template>
                <template v-else>
                    <h1 class="title">{{ currentLabel }}</h1>
                    <LfEmptyState description="This settings area belongs to a DNO module outside the Customer Care Suite rebuild." />
                </template>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import LfEmptyState from '../components/ui/LfEmptyState.vue';
import LfHeader from '../components/ui/LfHeader.vue';
import LfLabel from '../components/ui/LfLabel.vue';
import LfSelect from '../components/ui/LfSelect.vue';
import { gmtOffset, saveSettings, settings } from '../lib/settings.ts';
import type { DateFormat, Settings } from '../lib/settings.ts';
import { showToast, toastError } from '../lib/toast.ts';
import type { SelectOption } from '../lib/types.ts';

/** Settings with the User Settings page: time zone, date and time format, default user search parameter. */
const props = defineProps<{ section: string }>();

const MENU = [
    { slug: 'tenant-management', label: 'Tenant Management' },
    { slug: 'company-settings', label: 'Company Settings' },
    { slug: 'user-settings', label: 'User Settings' },
    { slug: 'remote-configuration', label: 'Remote Configuration' },
    { slug: 'user-management', label: 'User Management' },
    { slug: 'roles-management', label: 'Roles Management' },
    { slug: 'quiet-hours', label: 'Quiet Hours' },
    { slug: 'campaign-categories', label: 'Campaign categories' },
    { slug: 'application-management', label: 'Application Management' },
    { slug: 'manual-proxy-request', label: 'Manual Proxy Request' },
    { slug: 'third-party-applications', label: 'Third-party Applications' },
    { slug: 'consent-configuration', label: 'Consent Configuration' },
];
const currentLabel = computed(() => MENU.find((m) => m.slug === props.section)?.label ?? 'Settings');

const DATE_FORMATS: { value: DateFormat; example: string }[] = [
    { value: 'DD-MM-YYYY', example: '31-12-2020' },
    { value: 'MM-DD-YYYY', example: '12-31-2020' },
    { value: 'YYYY-MM-DD', example: '2020-12-31' },
];
const TIME_FORMATS: { value: '12' | '24'; label: string; example: string }[] = [
    { value: '12', label: '12 hour', example: '1:00 PM' },
    { value: '24', label: '24 hour', example: '13:00' },
];
const SEARCH_PARAMS: SelectOption[] = [
    { value: 'accountId', label: 'Account ID' },
    { value: 'email', label: 'E-mail' },
    { value: 'imsi', label: 'IMSI' },
    { value: 'subscriberId', label: 'Subscriber ID' },
    { value: 'msisdn', label: 'MSISDN' },
    { value: 'userId', label: 'User ID' },
];

const zones: string[] = (() => {
    try {
        return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf('timeZone');
    } catch {
        return ['UTC', 'Europe/London', 'Asia/Kolkata', 'Asia/Singapore', 'Africa/Johannesburg', 'America/New_York', 'America/Los_Angeles'];
    }
})();
const zoneOptions = computed<SelectOption[]>(() =>
    // browsers list canonical names (Asia/Calcutta); keep the saved alias (Asia/Kolkata) selectable
    (zones.includes(settings.timezone) ? zones : [...zones, settings.timezone])
        .map((z) => ({ z, off: gmtOffset(z) }))
        .sort((a, b) => offsetMinutes(a.off) - offsetMinutes(b.off) || a.z.localeCompare(b.z))
        .map(({ z, off }) => ({ value: z, label: `(${off}) ${z}` })),
);
function offsetMinutes(off: string): number {
    const m = /GMT([+-])(\d{2}):(\d{2})/.exec(off);
    return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
}

async function update(patch: Partial<Settings>): Promise<void> {
    try {
        await saveSettings(patch);
        showToast('success', 'Settings saved', undefined, 2000);
    } catch (e) {
        toastError(e, 'Could not save settings');
    }
}
</script>

<style scoped>
.page {
    display: flex;
    flex-direction: column;
    min-height: 100%;
}
.layout {
    flex: 1;
    display: flex;
}
.menu {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    width: 15.625rem;
    flex-shrink: 0;
    padding: 2.5rem 1.25rem 2rem 0;
    background: var(--gray-50);
}
.menu-item {
    padding: 0.625rem 1.25rem;
    border-radius: 0 2rem 2rem 0;
    font-size: 0.875rem;
    line-height: 1.5rem;
    color: var(--gray-600);
}
.menu-item:hover {
    background: var(--gray-100);
}
.menu-item.active {
    background: var(--gray-150);
    color: var(--blue-400);
    font-weight: 600;
}
.content {
    flex: 1;
    max-width: 30rem;
    padding: 2.5rem 1.5rem 3rem;
}
.title {
    font-size: 1.5rem;
    line-height: 2rem;
}
.subtitle {
    font-size: 0.875rem;
    color: var(--gray-600);
}
.group {
    margin: 1.75rem 0 1rem;
    font-size: 1.125rem;
    line-height: 1.75rem;
}
.field {
    margin-bottom: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: var(--sp-xs);
}
.cards {
    display: grid;
    gap: 0.75rem;
}
.cards.three {
    grid-template-columns: repeat(3, 1fr);
}
.cards.two {
    grid-template-columns: repeat(2, 1fr);
}
.card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 1rem 0.5rem;
    border: 1px solid var(--gray-150);
    border-radius: var(--radius-xs);
    background: var(--white);
}
.card:hover {
    background: var(--gray-50);
}
.card.selected {
    background: #e4e7f0;
    border-color: #e4e7f0;
}
.card-title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--blue-400);
}
.card-example {
    font-size: 0.75rem;
    color: var(--gray-600);
}
</style>
