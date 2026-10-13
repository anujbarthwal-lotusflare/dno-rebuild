/**
 * Rating records (ACBRs), bill calculation and bill settlement.
 *
 * Ported from ts-polaris `apps/billCalculation/.../BillCalculationService.ts`:
 *   calculateCustomerBillAmounts, calculateRemainingAmount, createCustomerBill,
 *   determineTransactionType, settleBills, calculateProratedAmounts /
 *   createCloneProrationAcbr, and the sign map in
 *   `libs/customization/.../CustomizedBillingConstants.ts`.
 * Reconstructed (the original spreads these across orchestration plans and the
 * productRecurringChargeScheduleManagement app, which were not ported line by line):
 *   charging a product on activation, the recurring-charge run, overdue marking,
 *   bill cancellation and payment reversal.
 */
import type { Collection, Store } from '../common/store.ts';
import type { Clock, EventBus, OperatorConfig } from '../common/runtime.ts';
import { DAY_MS } from '../common/runtime.ts';
import { Dec, roundMoney } from '../common/decimal.ts';
import { DomainError, invalid, notAllowed } from '../common/errors.ts';
import type {
    Acbr,
    AcbrType,
    BillingAccount,
    CustomerBill,
    CustomerBillItem,
    CustomerBillState,
    Money,
    Product,
    ProductPrice,
    RecurringChargePeriod,
    Ref,
    TimePeriod,
    TransactionType,
} from '../common/model.ts';
import { chargeAmount } from '../pricing/pricing.ts';
import type { InventoryService } from '../inventory/service.ts';
import { currencyOf, payableBalanceOf } from './accountService.ts';
import type { BillingAccountService } from './accountService.ts';

const bcError = (code: string, message: string, status = 400): DomainError => new DomainError(`BC-${code}`, message, status);

/** +1 = credit to the customer, -1 = charge. Verbatim from transactionRateTypeSignMap. */
export const ACBR_SIGN: Record<AcbrType, 1 | -1> = {
    appliedBillingChargeCreditAdjustment: 1,
    appliedBillingChargeCreditProrationAdjustment: 1,
    appliedBillingChargeDebitAdjustment: -1,
    appliedBillingChargeDebitProrationAdjustment: -1,
    appliedBillingChargePenaltyFee: -1,
    appliedBillingChargeProductOneTimeCharge: -1,
    appliedBillingChargeProductRecurringCharge: -1,
    appliedBillingChargeProductUsageCharge: -1,
    appliedBillingChargeServiceFee: -1,
    appliedBillingCreditBillingDiscount: 1,
    appliedBillingCreditRebate: 1,
    productWithoutCharges: 1,
    appliedBillingCreditBillingReplacement: 1,
    appliedBillingChargeProductInterestCharge: -1,
};

/** Bill states a payment can be applied to (PaymentProcessableCustomerBillStates). */
export const PAYABLE_STATES: CustomerBillState[] = ['sent', 'partiallySettled', 'validated', 'overdue'];

export interface CalculatedAmounts {
    previousAmountDue: Money;
    amountDue: Money;
    remainingAmount: Money;
    taxIncludedAmount: Money;
    taxExcludedAmount: Money;
    payableBalanceUpdateAmount: Money;
    unsettledBillsAmount: Money;
}

/**
 * Bill totals from the account's payable balance and the bill items.
 * payableBalance > 0 is credit the customer holds, < 0 is what they already owe.
 *  - taxIncluded/taxExcluded: net of this bill's charges minus credits (never negative)
 *  - remainingAmount: what still has to be paid for THIS bill after existing credit
 *  - amountDue: total owed on the account after this bill
 *  - payableBalanceUpdateAmount: signed change to apply to the payable balance
 */
