/**
 * Billing account management (TMF666).
 *
 * Ported from ts-polaris `apps/billingAccountManagement`:
 *  - state transition rules (common/constant/Ruleset.ts)
 *  - editAccountBalance guard: availableCreditLimit has its own path
 *  - activateBillingAccount: state check, cycle spec required, bill cycle creation
 *  - currency rules: balances, credit limit and unsettled amount share one currency and it cannot be patched
 * The balance arithmetic itself runs inside an orchestration plan in the original
 * (`EditAccountBalance`); here it is implemented directly, with the sign convention
 * the bill calculation relies on: payableBalance > 0 is customer credit, < 0 is debt.
 */
import type { Collection, Store } from '../common/store.ts';
import type { Clock, EventBus } from '../common/runtime.ts';
import { mergePatch } from '../common/runtime.ts';
import { Dec, roundMoney } from '../common/decimal.ts';
import { DomainError, invalid, notAllowed } from '../common/errors.ts';
import type {
    AccountBalanceTransaction,
    AccountState,
    BalanceType,
    BillCycle,
    BillingAccount,
    BillingCycleSpecification,
    Money,
    RatingType,
    Ref,
    RelatedParty,
    SubscriberState,
    TransactionType,
} from '../common/model.ts';
import type { PartyService } from '../party/service.ts';
import { calculateCycleEndDate, cycleBoundaries, prepareBillCycle } from './billCycle.ts';

const baError = (code: string, message: string, status = 400): DomainError =>
    new DomainError(`BAM-${code}`, message, status);

/** target state -> states it may be entered from */
const STATE_RULES: Record<AccountState, AccountState[]> = {
    created: [],
    active: ['suspended', 'created'],
    suspended: ['active', 'created'],
    closed: ['created', 'active', 'suspended'],
};

export function validateAccountStateChange(current: AccountState, target: AccountState | undefined): void {
    if (!target || target === current) return;
    if (!STATE_RULES[target]?.includes(current)) {
        throw baError('ACCOUNT_INVALID_STATE_TRANSITION', `Billing account cannot go from ${current} to ${target}`);
    }
}

const CREDIT: TransactionType[] = [
    'paymentTransaction',
    'adjustmentCreditTransaction',
    'transferCreditTransaction',
    'depositCreditTransaction',
];

export interface CreateBillingAccount {
    name: string;
    ratingType?: RatingType;
    currency: string;
    relatedParty: RelatedParty[];
    creditLimit?: Money;
    billStructure?: { cycleSpecification?: Ref };
}

export class BillingAccountService {
    private readonly accounts: Collection<BillingAccount>;
    private readonly specs: Collection<BillingCycleSpecification>;
    private readonly cycles: Collection<BillCycle>;
    private readonly transactions: Collection<AccountBalanceTransaction>;
    private readonly parties: PartyService;
    private readonly events: EventBus;
    private readonly clock: Clock;

    constructor(store: Store, parties: PartyService, events: EventBus, clock: Clock) {
        this.accounts = store.collection<BillingAccount>('billingAccount', 'BillingAccount');
        this.specs = store.collection<BillingCycleSpecification>('billingCycleSpecification', 'BillingCycleSpecification');
        this.cycles = store.collection<BillCycle>('billCycle', 'BillCycle');
        this.transactions = store.collection<AccountBalanceTransaction>('accountBalanceTransaction');
        this.parties = parties;
        this.events = events;
        this.clock = clock;
    }

    /* ----- cycle specifications ----- */

    listCycleSpecifications(): Promise<BillingCycleSpecification[]> {
        return this.specs.list();
    }

