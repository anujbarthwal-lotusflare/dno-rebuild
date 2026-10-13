<template>
    <div class="c360">
        <div class="head">
            <div class="title-row">
                <RouterLink
                    :to="`/customer-management/${kind}-customers`"
                    class="crumb"
                    >{{ kind === 'business' ? 'Business Customers' : 'Residential Customers' }}</RouterLink
                >
                <span class="slash">/</span>
                <h1 class="name">{{ header?.name }}</h1>
                <LfTag
                    v-if="header"
                    :label="statusLabel(header.status)"
                />
            </div>
            <div
                v-if="header"
                class="sub"
            >
                <span>{{ header.id }}</span>
                <LfCopy
                    :value="header.id"
                    what="customer ID"
                />
                <span class="bar">|</span>
                <span>{{ header.type }}</span>
                <span class="bar">|</span>
                <span>{{ header.segment }}</span>
            </div>
        </div>
        <div
            v-if="header"
            class="strip"
        >
            <div class="info">
                <LfIcon
                    name="PhoneIcon"
                    size="1.75rem"
                    class="info-icon"
                />
                <div class="info-text">
                    <span class="info-label">Phone Number</span>
                    <span class="info-value">{{ header.phone || '-' }}</span>
                </div>
                <LfCopy
                    v-if="header.phone"
                    :value="header.phone"
                    what="phone number"
                    class="info-copy"
                />
            </div>
            <div class="info">
                <LfIcon
                    name="EmailIcon"
                    size="1.75rem"
                    class="info-icon"
                />
                <div class="info-text">
                    <span class="info-label">Email</span>
                    <a
                        v-if="header.email"
                        class="info-value link-value"
                        :href="`mailto:${header.email}`"
                        >{{ header.email }}</a
                    >
                    <span
                        v-else
                        class="info-value"
                        >-</span
                    >
                </div>
                <LfCopy
                    v-if="header.email"
                    :value="header.email"
                    what="email"
                    class="info-copy"
                />
            </div>
            <div class="info">
                <LfIcon
                    name="consistency/sidebar-home"
                    size="1.75rem"
                    class="info-icon"
                />
                <div class="info-text">
                    <span class="info-label">Postal Address</span>
                    <span
                        class="info-value"
                        :title="header.postalAddress"
                        >{{ header.postalAddress || '-' }}</span
                    >
                </div>
                <LfCopy
                    v-if="header.postalAddress"
                    :value="header.postalAddress"
                    what="address"
                    class="info-copy"
                />
            </div>
            <template v-if="kind === 'business'">
                <span class="divider" />
                <div class="info">
                    <LfIcon
                        name="UserIcon"
                        size="1.75rem"
                        class="info-icon"
                    />
                    <div class="info-text">
                        <span class="info-label">Billing Responsible Person</span>
                        <span
                            class="info-value link-value"
                            :title="header.billingResponsiblePerson"
                            >{{ header.billingResponsiblePerson || '-' }}</span
                        >
                    </div>
                </div>
                <div class="info">
                    <LfIcon
                        name="UserIcon"
                        size="1.75rem"
                        class="info-icon"
                    />
                    <div class="info-text">
                        <span class="info-label">Customer Signatory Person</span>
                        <span
                            class="info-value link-value"
                            :title="header.customerSignatoryPerson"
                            >{{ header.customerSignatoryPerson || '-' }}</span
                        >
                    </div>
                </div>
            </template>
        </div>
        <LfTabs
            v-model="tab"
            :tabs="tabs"
        >
            <template #after>
                <button
                    type="button"
                    class="tab-edit"
                    title="Edit general information"
                    aria-label="Edit general information"
                    @click="tab = 'general'"
                >
                    <LfIcon name="EditIcon" />
                </button>
            </template>
        </LfTabs>
        <div
            v-if="loadError"
            class="err"
        >
            <LfEmptyState :error="loadError" />
        </div>
        <component
            :is="TABS[tab]"
            v-else-if="header"
            :kind="kind"
            :id="id"
            @changed="reloadHeader"
        />
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { Component } from 'vue';
import LfCopy from '../components/ui/LfCopy.vue';
import LfEmptyState from '../components/ui/LfEmptyState.vue';
import LfIcon from '../components/ui/LfIcon.vue';
import LfTabs from '../components/ui/LfTabs.vue';
import LfTag from '../components/ui/LfTag.vue';
import GeneralTab from '../components/c360/GeneralTab.vue';
import OrdersTab from '../components/c360/OrdersTab.vue';
import PortfolioTab from '../components/c360/PortfolioTab.vue';
import QuotesTab from '../components/c360/QuotesTab.vue';
import AccountsTab from '../components/c360/AccountsTab.vue';
import BillsTab from '../components/c360/BillsTab.vue';
import PaymentsTab from '../components/c360/PaymentsTab.vue';
import ProvisioningTab from '../components/c360/ProvisioningTab.vue';
import { api } from '../lib/api.ts';
import { statusLabel } from '../lib/status.ts';