export function calculateCustomerBillAmounts(
    payableBalance: Money,
    items: Pick<CustomerBillItem, 'customerBillItemType' | 'taxIncludedAmount' | 'taxExcludedAmount'>[],
    unsettledBillsAmount: Money | undefined,
    skipAccountBalanceForSettlement: boolean
): CalculatedAmounts {
    const unit = payableBalance.unit;
    const balance = Dec.of(payableBalance.value);
    const m = (v: Dec): Money => ({ unit, value: roundMoney(v) });
    const previousUnsettled = Dec.of(unsettledBillsAmount?.value ?? 0);

    if (!items.length) {
        return {
            previousAmountDue: { unit, value: payableBalance.value },
            amountDue: m(Dec.min(balance, 0).abs()),
            remainingAmount: m(Dec.ZERO),
            taxIncludedAmount: m(Dec.ZERO),
            taxExcludedAmount: m(Dec.ZERO),
            payableBalanceUpdateAmount: m(Dec.ZERO),
            unsettledBillsAmount: m(previousUnsettled),
        };
    }

    let amountDue = balance;
    let taxIncluded = Dec.ZERO;
    let taxExcluded = Dec.ZERO;
    for (const item of items) {
        const sign = ACBR_SIGN[item.customerBillItemType];
        if (sign === undefined) throw bcError('UNKNOWN_BILL_ITEM_TYPE', `Unknown bill item type ${item.customerBillItemType}`);
        const incl = Dec.of(item.taxIncludedAmount.value).abs().mul(sign);
        const excl = Dec.of(item.taxExcludedAmount.value).abs().mul(sign);
        amountDue = amountDue.plus(incl);
        taxIncluded = taxIncluded.plus(incl);
        taxExcluded = taxExcluded.plus(excl);
    }
    taxIncluded = Dec.min(taxIncluded, 0).abs();
    taxExcluded = Dec.min(taxExcluded, 0).abs();

    let remaining = taxIncluded;
    if (!skipAccountBalanceForSettlement && balance.gt(0)) remaining = Dec.max(0, taxIncluded.minus(balance));

    const balanceUpdate = balance.minus(amountDue).neg();
    const unsettledDelta = balanceUpdate.plus(Dec.max(balance, 0)).neg();
    return {
        previousAmountDue: { unit, value: payableBalance.value },
        amountDue: m(Dec.min(amountDue, 0).abs()),
        remainingAmount: m(remaining),
        taxIncludedAmount: m(taxIncluded),
        taxExcludedAmount: m(taxExcluded),
        payableBalanceUpdateAmount: m(balanceUpdate),
        unsettledBillsAmount: m(Dec.max(previousUnsettled.plus(unsettledDelta), 0)),
    };
}

/** A non-negative update is a credit (payment-like); a negative one is bill generation. */
export function determineTransactionType(update: Money): { transactionType: TransactionType; amount: Money } {
    return {
        transactionType: update.value >= 0 ? 'paymentTransaction' : 'billGenerationTransaction',
        amount: { unit: update.unit, value: Math.abs(update.value) },
    };
}

/** Credit owed back when only `elapsedDays` of a `totalDays` period were used. */
export function calculateProratedAdjustment(fullAmount: number, elapsedDays: number, totalDays: number): number {
    const full = Dec.of(fullAmount);
    return roundMoney(full.minus(full.mul(elapsedDays).div(totalDays)));
}

export interface SettlementResult {
    amountUsedForSettlement: Money;
    bills: { billId: string; billNo: string; applied: number; state: CustomerBillState }[];
    unappliedAmount: number;
}

/**
 * Spread a payment over unpaid bills in the order given. Mutates the bills.
 * A bill is settled when its remaining amount reaches zero, otherwise partiallySettled.
 */
export function settleBills(
    bills: CustomerBill[],
    paymentId: string,
    amount: Money,
    paymentMethod?: Ref
): SettlementResult {
    let left = Dec.of(amount.value);
    const applied: SettlementResult['bills'] = [];
    if (left.lte(0)) return { amountUsedForSettlement: { unit: amount.unit, value: 0 }, bills: [], unappliedAmount: 0 };
    for (const bill of bills) {
        if (!PAYABLE_STATES.includes(bill.state)) continue;
        const billRemaining = Dec.of(bill.remainingAmount.value);
        const settled = Dec.min(left, billRemaining);
        if (settled.lte(0)) continue;
        const after = billRemaining.minus(settled);
        left = left.minus(settled);
        bill.state = after.isZero() ? 'settled' : 'partiallySettled';
        bill.remainingAmount.value = roundMoney(after);
        bill.appliedPayment.push({ payment: { id: paymentId }, appliedAmount: { unit: amount.unit, value: roundMoney(settled) } });
        if (!bill.paymentMethod && paymentMethod) bill.paymentMethod = { id: paymentMethod.id };
        applied.push({ billId: bill.id, billNo: bill.billNo, applied: roundMoney(settled), state: bill.state });
        if (left.isZero()) break;
    }
    return {
        amountUsedForSettlement: { unit: amount.unit, value: roundMoney(Dec.of(amount.value).minus(left)) },
        bills: applied,
        unappliedAmount: roundMoney(left),
    };
}

