/**
 * Payment management (TMF676): payments and refunds.
 *
 * Ported from ts-polaris `apps/paymentManagement`:
 *  - status transitions for Payment and Refund (resources/.../enum_name_to_state_transition.json)
 *  - PaymentService validation: account must be a billing account, total amount
 *    must be positive and cover its items, matching fields are system-maintained
 *  - calculateUnmatchedAmount / matching status derivation
 * Booking an approved payment against bills is delegated to BillingService
 * (the original does it through Kafka events and the bill calculation app).
 */
import { randomUUID } from 'node:crypto';
import type { Collection, Store } from '../common/store.ts';
import type { Clock, EventBus } from '../common/runtime.ts';
import { TransitionTable } from '../common/stateMachine.ts';
import { Dec, roundMoney } from '../common/decimal.ts';
import { DomainError, invalid } from '../common/errors.ts';
import type { MatchingStatus, Money, Payment, PaymentStatus, Ref, Refund, RelatedParty } from '../common/model.ts';
import { currencyOf, payableBalanceOf } from '../billing/accountService.ts';
import type { BillingAccountService } from '../billing/accountService.ts';
import type { BillingService } from '../billing/billingService.ts';

const payError = (code: string, message: string, status = 400): DomainError => new DomainError(code, message, status);

export const paymentLifecycle = new TransitionTable('payment', [
    { currentState: null, nextState: 'reserved' },
    { currentState: null, nextState: 'pending' },
    { currentState: null, nextState: 'approved' },
    { currentState: 'pending', nextState: 'reserved' },
    { currentState: 'pending', nextState: 'approved' },
    { currentState: 'reserved', nextState: 'approved' },
    { currentState: 'pending', nextState: 'declined' },
    { currentState: 'pending', nextState: 'failed' },
    { currentState: 'reserved', nextState: 'cancelled' },
    { currentState: 'approved', nextState: 'cancelling' },
    { currentState: 'cancelling', nextState: 'cancelled' },
    { currentState: 'cancelling', nextState: 'cancellationFailed' },
]);

export const refundLifecycle = new TransitionTable('refund', [
    { currentState: null, nextState: 'requested' },
    { currentState: 'requested', nextState: 'completed' },
    { currentState: 'requested', nextState: 'rejected' },
]);

/** total - matched item totals + what those items left unmatched. */
export function calculateUnmatchedAmount(payment: Pick<Payment, 'totalAmount' | 'paymentItem'>): Money {
    let items = Dec.ZERO;
    let itemsUnmatched = Dec.ZERO;
    for (const item of payment.paymentItem ?? []) {
        if (!item.isMatchedSuccessfully) continue;
        items = items.plus(item.totalAmount?.value ?? 0);
        itemsUnmatched = itemsUnmatched.plus(item.unmatchedAmount?.value ?? 0);
    }
    return {
        unit: payment.totalAmount.unit,
        value: roundMoney(Dec.of(payment.totalAmount.value).minus(items).plus(itemsUnmatched)),
    };
}

export function deriveMatchingStatus(payment: Pick<Payment, 'totalAmount' | 'paymentItem'>): MatchingStatus {
    const unmatched = calculateUnmatchedAmount(payment).value;
    if (unmatched < 0) throw payError('COMMON-OPERATION_NOT_ALLOWED', 'Matched more than the payment total', 409);
    if (unmatched === 0) return 'matchedFully';
    return (payment.paymentItem ?? []).some((i) => i.isMatchedSuccessfully === false) ? 'matchingErrors' : 'matchedPartially';
}

export interface CreatePayment {
    account: Ref;
    totalAmount: Money;
    status?: PaymentStatus;
    description?: string;
    paymentMethod?: Ref;
    payer?: RelatedParty;
    productOrder?: Ref;
    externalId?: string;
    /** Settle this bill first. */
    customerBillId?: string;
    /** Caller-supplied items are only allowed to carry an amount; matching info is system-maintained. */
    paymentItem?: { totalAmount: Money }[];
}

export class PaymentService {
    private readonly payments: Collection<Payment>;
    private readonly refunds: Collection<Refund>;
    private readonly accounts: BillingAccountService;
    private readonly billing: BillingService;
    private readonly events: EventBus;
    private readonly clock: Clock;

    constructor(store: Store, accounts: BillingAccountService, billing: BillingService, events: EventBus, clock: Clock) {
        this.payments = store.collection<Payment>('payment', 'Payment');
        this.refunds = store.collection<Refund>('refund', 'Refund');
        this.accounts = accounts;
        this.billing = billing;
        this.events = events;
        this.clock = clock;
    }

    list(): Promise<Payment[]> {
        return this.payments.list();
    }
    get(id: string): Promise<Payment> {
        return this.payments.require(id);
    }
    listRefunds(): Promise<Refund[]> {
        return this.refunds.list();
    }

    private async validate(body: CreatePayment): Promise<void> {
        const accountError = payError('PYMM000012', 'Payment account must reference an existing billing account');
        if (!body.account?.id) throw accountError;
        if ((body.account['@referredType'] ?? 'BillingAccount') !== 'BillingAccount') throw accountError;
        const account = await this.accounts.find(body.account.id);
        if (!account) throw accountError;
        if (account.state === 'closed') throw payError('PYMM000012', 'The billing account is closed', 409);
        const total = body.totalAmount?.value;
        const sum = (body.paymentItem ?? []).reduce((s, i) => s + (i.totalAmount?.value ?? 0), 0);
        if (!(total > 0) || total < sum) {
            throw payError('PYMM000013', 'Payment totalAmount must be positive and at least the sum of its items');
        }
        if (body.totalAmount.unit !== currencyOf(account)) {
            throw payError('PYMM000013', `Payment currency must be ${currencyOf(account)}`);
        }
        if (body.payer && body.payer.role !== 'payer') throw payError('PYMM000015', "Payer role must be 'payer'");
    }

