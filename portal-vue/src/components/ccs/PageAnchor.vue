<template>
    <div class="anchor-wrapper">
        <div
            v-for="group in groups"
            :key="group.title"
            class="info-card"
        >
            <div class="card-head">
                <h3 class="card-title">{{ group.title }}</h3>
                <LfTag
                    v-if="group.tag"
                    :label="group.tag.label"
                    :color="group.tag.color"
                />
            </div>
            <p
                v-if="group.note"
                class="note"
            >
                {{ group.note }}
            </p>
            <div class="grid">
                <div
                    v-for="f in group.fields"
                    :key="f.label"
                    class="pair"
                >
                    <span class="label">{{ f.label }}</span>
                    <span class="value">
                        <RouterLink
                            v-if="f.to && f.value"
                            :to="f.to"
                            class="link"
                            >{{ f.value }}</RouterLink
                        >
                        <LfTag
                            v-else-if="f.tag && f.value"
                            :label="f.value"
                            :color="f.tagColor"
                        />
                        <template v-else>{{ f.value || '' }}</template>
                        <LfCopy
                            v-if="f.copy && f.value"
                            :value="f.value"
                            :what="f.label"
                            size="0.875rem"
                        />
                    </span>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import LfCopy from '../ui/LfCopy.vue';
import LfTag from '../ui/LfTag.vue';
import { fmtDate, fmtDateTime } from '../../lib/format.ts';
import { statusLabel } from '../../lib/status.ts';
import type { TagColor } from '../../lib/status.ts';
import type { EntityType } from '../../lib/types.ts';

interface Field {
    label: string;
    value: string;
    to?: string;
    tag?: boolean;
    tagColor?: TagColor;
    copy?: boolean;
}
interface Group {
    title: string;
    fields: Field[];
    note?: string;
    tag?: { label: string; color: TagColor };
}

/** LayoutAnchor + User/Account/Subscriber/OrganizationPageAnchor: the profile details above the tiles. */
const props = defineProps<{ entityType: EntityType; data: Record<string, any> }>(); // eslint-disable-line @typescript-eslint/no-explicit-any

const link = (t: string, id?: string) => (id ? `/customer-care/user-manager/${t}/${id}` : undefined);
const yes = (b: unknown) => (b ? 'Yes' : 'No');