const PERIOD_MONTHS: Record<RecurringChargePeriod, number> = { daily: 0, monthly: 1, quarterly: 3, semiAnnually: 6, yearly: 12 };

export function addPeriod(from: Date, period: RecurringChargePeriod): Date {
    const out = new Date(from);
    if (period === 'daily') out.setUTCDate(out.getUTCDate() + 1);
    else out.setUTCMonth(out.getUTCMonth() + PERIOD_MONTHS[period]);
    return out;
}

const ACBR_NAME: Partial<Record<AcbrType, string>> = {
    appliedBillingChargeProductRecurringCharge: 'Recurring charge',
    appliedBillingChargeProductOneTimeCharge: 'One-time charge',
    appliedBillingChargeServiceFee: 'Fee',
    appliedBillingChargeCreditProrationAdjustment: 'Credit proration adjustment',
};

export interface CreateAcbr {
    appliedBillingRateType: AcbrType;
    billingAccount: Ref;
    taxExcludedAmount: Money;
    taxIncludedAmount: Money;
    taxRate?: number;
    name?: string;
    description?: string;
    product?: Ref;
    productOrder?: Ref;
    periodCoverage?: TimePeriod;
    date?: string;
    relatedAcbr?: Ref;
}

export interface CalculateBillOptions {
    /** Bill only these ACBRs (a "pay now" bill). Existing credit is then not used to settle it. */
    acbrIds?: string[];
    billDate?: string;
    category?: string;
    /** Validate the bill straight away so payments can be applied to it. */
    approve?: boolean;
}

export class BillingService {
    private readonly acbrs: Collection<Acbr>;
    private readonly bills: Collection<CustomerBill>;
    private readonly accounts: BillingAccountService;
    private readonly inventory: InventoryService;
    private readonly events: EventBus;
    private readonly clock: Clock;
    private readonly config: OperatorConfig;

    constructor(
        store: Store,
        accounts: BillingAccountService,
        inventory: InventoryService,
        events: EventBus,
        clock: Clock,
        config: OperatorConfig
    ) {
        this.acbrs = store.collection<Acbr>('appliedCustomerBillingRate', 'AppliedCustomerBillingRate');
        this.bills = store.collection<CustomerBill>('customerBill', 'CustomerBill');
        this.accounts = accounts;
        this.inventory = inventory;
        this.events = events;
        this.clock = clock;
        this.config = config;
    }

    /* ----- ACBRs ----- */

    listAcbrs(filter?: (a: Acbr) => boolean): Promise<Acbr[]> {
        return this.acbrs.list(filter);
    }

    async createAcbr(input: CreateAcbr): Promise<Acbr> {
        if (ACBR_SIGN[input.appliedBillingRateType] === undefined) {
            throw invalid(`Unknown appliedBillingRateType ${input.appliedBillingRateType}`);
        }
        const account = await this.accounts.get(input.billingAccount.id);
        if (account.state === 'closed') throw notAllowed('The billing account is closed');
        const currency = currencyOf(account);
        for (const amount of [input.taxExcludedAmount, input.taxIncludedAmount]) {
            if (!amount || !(amount.value >= 0)) throw invalid('ACBR amounts must be zero or positive');
            if (amount.unit !== currency) throw bcError('CURRENCY_MISMATCH', 'ACBR currency must match the billing account currency');
        }
        if (input.taxIncludedAmount.value < input.taxExcludedAmount.value) {
            throw invalid('taxIncludedAmount cannot be lower than taxExcludedAmount');
        }
        const taxAmount = roundMoney(Dec.of(input.taxIncludedAmount.value).minus(input.taxExcludedAmount.value));
        return this.acbrs.insert({
            '@type': 'AppliedCustomerBillingRate',
            name: input.name ?? ACBR_NAME[input.appliedBillingRateType] ?? input.appliedBillingRateType,
            description: input.description,
            appliedBillingRateType: input.appliedBillingRateType,
            status: 'active',
            date: input.date ?? this.clock.now().toISOString(),
            isBilled: false,
            billingAccount: { id: account.id, name: account.name },
            product: input.product,
            productOrder: input.productOrder,
            taxExcludedAmount: input.taxExcludedAmount,
            taxIncludedAmount: input.taxIncludedAmount,
            appliedTax: [{ taxRate: input.taxRate ?? 0, taxAmount: { unit: currency, value: taxAmount } }],
            periodCoverage: input.periodCoverage,
            relatedAcbr: input.relatedAcbr,
        });
    }