    async create(body: CreatePayment): Promise<Payment> {
        await this.validate(body);
        const status = body.status ?? 'approved';
        paymentLifecycle.assert(null, status);
        const payment = await this.payments.insert({
            '@type': 'Payment',
            status,
            description: body.description,
            paymentDate: this.clock.now().toISOString(),
            totalAmount: body.totalAmount,
            account: { id: body.account.id, '@referredType': 'BillingAccount' },
            payer: body.payer,
            paymentMethod: body.paymentMethod,
            paymentItem: [],
            unmatchedAmount: { ...body.totalAmount },
            productOrder: body.productOrder,
            customerBill: body.customerBillId ? { id: body.customerBillId } : undefined,
            externalId: body.externalId,
        });
        await this.events.publish('PaymentCreateEvent', { paymentId: payment.id, status });
        return status === 'approved' ? this.book(payment) : payment;
    }

    /** Move a payment to another status. Approval books it; cancellation reverses it. */
    async transition(id: string, status: PaymentStatus): Promise<Payment> {
        let payment = await this.payments.require(id);
        if (payment.status === status) return payment;
        paymentLifecycle.assert(payment.status, status);
        const previous = payment.status;
        payment = await this.payments.replace({ ...payment, status });
        await this.events.publish('PaymentStateChangeEvent', { paymentId: id, previousState: previous, newState: status });
        if (status === 'approved') payment = await this.book(payment);
        if (status === 'cancelled' && previous === 'cancelling') payment = await this.unbook(payment);
        return payment;
    }

    /** approved -> cancelling -> cancelled, reversing the booking. */
    async cancel(id: string): Promise<Payment> {
        const payment = await this.payments.require(id);
        if (payment.status === 'reserved') return this.transition(id, 'cancelled');
        await this.transition(id, 'cancelling');
        try {
            return await this.transition(id, 'cancelled');
        } catch (e) {
            await this.transition(id, 'cancellationFailed');
            throw e;
        }
    }

    private async book(payment: Payment): Promise<Payment> {
        const account = await this.accounts.get(payment.account.id);
        const result = await this.billing.applyPayment(
            account,
            payment.id,
            payment.totalAmount,
            payment.paymentMethod,
            payment.customerBill?.id
        );
        payment.paymentItem = result.bills.map((b) => ({
            id: randomUUID(),
            totalAmount: { unit: payment.totalAmount.unit, value: b.applied },
            unmatchedAmount: { unit: payment.totalAmount.unit, value: 0 },
            isMatchedSuccessfully: true,
            item: { id: b.billId, name: b.billNo, '@referredType': 'CustomerBill' },
        }));
        payment.unmatchedAmount = calculateUnmatchedAmount(payment);
        payment.matchingStatus = deriveMatchingStatus(payment);
        const saved = await this.payments.replace(payment);
        await this.events.publish('PaymentItemsMatchOrGeneration', {
            paymentId: payment.id,
            billingAccountId: account.id,
            matched: result.bills,
            unmatchedAmount: saved.unmatchedAmount,
        });
        return saved;
    }

    private async unbook(payment: Payment): Promise<Payment> {
        const account = await this.accounts.get(payment.account.id);
        await this.billing.reversePayment(account, payment.id, payment.totalAmount);
        return this.payments.replace({
            ...payment,
            paymentItem: [],
            unmatchedAmount: { ...payment.totalAmount },
            matchingStatus: undefined,
        });
    }

    /* ----- refunds ----- */

    /** A refund can only be requested against credit the customer actually holds. */
    async requestRefund(body: { account: Ref; totalAmount: Money; reason?: string }): Promise<Refund> {
        const account = await this.accounts.get(body.account.id);
        if (!(body.totalAmount?.value > 0)) throw invalid('Refund totalAmount must be positive');
        if (body.totalAmount.unit !== currencyOf(account)) throw invalid(`Refund currency must be ${currencyOf(account)}`);
        const pending = (await this.refunds.list((r) => r.account.id === account.id && r.status === 'requested')).reduce(
            (s, r) => s + r.totalAmount.value,
            0
        );
        if (payableBalanceOf(account).value - pending < body.totalAmount.value) {
            throw payError('PYMM-REFUND_EXCEEDS_BALANCE', 'Refund amount exceeds the credit available on the account', 409);
        }
        refundLifecycle.assert(null, 'requested');
        return this.refunds.insert({
            '@type': 'Refund',
            status: 'requested',
            totalAmount: body.totalAmount,
            account: { id: account.id },
            reason: body.reason,
            requestedDate: this.clock.now().toISOString(),
        });
    }

    async completeRefund(id: string): Promise<Refund> {
        const refund = await this.refunds.require(id);
        refundLifecycle.assert(refund.status, 'completed');
        const account = await this.accounts.get(refund.account.id);
        if (payableBalanceOf(account).value < refund.totalAmount.value) {
            throw payError('PYMM-REFUND_EXCEEDS_BALANCE', 'Refund amount exceeds the credit available on the account', 409);
        }
        await this.accounts.editAccountBalance(account.id, 'adjustmentDebitTransaction', 'payableBalance', refund.totalAmount, `refund ${id}`);
        return this.refunds.replace({ ...refund, status: 'completed', completionDate: this.clock.now().toISOString() });
    }

    async rejectRefund(id: string): Promise<Refund> {
        const refund = await this.refunds.require(id);
        refundLifecycle.assert(refund.status, 'rejected');
        return this.refunds.replace({ ...refund, status: 'rejected', completionDate: this.clock.now().toISOString() });
    }
}