    async createCycleSpecification(
        body: Partial<BillingCycleSpecification> & { name: string; frequency: BillingCycleSpecification['frequency'] }
    ): Promise<BillingCycleSpecification> {
        if (!body.name?.trim()) throw invalid('name is required');
        const startDay = body.billingCycleStartDay ?? 1;
        if (!Number.isInteger(startDay) || startDay < 1) throw invalid('billingCycleStartDay must be a positive integer');
        cycleBoundaries(body.frequency, startDay - 1, 2000); // validates frequency and offset cap
        return this.specs.insert({
            '@type': 'BillingCycleSpecification',
            name: body.name,
            frequency: body.frequency,
            billingCycleStartDay: startDay,
            billingDateShift: body.billingDateShift ?? 0,
            paymentDueDateOffset: body.paymentDueDateOffset ?? 15,
            mailingDateOffset: body.mailingDateOffset ?? 1,
            creditDateOffset: body.creditDateOffset ?? 0,
            chargeDateOffset: body.chargeDateOffset ?? 0,
        });
    }

    /* ----- accounts ----- */

    list(): Promise<BillingAccount[]> {
        return this.accounts.list();
    }
    get(id: string): Promise<BillingAccount> {
        return this.accounts.require(id);
    }
    find(id: string): Promise<BillingAccount | undefined> {
        return this.accounts.get(id);
    }
    listForParty(partyId: string): Promise<BillingAccount[]> {
        return this.accounts.list((a) => a.relatedParty.some((rp) => rp.partyOrPartyRole.id === partyId));
    }
    listTransactions(accountId: string): Promise<AccountBalanceTransaction[]> {
        return this.transactions.list((t) => t.accountId === accountId);
    }
    listCycles(accountId: string): Promise<BillCycle[]> {
        return this.cycles.list((c) => c.billingAccount.id === accountId);
    }

    async create(body: CreateBillingAccount): Promise<BillingAccount> {
        if (!body.name?.trim()) throw invalid('name is required');
        if (!/^[A-Z]{3}$/.test(body.currency ?? '')) throw invalid('currency must be a 3-letter ISO code');
        if (!body.relatedParty?.length) throw invalid('relatedParty is required');
        for (const rp of body.relatedParty) {
            const party = await this.parties.findParty(rp.partyOrPartyRole.id, rp.partyOrPartyRole['@referredType']);
            if (!party) throw invalid(`Related party ${rp.partyOrPartyRole.id} does not exist`);
            rp.partyOrPartyRole['@referredType'] = party['@type'];
            rp.partyOrPartyRole.name ??= party['@type'] === 'Organization' ? party.name : `${party.givenName} ${party.familyName}`;
        }
        if (body.creditLimit) {
            if (body.creditLimit.unit !== body.currency) {
                throw baError('CURRENCY_MISMATCH', 'creditLimit currency must match the account currency');
            }
            if (body.creditLimit.value < 0) throw invalid('creditLimit cannot be negative');
        }
        const specId = body.billStructure?.cycleSpecification?.id;
        if (specId && !(await this.specs.get(specId))) {
            throw baError('INVALID_CYCLE_SPECIFICATION', `Billing cycle specification ${specId} does not exist`);
        }
        const zero = { unit: body.currency, value: 0 };
        const created = await this.accounts.insert({
            '@type': 'BillingAccount',
            name: body.name,
            state: 'created',
            ratingType: body.ratingType ?? 'postpaid',
            relatedParty: body.relatedParty,
            accountBalance: [
                { balanceType: 'payableBalance', amount: { ...zero } },
                ...(body.creditLimit
                    ? [{ balanceType: 'availableCreditLimit' as const, amount: { ...body.creditLimit } }]
                    : []),
            ],
            creditLimit: body.creditLimit,
            unsettledBillsAmount: { ...zero },
            billStructure: body.billStructure,
            subscriberState: 'active',
            lastUpdate: this.clock.now().toISOString(),
        });
        await this.events.publish('BillingAccountCreateEvent', { billingAccount: created });
        return created;
    }

    async patch(id: string, patch: Partial<BillingAccount>): Promise<BillingAccount> {
        const current = await this.accounts.require(id);
        if ('accountBalance' in patch) {
            throw baError(
                'UNAUTHORIZED_OPERATION',
                'Balances cannot be changed through PATCH. Use the balance endpoint instead.'
            );
        }
        if (patch.creditLimit?.unit && patch.creditLimit.unit !== currencyOf(current)) {
            throw baError('CURRENCY_CHANGE_NOT_ALLOWED', 'The account currency cannot be changed through PATCH');
        }
        if (patch.unsettledBillsAmount) {
            throw baError('UNAUTHORIZED_OPERATION', 'unsettledBillsAmount is maintained by billing');
        }
        validateAccountStateChange(current.state, patch.state);
        const merged = mergePatch(current, patch);
        merged.id = id;
        const specId = merged.billStructure?.cycleSpecification?.id;
        if (specId && !(await this.specs.get(specId))) {
            throw baError('INVALID_CYCLE_SPECIFICATION', `Billing cycle specification ${specId} does not exist`);
        }
        return this.save(merged, current);
    }