    async cancelAcbr(id: string): Promise<void> {
        const acbr = await this.acbrs.require(id);
        if (acbr.isBilled) throw notAllowed('A billed ACBR cannot be cancelled');
        await this.acbrs.replace({ ...acbr, status: 'cancelled' });
    }

    private priceAcbr(product: Product, pp: ProductPrice, type: AcbrType, period?: TimePeriod, order?: Ref): Promise<Acbr> {
        const c = chargeAmount(pp, product.quantity, this.config.defaultTaxRatePercent, this.config.monetaryPrecision);
        return this.createAcbr({
            appliedBillingRateType: type,
            billingAccount: product.billingAccount!,
            name: `${ACBR_NAME[type]} - ${product.name ?? product.productOffering.name ?? product.id}`,
            product: { id: product.id, name: product.name },
            productOrder: order,
            taxExcludedAmount: { unit: c.unit, value: c.taxExcluded },
            taxIncludedAmount: { unit: c.unit, value: c.taxIncluded },
            taxRate: c.taxRate,
            periodCoverage: period,
            date: period?.startDateTime ?? this.clock.now().toISOString(),
        });
    }

    /**
     * Rate a product that has just been activated: every one-time charge, plus the
     * first period of each recurring charge that is billed in advance.
     */
    async chargeActivatedProduct(product: Product, order?: Ref): Promise<Acbr[]> {
        if (!product.billingAccount) return [];
        const out: Acbr[] = [];
        const start = new Date(product.startDate ?? this.clock.now());
        for (const pp of product.productPrice ?? []) {
            if (pp.priceType === 'oneTimeCharge') {
                out.push(await this.priceAcbr(product, pp, 'appliedBillingChargeProductOneTimeCharge', undefined, order));
            } else if (pp.priceType === 'recurringCharge' && pp.recurringChargePeriod && pp.chargeType !== 'inArrear') {
                const period = {
                    startDateTime: start.toISOString(),
                    endDateTime: addPeriod(start, pp.recurringChargePeriod).toISOString(),
                };
                out.push(await this.priceAcbr(product, pp, 'appliedBillingChargeProductRecurringCharge', period, order));
            }
        }
        return out;
    }

    /**
     * Create the recurring ACBRs that have fallen due by `asOf` for every active product
     * (a product carries at most one recurring charge: the price filter enforces it).
     * In advance: a period is rated when it starts. In arrear: when it ends.
     */
    async runRecurringCharges(asOf: Date = this.clock.now()): Promise<Acbr[]> {
        const created: Acbr[] = [];
        const products = await this.inventory.listProducts((p) => p.status === 'active' && !!p.billingAccount);
        for (const product of products) {
            for (const pp of product.productPrice ?? []) {
                if (pp.priceType !== 'recurringCharge' || !pp.recurringChargePeriod) continue;
                const existing = (
                    await this.acbrs.list(
                        (a) =>
                            a.product?.id === product.id &&
                            a.appliedBillingRateType === 'appliedBillingChargeProductRecurringCharge' &&
                            a.status !== 'cancelled'
                    )
                ).sort((a, b) => (a.periodCoverage?.endDateTime ?? '').localeCompare(b.periodCoverage?.endDateTime ?? ''));
                let cursor = new Date(existing.at(-1)?.periodCoverage?.endDateTime ?? product.startDate ?? asOf);
                // time spent suspended is not rated: rating restarts when the product was resumed
                if (product.resumeDate && cursor < new Date(product.resumeDate)) cursor = new Date(product.resumeDate);
                const terminate = product.terminationDate ? new Date(product.terminationDate) : undefined;
                for (let guard = 0; guard < 240; guard++) {
                    const end = addPeriod(cursor, pp.recurringChargePeriod);
                    const due = pp.chargeType === 'inArrear' ? end <= asOf : cursor <= asOf;
                    if (!due || (terminate && cursor >= terminate)) break;
                    created.push(
                        await this.priceAcbr(product, pp, 'appliedBillingChargeProductRecurringCharge', {
                            startDateTime: cursor.toISOString(),
                            endDateTime: end.toISOString(),
                        })
                    );
                    cursor = end;
                }
            }
        }
        return created;
    }