const groups = computed<Group[]>(() => {
    const d = props.data;
    switch (props.entityType) {
        case 'organization': {
            const o = d.organization;
            return [
                {
                    title: 'Details',
                    fields: [
                        { label: 'Organization ID', value: o.id },
                        { label: 'Domain', value: o.domain },
                        { label: 'Name', value: o.name },
                    ],
                },
            ];
        }
        case 'user': {
            const u = d.user;
            const out: Group[] = [
                {
                    title: 'Basic info',
                    fields: [
                        { label: 'Full name', value: `${u.firstName} ${u.lastName}` },
                        { label: 'User ID', value: u.id, copy: true },
                        { label: 'First name', value: u.firstName },
                        { label: 'Last name', value: u.lastName },
                        { label: 'Middle name', value: u.middleName ?? '' },
                        { label: 'Creation date', value: fmtDateTime(u.createdAt) },
                        { label: 'Last active', value: fmtDateTime(u.lastActive) },
                        { label: 'Cardinality', value: statusLabel(u.cardinality) },
                        { label: 'Organization', value: d.organization?.name ?? '', to: link('organization', d.organization?.id) },
                    ],
                },
                {
                    title: 'Contact info',
                    fields: [
                        { label: 'E-mail', value: u.email },
                        { label: 'Email verified', value: u.emailVerified ? 'Verified' : 'Not verified', tag: true, tagColor: u.emailVerified ? 'green' : 'yellow' },
                        { label: 'MSISDN', value: u.msisdn },
                        { label: 'Verification status', value: u.verified ? 'Verified' : 'Not verified', tag: true, tagColor: u.verified ? 'green' : 'yellow' },
                        { label: 'Birthday', value: u.birthday ? fmtDate(u.birthday + 'T12:00:00Z') : '' },
                        { label: 'T&C acceptance', value: u.tcAcceptedAt ? `Accepted on ${fmtDate(u.tcAcceptedAt)}` : 'Not accepted' },
                    ],
                },
                {
                    title: 'KYC',
                    fields: [
                        { label: 'Document type', value: u.documentType ?? '' },
                        { label: 'Document number', value: u.documentNumber ?? '' },
                        { label: 'Nationality', value: u.nationality ?? '' },
                    ],
                },
                {
                    title: 'Flags',
                    fields: Object.entries(u.flags ?? {}).map(([k, v]) => ({ label: k.replace(/^is/, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()), value: yes(v) })),
                },
            ];
            if (u.accountDeletion) {
                const del = u.accountDeletion;
                out.push({
                    title: 'Account deletion',
                    tag: { label: del.status, color: del.status === 'Terminating' ? 'red' : 'yellow' },
                    note: del.status === 'Terminating' ? 'Deletion is in progress and cannot be reversed.' : 'Deletion has not started; the request can still be stopped.',
                    fields: [
                        { label: 'Status', value: del.status, tag: true, tagColor: del.status === 'Terminating' ? 'red' : 'yellow' },
                        { label: 'Schedule time', value: del.scheduleTime ? fmtDateTime(del.scheduleTime) : 'N/A' },
                        { label: 'Requested by', value: del.requestedBy },
                    ],
                });
            }
            return out;
        }
        case 'account': {
            const a = d.account;
            return [
                {
                    title: 'Details',
                    fields: [
                        { label: 'Account ID', value: a.id, copy: true },
                        { label: 'Name', value: a.name },
                        { label: 'State', value: a.state, tag: true },
                        { label: 'Owner', value: d.owner ? `${d.owner.firstName} ${d.owner.lastName}` : '', to: link('user', d.owner?.id) },
                        { label: 'Organization', value: d.organization?.name ?? '', to: link('organization', d.organization?.id) },
                        { label: 'Currency', value: a.currency },
                        { label: 'Created', value: fmtDateTime(a.createdAt) },
                        { label: 'Billing day', value: String(a.billingDay) },
                        { label: 'Payment method', value: a.paymentMethod },
                        { label: 'Address', value: a.address },
                        { label: 'Subscribers', value: String(d.subscribers?.length ?? 0) },
                        { label: 'Tax exempt', value: yes(a.taxExempt) },
                    ],
                },
            ];
        }
        case 'subscriber': {
            const s = d.subscriber;
            return [
                {
                    title: 'Details',
                    fields: [
                        { label: 'Subscriber ID', value: s.id, copy: true },
                        { label: 'MSISDN', value: s.msisdn },
                        { label: 'State', value: s.state, tag: true },
                        { label: 'IMSI', value: s.imsi },
                        { label: 'ICCID', value: s.iccid },
                        { label: 'Plan', value: s.planName },
                        { label: 'Account', value: d.account?.id ?? '', to: link('account', d.account?.id) },
                        { label: 'User', value: d.user ? `${d.user.firstName} ${d.user.lastName}` : '', to: link('user', d.user?.id) },
                        { label: 'Device', value: s.deviceModel },
                        { label: 'Created', value: fmtDateTime(s.createdAt) },
                        { label: 'Activated', value: s.activatedAt ? fmtDateTime(s.activatedAt) : 'Not activated' },
                    ],
                },
            ];
        }
    }
    return [];
});
</script>

<style scoped>
.anchor-wrapper {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.5rem;
    background: var(--gray-100);
    border-bottom: 0.25rem solid var(--blue-500);
}
.info-card {
    padding: 1.5rem 1.5rem 2.375rem;
    border: 1px solid var(--gray-150);
    border-radius: 0.5rem;
    background: var(--white);
}
.card-head {
    display: flex;
    align-items: center;
    gap: var(--sp-sm);
    margin-bottom: 2.75rem;
}
.card-title {
    font-size: 1rem;
    font-weight: 600;
}
.note {
    margin: -1.25rem 0 1.25rem;
    font-size: 0.75rem;
    color: var(--gray-600);
}
.grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    row-gap: 1rem;
    column-gap: 2rem;
}
.pair {
    display: grid;
    grid-template-columns: 9.5rem minmax(0, 1fr);
    align-items: center;
    gap: var(--sp-sm);
    font-size: 0.75rem;
    line-height: 1rem;
}
.label {
    font-weight: 600;
    color: var(--gray-800);
}
.value {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-xxs);
    min-width: 0;
    color: var(--gray-600);
    word-break: break-all;
}
@media (max-width: 1100px) {
    .grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}
</style>
