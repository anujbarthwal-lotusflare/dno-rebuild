/**
 * Subscriber lifecycle driven by billing (dunning).
 *
 * Ported from the Lua `subscriptionlifecycle` service:
 *  - the state graph and action names in `EventHandler.lua` (STATE_TRANSITION_ACTIONS)
 *  - "billing initiated" as the suspension reason that later reactivation looks for
 *  - bundle-aware deactivation (see inventory/resolveBundleDeactivation)
 * The Lua actions call orchestration plans that touch user management, SIM, OSS
 * and pricing; here each action applies its effect to the product inventory.
 * The overdue-days schedule that decides WHEN to step is configuration
 * (the original takes it from debt-collection dunning profiles).
 */
import { DomainError } from '../common/errors.ts';
import { DAY_MS } from '../common/runtime.ts';
import type { Clock, EventBus, OperatorConfig } from '../common/runtime.ts';
import type { BillingAccount, SubscriberState } from '../common/model.ts';
import type { BillingAccountService } from '../billing/accountService.ts';
import type { BillingService } from '../billing/billingService.ts';
import { resolveBundleDeactivation } from '../inventory/service.ts';
import type { InventoryService } from '../inventory/service.ts';

export const BILLING_INITIATED = 'billingInitiated';

export type LifecycleAction =
    | 'active_to_gws'
    | 'gws_to_active'
    | 'gws_to_gwos'
    | 'gwos_to_active'
    | 'gwos_to_terminating'
    | 'terminating_to_active'
    | 'terminating_to_terminated';

/** previous state -> current state -> action */
export const STATE_TRANSITION_ACTIONS: Partial<Record<SubscriberState, Partial<Record<SubscriberState, LifecycleAction>>>> = {
    active: { graceWithSubscription: 'active_to_gws' },
    graceWithSubscription: { active: 'gws_to_active', graceWithoutSubscription: 'gws_to_gwos' },
    graceWithoutSubscription: { active: 'gwos_to_active', terminating: 'gwos_to_terminating' },
    terminating: { active: 'terminating_to_active', terminated: 'terminating_to_terminated' },
};

const LADDER: SubscriberState[] = ['active', 'graceWithSubscription', 'graceWithoutSubscription', 'terminating', 'terminated'];

export function resolveAction(previous: SubscriberState, current: SubscriberState): LifecycleAction | undefined {
    if (previous === current) return undefined;
    const action = STATE_TRANSITION_ACTIONS[previous]?.[current];
    if (!action) {
        throw new DomainError(
            'SUBSCRIPTION_LIFECYCLE-UNKNOWN_STATE_TRANSITION',
            `Unknown subscriber state transition ${previous} -> ${current}`,
            400
        );
    }
    return action;
}

/** Dunning step a given number of days past due calls for. */
export function targetStateFor(daysOverdue: number, schedule: OperatorConfig['dunning']): SubscriberState {
    if (daysOverdue >= schedule.terminated) return 'terminated';
    if (daysOverdue >= schedule.terminating) return 'terminating';
    if (daysOverdue >= schedule.graceWithoutSubscription) return 'graceWithoutSubscription';
    if (daysOverdue >= schedule.graceWithSubscription) return 'graceWithSubscription';
    return 'active';
}

export class DunningService {
    private readonly accounts: BillingAccountService;
    private readonly billing: BillingService;
    private readonly inventory: InventoryService;
    private readonly events: EventBus;
    private readonly clock: Clock;
    private readonly config: OperatorConfig;

    constructor(
        accounts: BillingAccountService,
        billing: BillingService,
        inventory: InventoryService,
        events: EventBus,
        clock: Clock,
        config: OperatorConfig
    ) {
        this.accounts = accounts;
        this.billing = billing;
        this.inventory = inventory;
        this.events = events;
        this.clock = clock;
        this.config = config;
        // bill_settled: once nothing is overdue any more, the account returns to active
        events.on<{ billingAccountId: string }>('CustomerBillSettledEvent', async ({ billingAccountId }) => {
            await this.evaluateAccount(billingAccountId, this.clock.now());
        });
    }