    /**
     * When a product stops part-way through a period already rated in advance, credit the unused part.
     */
    async prorateOnTermination(product: Product, at: Date = this.clock.now()): Promise<Acbr[]> {
        const out: Acbr[] = [];
        const iso = at.toISOString();
        const covering = await this.acbrs.list(
            (a) =>
                a.product?.id === product.id &&
                a.appliedBillingRateType === 'appliedBillingChargeProductRecurringCharge' &&
                a.status !== 'cancelled' &&
                !!a.periodCoverage?.startDateTime &&
                !!a.periodCoverage.endDateTime &&
                a.periodCoverage.startDateTime <= iso &&
                iso < a.periodCoverage.endDateTime
        );
        for (const acbr of covering) {
            const startMs = Date.parse(acbr.periodCoverage!.startDateTime!);
            const endMs = Date.parse(acbr.periodCoverage!.endDateTime!);
            const totalDays = Math.max(1, Math.round((endMs - startMs) / DAY_MS));
            const elapsedDays = Math.min(totalDays, Math.ceil((at.getTime() - startMs) / DAY_MS));
            const incl = calculateProratedAdjustment(acbr.taxIncludedAmount.value, elapsedDays, totalDays);
            const excl = calculateProratedAdjustment(acbr.taxExcludedAmount.value, elapsedDays, totalDays);
            if (incl <= 0) continue;
            if (!acbr.isBilled && elapsedDays === 0) {
                await this.cancelAcbr(acbr.id);
                continue;
            }
            out.push(
                await this.createAcbr({
                    appliedBillingRateType: 'appliedBillingChargeCreditProrationAdjustment',
                    billingAccount: acbr.billingAccount,
                    name: `Credit proration adjustment - ${product.name ?? product.id}`,
                    description: 'CreditProrationAdjustment',
                    product: acbr.product,
                    taxExcludedAmount: { unit: acbr.taxExcludedAmount.unit, value: excl },
                    taxIncludedAmount: { unit: acbr.taxIncludedAmount.unit, value: incl },
                    taxRate: acbr.appliedTax?.[0]?.taxRate,
                    periodCoverage: { startDateTime: iso, endDateTime: acbr.periodCoverage!.endDateTime },
                    date: iso,
                    relatedAcbr: { id: acbr.id },
                })
            );
        }
        return out;
    }

    /* ----- bills ----- */

    listBills(filter?: (b: CustomerBill) => boolean): Promise<CustomerBill[]> {
        return this.bills.list(filter);
    }
    getBill(id: string): Promise<CustomerBill> {
        return this.bills.require(id);
    }