    private async save(next: BillingAccount, previous?: BillingAccount): Promise<BillingAccount> {
        next.lastUpdate = this.clock.now().toISOString();
        const saved = await this.accounts.replace(next);
        if (previous && previous.state !== saved.state) {
            await this.events.publish('BillingAccountStateChangeEvent', {
                entityId: saved.id,
                previousState: previous.state,
                newState: saved.state,
            });
        }
        return saved;
    }

    /**
     * Apply a balance transaction. Credits (payments, credit adjustments) raise the
     * balance; debits (bill generation, debit adjustments) lower it.
     */
    async editAccountBalance(
        accountId: string,
        transactionType: TransactionType,
        balanceType: BalanceType,
        amount: Money,
        reference?: string
    ): Promise<BillingAccount> {
        if (balanceType === 'availableCreditLimit') {
            throw notAllowed('availableCreditLimit cannot be updated through editAccountBalance. Use the dedicated endpoint.');
        }
        if (!(amount?.value >= 0)) throw invalid('amount.value must be zero or positive');
        const account = await this.accounts.require(accountId);
        if (account.state === 'closed') throw notAllowed('The billing account is closed');
        const currency = currencyOf(account);
        if (amount.unit !== currency) {
            throw baError('CURRENCY_MISMATCH', `Amount currency ${amount.unit} does not match account currency ${currency}`);
        }
        let balance = account.accountBalance.find((b) => b.balanceType === balanceType);
        if (!balance) {
            balance = { balanceType, amount: { unit: currency, value: 0 } };
            account.accountBalance.push(balance);
        }
        const signed = CREDIT.includes(transactionType) ? Dec.of(amount.value) : Dec.of(amount.value).neg();
        balance.amount.value = roundMoney(Dec.of(balance.amount.value).plus(signed));
        const saved = await this.save(account);
        await this.transactions.insert({
            accountId,
            balanceType,
            transactionType,
            amount: { ...amount },
            balanceAfter: { ...balance.amount },
            created: this.clock.now().toISOString(),
            reference,
        });
        await this.recalculateAvailableCredit(saved.id);
        await this.events.publish('BillingAccountBalanceChangeEvent', {
            entityId: accountId,
            balanceType,
            transactionType,
            amount,
            balanceAfter: balance.amount,
        });
        return this.accounts.require(accountId);
    }

    /** availableCreditLimit = creditLimit minus what the customer currently owes. */
    private async recalculateAvailableCredit(accountId: string): Promise<void> {
        const account = await this.accounts.require(accountId);
        if (!account.creditLimit) return;
        const payable = payableBalanceOf(account).value;
        const owed = Dec.max(Dec.of(payable).neg(), 0);
        const available = roundMoney(Dec.of(account.creditLimit.value).minus(owed));
        const entry = account.accountBalance.find((b) => b.balanceType === 'availableCreditLimit');
        if (entry) entry.amount.value = available;
        else {
            account.accountBalance.push({
                balanceType: 'availableCreditLimit',
                amount: { unit: account.creditLimit.unit, value: available },
            });
        }
        await this.accounts.replace(account);
    }

    async setUnsettledBillsAmount(accountId: string, value: number): Promise<void> {
        const account = await this.accounts.require(accountId);
        account.unsettledBillsAmount = { unit: currencyOf(account), value: roundMoney(Dec.max(value, 0)) };
        await this.accounts.replace(account);
    }

    async setSubscriberState(accountId: string, state: SubscriberState): Promise<BillingAccount> {
        const account = await this.accounts.require(accountId);
        account.subscriberState = state;
        return this.accounts.replace(account);
    }