interface Header {
    id: string;
    name: string;
    status: string;
    type: string;
    segment: string;
    phone: string;
    email: string;
    postalAddress: string;
    billingResponsiblePerson: string;
    customerSignatoryPerson: string;
}

/** Customer 360 (residential and business): header, contact strip and tabs. */
const props = defineProps<{ kind: 'residential' | 'business'; id: string }>();
const TABS: Record<string, Component> = {
    general: GeneralTab,
    orders: OrdersTab,
    portfolio: PortfolioTab,
    quotes: QuotesTab,
    accounts: AccountsTab,
    bills: BillsTab,
    payments: PaymentsTab,
    provisioning: ProvisioningTab,
};
const tabs = computed(() =>
    [
        { key: 'general', label: 'General information' },
        { key: 'orders', label: 'Orders' },
        { key: 'portfolio', label: 'Product portfolio' },
        ...(props.kind === 'business' ? [{ key: 'quotes', label: 'Quotes' }] : []),
        { key: 'accounts', label: 'Accounts' },
        { key: 'bills', label: 'Bills' },
        { key: 'payments', label: 'Payments' },
        { key: 'provisioning', label: 'Provisioning Records' },
    ],
);
const tab = ref('portfolio');
const header = ref<Header>();
const loadError = ref('');

async function reloadHeader(): Promise<void> {
    try {
        header.value = await api<Header>(`/customer360/${props.kind}/${props.id}`);
    } catch (e) {
        loadError.value = (e as Error).message;
    }
}
onMounted(reloadHeader);
</script>

<style scoped>
.c360 {
    min-height: 100%;
    background: var(--white);
}
.head {
    padding: 1rem 2rem 1.25rem;
}
.title-row {
    display: flex;
    align-items: center;
    gap: var(--sp-xs);
}
.crumb {
    font-size: 1.125rem;
    line-height: 2rem;
    color: var(--gray-500);
}
.crumb:hover {
    color: var(--blue-400);
}
.slash {
    font-size: 1.125rem;
    color: var(--gray-500);
}
.name {
    font-size: 1.125rem;
    line-height: 2rem;
    font-weight: 600;
    margin-right: var(--sp-xs);
}
.sub {
    display: flex;
    align-items: center;
    gap: var(--sp-xs);
    margin-top: 0.25rem;
    font-size: 0.75rem;
    color: var(--gray-600);
}
.bar {
    margin: 0 0.25rem;
}
.strip {
    display: flex;
    align-items: center;
    gap: 2rem;
    padding: 1rem 2rem;
    border-top: 1px solid var(--gray-150);
}
.info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
    min-width: 0;
}
.info-icon {
    color: var(--gray-800);
}
.info-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
}
.info-label {
    font-size: 0.75rem;
    line-height: 1.25rem;
    color: var(--gray-600);
}
.info-value {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.75rem;
    line-height: 1.25rem;
    font-weight: 600;
    color: var(--gray-800);
}
.link-value {
    color: var(--blue-400);
}
.info-copy {
    margin-left: auto;
}
.divider {
    align-self: stretch;
    width: 1px;
    background: var(--gray-150);
}
.tab-edit {
    display: flex;
    margin-left: 0.5rem;
    color: var(--blue-300);
}
.tab-edit:hover {
    color: var(--blue-400);
}
.err {
    padding: 2rem;
}
.c360 :deep(.lf-tabs .tab) {
    min-width: 7rem;
    padding-inline: 1.25rem;
}
</style>