    async calculateBill(accountId: string, options: CalculateBillOptions = {}): Promise<CustomerBill> {
        const account = await this.accounts.get(accountId);
        if (!['active', 'suspended'].includes(account.state)) {
            throw bcError('INVALID_BILLING_ACCOUNT_STATE', `A bill cannot be calculated for a ${account.state} billing account`, 409);
        }
        const now = this.clock.now();
        const billDate = options.billDate ?? now.toISOString();
        const payNow = !!options.acbrIds?.length;
        const candidates = await this.acbrs.list(
            (a) => a.billingAccount.id === accountId && a.status === 'active' && !a.isBilled
        );
        let acbrs: Acbr[];
        if (payNow) {
            acbrs = candidates.filter((a) => options.acbrIds!.includes(a.id));
            const missing = options.acbrIds!.filter((id) => !acbrs.some((a) => a.id === id));
            if (missing.length) {
                throw bcError('ACBR_NOT_BILLABLE', `ACBRs not billable for this account: ${missing.join(', ')}`);
            }
        } else {
            acbrs = candidates.filter((a) => a.date <= billDate);
        }
        if (!acbrs.length) throw bcError('NOTHING_TO_BILL', 'There are no unbilled charges for this billing account', 409);

        const items: CustomerBillItem[] = acbrs
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((a, i) => ({
                id: String(i + 1),
                name: a.name,
                customerBillItemType: a.appliedBillingRateType,
                taxExcludedAmount: a.taxExcludedAmount,
                taxIncludedAmount: a.taxIncludedAmount,
                taxAmount: a.appliedTax?.[0]?.taxAmount,
                product: a.product,
                appliedCustomerBillingRate: [{ id: a.id }],
                periodCoverage: a.periodCoverage,
            }));

        const amounts = calculateCustomerBillAmounts(payableBalanceOf(account), items, account.unsettledBillsAmount, payNow);
        const cycle = await this.accounts.currentCycle(accountId, new Date(billDate));
        const prepaid = account.ratingType === 'prepaid';
        const previous = (await this.bills.list((b) => b.billingAccount.id === accountId && b.state !== 'cancelled')).at(-1);
        const billNo = `INV-${String((await this.bills.list()).length + 1).padStart(6, '0')}`;

        let bill = await this.bills.insert({
            '@type': payNow ? 'PayNowBill' : 'CustomerBill',
            billNo,
            state: 'new',
            category: options.category ?? (payNow ? 'PayNowPurchase' : 'Regular'),
            billDate,
            paymentDueDate: prepaid || payNow || !cycle ? billDate : cycle.paymentDueDate,
            billingPeriod: prepaid || !cycle ? { startDateTime: acbrs[0]!.date, endDateTime: billDate } : cycle.billingPeriod,
            billingAccount: { id: account.id, name: account.name, ratingType: account.ratingType },
            billCycle: prepaid || !cycle ? null : { id: cycle.id, name: cycle.name },
            relatedParty: account.relatedParty ?? [],
            previousAmountDue: amounts.previousAmountDue,
            amountDue: amounts.amountDue,
            remainingAmount: amounts.remainingAmount,
            taxIncludedAmount: amounts.taxIncludedAmount,
            taxExcludedAmount: amounts.taxExcludedAmount,
            payableBalanceUpdateAmount: amounts.payableBalanceUpdateAmount,
            customerBillItems: items,
            appliedPayment: [],
            previousCustomerBill: previous ? { id: previous.id } : undefined,
            createOn: now.toISOString(),
        });

        for (const a of acbrs) {
            await this.acbrs.replace({ ...a, isBilled: true, status: 'completed', bill: { id: bill.id, name: bill.billNo } });
        }
        if (amounts.payableBalanceUpdateAmount.value !== 0) {
            const tx = determineTransactionType(amounts.payableBalanceUpdateAmount);
            await this.accounts.editAccountBalance(accountId, tx.transactionType, 'payableBalance', tx.amount, bill.billNo);
        }
        await this.accounts.setUnsettledBillsAmount(accountId, amounts.unsettledBillsAmount.value);
        await this.events.publish('CustomerBillCreateEvent', { customerBillId: bill.id, billingAccountId: accountId });

        if (options.approve) bill = await this.approveBill(bill.id);
        return bill;
    }

    /** new -> validated. A bill fully covered by existing credit is settled immediately. */
    async approveBill(id: string): Promise<CustomerBill> {
        const bill = await this.bills.require(id);
        if (bill.state !== 'new') throw bcError('INVALID_BILL_STATE', `Only a new bill can be approved (state: ${bill.state})`, 409);
        const covered = bill.remainingAmount.value === 0;
        const saved = await this.bills.replace({ ...bill, state: covered ? 'settled' : 'validated' });
        if (covered) await this.events.publish('CustomerBillSettledEvent', { customerBillId: id, billingAccountId: bill.billingAccount.id });
        return saved;
    }

    /**
     * Cancel a bill nobody has paid yet: its charges become billable again and the
     * balance movement it caused is reversed.
     */
    async cancelBill(id: string): Promise<CustomerBill> {
        const bill = await this.bills.require(id);
        if (!['new', 'validated', 'sent', 'overdue'].includes(bill.state) || bill.appliedPayment.length) {
            throw bcError('INVALID_BILL_STATE', 'Only an unpaid bill can be cancelled', 409);
        }
        const accountId = bill.billingAccount.id;
        for (const item of bill.customerBillItems) {
            for (const ref of item.appliedCustomerBillingRate) {
                const a = await this.acbrs.get(ref.id);
                if (a) await this.acbrs.replace({ ...a, isBilled: false, status: 'active', bill: undefined });
            }
        }
        const update = bill.payableBalanceUpdateAmount;
        if (update.value !== 0) {
            await this.accounts.editAccountBalance(
                accountId,
                update.value < 0 ? 'adjustmentCreditTransaction' : 'adjustmentDebitTransaction',
                'payableBalance',
                { unit: update.unit, value: Math.abs(update.value) },
                `cancel ${bill.billNo}`
            );
        }
        const account = await this.accounts.get(accountId);
        await this.accounts.setUnsettledBillsAmount(
            accountId,
            Dec.of(account.unsettledBillsAmount?.value ?? 0).minus(bill.remainingAmount.value).toNumber()
        );
        return this.bills.replace({ ...bill, state: 'cancelled' });
    }

