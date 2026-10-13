import { computed, ref, watch } from 'vue';
import type { Ref } from 'vue';
import { api } from '../lib/api.ts';
import { showToast, toastError } from '../lib/toast.ts';
import type { EntityType, SelectOption } from '../lib/types.ts';

export interface BillingSummary {
    accountId: string;
    currency: string;
    amountDue: number;
    latestUnpaidInvoiceId?: string;
    latestInvoiceId?: string;
    remainingBalance: number;
    transactions: Record<string, unknown>[];
}

/** Shared by the Billing and Billing V2 tiles: account choice, amount due, invoice download. */
export function useBilling(entityType: EntityType, entityId: string) {
    const accounts = ref<{ id: string; name: string }[]>([]);
    const accountId = ref<string | null>(entityType === 'account' ? entityId : null);
    const summary = ref<BillingSummary>() as Ref<BillingSummary | undefined>;
    const loading = ref(false);

    const accountOptions = computed<SelectOption[]>(() => accounts.value.map((a) => ({ value: a.id, label: a.id })));

    async function init(): Promise<void> {
        if (entityType === 'user') {
            const u = await api<{ accounts: { id: string; name: string }[] }>(`/care/user/${entityId}`);
            accounts.value = u.accounts;
            accountId.value = u.accounts[0]?.id ?? null;
        } else if (entityType === 'subscriber') {
            const s = await api<{ subscriber: { accountId: string } }>(`/care/subscriber/${entityId}`);
            accountId.value = s.subscriber.accountId;
        }
    }
    async function load(): Promise<void> {
        if (!accountId.value) {
            summary.value = undefined;
            return;
        }
        loading.value = true;
        try {
            summary.value = await api<BillingSummary>(`/care/account/${accountId.value}/billingSummary`);
        } catch (e) {
            toastError(e, 'Could not load billing');
        } finally {
            loading.value = false;
        }
    }
    watch(accountId, load);

    function downloadInvoice(): void {
        const id = summary.value?.latestUnpaidInvoiceId ?? summary.value?.latestInvoiceId;
        if (!id) {
            showToast('error', 'Invoice download failed', 'There is no invoice for this account yet.');
            return;
        }
        // the PDF opens in a new tab, as in the original
        window.open(`/api/care/invoice/${id}/pdf`, '_blank', 'noopener');
    }

    void init()
        .then(load)
        .catch((e) => toastError(e, 'Could not load billing'));
    return { accounts, accountId, accountOptions, summary, loading, downloadInvoice, reload: load };
}