    /** Activate the account and open its first bill cycle. */
    async activate(
        accountId: string,
        billCycleStartDateTime?: string
    ): Promise<{ billingAccount: BillingAccount; billCycle: BillCycle }> {
        const account = await this.accounts.require(accountId);
        try {
            if (account.state === 'active') throw new Error('already active');
            validateAccountStateChange(account.state, 'active');
        } catch {
            throw baError('INVALID_ACTIVATION_REQUEST', `Billing account in state ${account.state} cannot be activated`);
        }
        const specId = account.billStructure?.cycleSpecification?.id;
        const spec = specId ? await this.specs.get(specId) : undefined;
        if (!spec) {
            throw baError('INVALID_CYCLE_SPECIFICATION', 'The billing account has no valid bill cycle specification');
        }
        const start = billCycleStartDateTime ?? this.clock.now().toISOString();
        const billCycle = await this.openCycle(account, spec, start);
        const previous = structuredClone(account);
        account.state = 'active';
        const billingAccount = await this.save(account, previous);
        return { billingAccount, billCycle };
    }

    private async openCycle(account: BillingAccount, spec: BillingCycleSpecification, start: string): Promise<BillCycle> {
        const end = calculateCycleEndDate(start, spec, this.clock.now());
        return this.cycles.insert(prepareBillCycle(spec, account, end, start));
    }

    /** The cycle whose billing period contains `at`; opens the next one if the last has ended. */
    async currentCycle(accountId: string, at: Date): Promise<BillCycle | undefined> {
        const account = await this.accounts.require(accountId);
        const all = (await this.listCycles(accountId)).sort((a, b) =>
            (a.billingPeriod.endDateTime ?? '').localeCompare(b.billingPeriod.endDateTime ?? '')
        );
        const iso = at.toISOString();
        const hit = all.find((c) => (c.billingPeriod.startDateTime ?? '') <= iso && iso <= (c.billingPeriod.endDateTime ?? ''));
        if (hit) return hit;
        const last = all.at(-1);
        const specId = account.billStructure?.cycleSpecification?.id;
        const spec = specId ? await this.specs.get(specId) : undefined;
        if (!last || !spec || iso < (last.billingPeriod.startDateTime ?? '')) return last;
        // roll forward: each new cycle starts one second after the previous one ended
        let cursor = last;
        for (let i = 0; i < 48 && (cursor.billingPeriod.endDateTime ?? '') < iso; i++) {
            const nextStart = new Date(Date.parse(cursor.billingPeriod.endDateTime!) + 1000).toISOString();
            const end = findCycleEnd(spec, nextStart);
            cursor = await this.cycles.insert(prepareBillCycle(spec, account, end, nextStart));
        }
        return cursor;
    }

    async suspend(accountId: string): Promise<BillingAccount> {
        return this.patch(accountId, { state: 'suspended' });
    }

    /** Close the account. It must not owe anything. */
    async close(accountId: string): Promise<BillingAccount> {
        const account = await this.accounts.require(accountId);
        validateAccountStateChange(account.state, 'closed');
        if (payableBalanceOf(account).value < 0 || (account.unsettledBillsAmount?.value ?? 0) > 0) {
            throw baError('ACCOUNT_HAS_OUTSTANDING_BALANCE', 'The billing account still has an outstanding balance', 409);
        }
        const previous = structuredClone(account);
        account.state = 'closed';
        return this.save(account, previous);
    }
}

/** Cycle end for a start date without the "skip to the current cycle" rule (used when rolling forward). */
function findCycleEnd(spec: BillingCycleSpecification, start: string): string {
    return calculateCycleEndDate(start, spec, new Date(0));
}

export function currencyOf(account: BillingAccount): string {
    return payableBalanceOf(account).unit;
}

export function payableBalanceOf(account: BillingAccount): Money {
    const b = account.accountBalance.find((x) => x.balanceType === 'payableBalance');
    if (!b) throw new DomainError('BC-PAYABLE_BALANCE_NOT_FOUND', 'Payable balance not found on billing account', 500);
    return b.amount;
}