    /** Bills past their due date with money still owed become overdue. */
    async markOverdueBills(asOf: Date = this.clock.now()): Promise<CustomerBill[]> {
        const iso = asOf.toISOString();
        const due = await this.bills.list(
            (b) =>
                ['validated', 'sent', 'partiallySettled'].includes(b.state) &&
                b.remainingAmount.value > 0 &&
                !!b.paymentDueDate &&
                b.paymentDueDate < iso
        );
        const out: CustomerBill[] = [];
        for (const b of due) {
            out.push(await this.bills.replace({ ...b, state: 'overdue' }));
            await this.events.publish('CustomerBillOverdueEvent', { customerBillId: b.id, billingAccountId: b.billingAccount.id });
        }
        return out;
    }

    unpaidBills(accountId: string): Promise<CustomerBill[]> {
        return this.bills
            .list((b) => b.billingAccount.id === accountId && PAYABLE_STATES.includes(b.state) && b.remainingAmount.value > 0)
            .then((list) => list.sort((a, b) => a.billDate.localeCompare(b.billDate)));
    }

    /**
     * Book a payment: credit the payable balance, then settle unpaid bills oldest
     * first (or the named bill first). Whatever is left stays on the account as credit.
     */
    async applyPayment(
        account: BillingAccount,
        paymentId: string,
        amount: Money,
        paymentMethod?: Ref,
        targetBillId?: string
    ): Promise<SettlementResult> {
        await this.accounts.editAccountBalance(account.id, 'paymentTransaction', 'payableBalance', amount, `payment ${paymentId}`);
        let unpaid = await this.unpaidBills(account.id);
        if (targetBillId) unpaid = [...unpaid.filter((b) => b.id === targetBillId), ...unpaid.filter((b) => b.id !== targetBillId)];
        const result = settleBills(unpaid, paymentId, amount, paymentMethod);
        for (const applied of result.bills) {
            const bill = unpaid.find((b) => b.id === applied.billId)!;
            await this.bills.replace(bill);
            if (bill.state === 'settled') {
                await this.events.publish('CustomerBillSettledEvent', { customerBillId: bill.id, billingAccountId: account.id });
            }
        }
        const fresh = await this.accounts.get(account.id);
        await this.accounts.setUnsettledBillsAmount(
            account.id,
            Dec.of(fresh.unsettledBillsAmount?.value ?? 0).minus(result.amountUsedForSettlement.value).toNumber()
        );
        return result;
    }

    /** Undo applyPayment for a cancelled payment. */
    async reversePayment(account: BillingAccount, paymentId: string, amount: Money): Promise<void> {
        const iso = this.clock.now().toISOString();
        let reopened = Dec.ZERO;
        for (const bill of await this.bills.list((b) => b.appliedPayment.some((ap) => ap.payment.id === paymentId))) {
            const mine = bill.appliedPayment.filter((ap) => ap.payment.id === paymentId);
            const back = mine.reduce((s, ap) => s.plus(ap.appliedAmount.value), Dec.ZERO);
            bill.appliedPayment = bill.appliedPayment.filter((ap) => ap.payment.id !== paymentId);
            bill.remainingAmount.value = roundMoney(Dec.of(bill.remainingAmount.value).plus(back));
            bill.state = bill.appliedPayment.length
                ? 'partiallySettled'
                : bill.paymentDueDate && bill.paymentDueDate < iso
                  ? 'overdue'
                  : 'validated';
            reopened = reopened.plus(back);
            await this.bills.replace(bill);
        }
        await this.accounts.editAccountBalance(account.id, 'adjustmentDebitTransaction', 'payableBalance', amount, `reverse payment ${paymentId}`);
        const fresh = await this.accounts.get(account.id);
        await this.accounts.setUnsettledBillsAmount(
            account.id,
            Dec.of(fresh.unsettledBillsAmount?.value ?? 0).plus(reopened).toNumber()
        );
    }
}