    /** Apply one transition and its effect on the account's products. */
    async transition(accountId: string, to: SubscriberState): Promise<BillingAccount> {
        const account = await this.accounts.get(accountId);
        const from = account.subscriberState ?? 'active';
        const action = resolveAction(from, to);
        if (!action) return account;
        await this.runAction(accountId, action);
        const saved = await this.accounts.setSubscriberState(accountId, to);
        await this.events.publish('SubscriberStateChangeEvent', { billingAccountId: accountId, previousState: from, newState: to, action });
        return saved;
    }

    private async runAction(accountId: string, action: LifecycleAction): Promise<void> {
        const products = await this.inventory.productsForAccount(accountId);
        switch (action) {
            case 'active_to_gws':
            case 'gws_to_active':
                return; // grace with subscription: service keeps running
            case 'gws_to_gwos':
                for (const p of products.filter((x) => x.status === 'active')) {
                    await this.inventory.suspend(p.id, BILLING_INITIATED);
                }
                return;
            case 'gwos_to_active':
                for (const p of products.filter((x) => x.status === 'suspended' && x.suspensionReason === BILLING_INITIATED)) {
                    await this.inventory.activate(p.id);
                }
                return;
            case 'gwos_to_terminating':
                for (const p of products.filter((x) => x.status === 'suspended' || x.status === 'active')) {
                    await this.inventory.requestTermination(p.id);
                }
                return;
            case 'terminating_to_active':
                for (const p of products.filter((x) => x.status === 'pendingTerminate')) await this.inventory.activate(p.id);
                return;
            case 'terminating_to_terminated': {
                const live = products.filter((x) => ['pendingTerminate', 'suspended', 'active'].includes(x.status));
                const targets = resolveBundleDeactivation(
                    products,
                    live.map((p) => p.id),
                    this.config.allowPartialBundleDeactivation
                );
                const ids = new Set(targets.map((t) => t.productId));
                // terminating a bundle head terminates its members too
                for (const p of live) {
                    const parent = p.productRelationship?.find((r) => r.relationshipType === 'bundledBy')?.id;
                    if (ids.has(p.id) || (parent && ids.has(parent))) await this.inventory.terminate(p.id);
                }
                return;
            }
        }
    }

    /** Walk the account one step at a time to wherever its overdue bills say it should be. */
    async evaluateAccount(accountId: string, asOf: Date): Promise<BillingAccount> {
        let account = await this.accounts.get(accountId);
        const current = account.subscriberState ?? 'active';
        if (current === 'terminated') return account;
        const overdue = await this.billing.listBills(
            (b) => b.billingAccount.id === accountId && b.state === 'overdue' && b.remainingAmount.value > 0
        );
        const oldestDue = overdue.map((b) => Date.parse(b.paymentDueDate ?? b.billDate)).sort((a, b) => a - b)[0];
        const daysOverdue = oldestDue === undefined ? -1 : Math.floor((asOf.getTime() - oldestDue) / DAY_MS);
        const target = oldestDue === undefined ? 'active' : targetStateFor(daysOverdue, this.config.dunning);
        if (target === 'active') {
            return current === 'active' ? account : this.transition(accountId, 'active');
        }
        let i = LADDER.indexOf(current);
        const goal = LADDER.indexOf(target);
        while (i < goal) {
            account = await this.transition(accountId, LADDER[i + 1]!);
            i++;
        }
        return account;
    }

    /** Daily job: mark overdue bills, then move every affected account along the dunning ladder. */
    async run(asOf: Date = this.clock.now()): Promise<{ overdueBills: number; changed: { accountId: string; from: string; to: string }[] }> {
        const newlyOverdue = await this.billing.markOverdueBills(asOf);
        const changed: { accountId: string; from: string; to: string }[] = [];
        for (const account of await this.accounts.list()) {
            if (account.state === 'closed') continue;
            const from = account.subscriberState ?? 'active';
            const after = await this.evaluateAccount(account.id, asOf);
            const to = after.subscriberState ?? 'active';
            if (from !== to) changed.push({ accountId: account.id, from, to });
        }
        return { overdueBills: newlyOverdue.length, changed };
    }
}
