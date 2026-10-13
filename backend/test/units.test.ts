import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Dec, roundMoney } from '../src/common/decimal.ts';
import { StateMachine, TransitionTable } from '../src/common/stateMachine.ts';
import { mergePatch } from '../src/common/runtime.ts';
import { calculateTax, calculateTaxBulk, validateTaxRequest } from '../src/tax/tax.ts';
import { calculateCycleEndDate, cycleBoundaries, prepareBillCycle } from '../src/billing/billCycle.ts';
import {
    calculateCustomerBillAmounts,
    calculateProratedAdjustment,
    determineTransactionType,
    settleBills,
} from '../src/billing/billingService.ts';
import { calculateUnmatchedAmount, deriveMatchingStatus, paymentLifecycle } from '../src/payment/service.ts';
import { resolveAction, targetStateFor } from '../src/lifecycle/dunning.ts';
import { buildActivationPayload, resolveBundleDeactivation } from '../src/inventory/service.ts';
import { defaultConfig } from '../src/common/runtime.ts';
import type { BillingAccount, BillingCycleSpecification, CustomerBill, Product } from '../src/common/model.ts';

test('Dec: exact arithmetic and half-even rounding', () => {
    assert.equal(Dec.of(0.1).plus(0.2).toString(), '0.3');
    assert.equal(roundMoney(Dec.of('2.345')), 2.34); // half to even
    assert.equal(roundMoney(Dec.of('2.355')), 2.36);
    assert.equal(roundMoney(Dec.of('-2.345')), -2.34);
    assert.equal(Dec.of(1).div(3).toFixed(4), '0.3333');
    assert.equal(Dec.of('1e-7').toString(), '0.0000001');
    assert.equal(Dec.of(10).mul('0.18').toString(), '1.8');
    assert.equal(Dec.max(1, 2).toNumber(), 2);
    assert.throws(() => Dec.of('abc'));
    assert.throws(() => Dec.of(1).div(0));
});

test('StateMachine: targets, events with guards, init and delete rules', async () => {
    const calls: string[] = [];
    const sm = new StateMachine<{ ok: boolean }>({
        id: 't',
        model: {
            a: { initial: true, exit: ['log'], on: { targets: { b: { guard: 'ok' } }, events: { go: [{ target: 'c', guard: 'ok' }, { target: 'b' }] } } },
            b: { entry: ['log'], deletable: true },
            c: {},
        },
        guards: { ok: (c) => c.ok },
        actions: { log: () => void calls.push('log') },
    });
    assert.equal(await sm.init('a', { ok: true }), 'a');
    await assert.rejects(sm.init('b', { ok: true }), /not initializable/);
    assert.equal(await sm.target('a', 'b', { ok: true }), 'b');
    assert.equal(calls.length, 2); // exit a + entry b
    await assert.rejects(sm.target('a', 'b', { ok: false }), /Guard/);
    await assert.rejects(sm.target('b', 'a', { ok: true }), /No transition/);
    assert.equal(await sm.event('a', 'go', { ok: true }), 'c');
    assert.equal(await sm.event('a', 'go', { ok: false }), 'b'); // falls through to the unguarded transition
    await sm.assertDeletable('b', { ok: true });
    await assert.rejects(sm.assertDeletable('a', { ok: true }), /not deletable/);
    assert.throws(() => new StateMachine({ id: 'bad', model: { a: { on: { targets: { zz: {} } } } } }), /not provided/);
});

test('TransitionTable follows the declared rows', () => {
    const t = new TransitionTable('x', [{ currentState: null, nextState: 'a' }, { currentState: 'a', nextState: 'b' }]);
    t.assert(null, 'a');
    t.assert('a', 'a');
    assert.throws(() => t.assert('b', 'a'), /Invalid x state transition/);
    assert.deepEqual(t.nextStates('a'), ['b']);
});

test('mergePatch: nested merge, null deletes, arrays replace', () => {
    assert.deepEqual(mergePatch({ a: 1, b: { c: 2, d: 3 }, e: [1] }, { b: { c: null, x: 1 }, e: [2] }), { a: 1, b: { d: 3, x: 1 }, e: [2] });
});

test('tax: exclusive and inclusive percentage', () => {
    assert.deepEqual(calculateTax({ amount: 499, value: 18 }), {
        gross_amount: '588.82',
        service_amount: '499',
        total_tax_amount: '89.82',
        sales_tax: '0',
        state_and_local_sales_tax: '0',
    });
    const incl = calculateTax({ amount: 11800, value: 18, tax_inclusive: true });
    assert.equal(incl.service_amount, '10000');
    assert.equal(incl.total_tax_amount, '1800');
    assert.equal(incl.gross_amount, '11800');
    // inclusive: net is rounded, tax is the remainder, so the parts always add up
    const odd = calculateTax({ amount: 100, value: 7, tax_inclusive: true });
    assert.equal(odd.service_amount, '93.46');
    assert.equal(odd.total_tax_amount, '6.54');
});

test('tax: bulk totals and validation', () => {
    const r = calculateTaxBulk({ a: { amount: 100, value: 10 }, b: { amount: 50, value: 10 } });
    assert.equal(r.tax_total.total_tax_amount, '15.00');
    assert.equal(r.tax_total.gross_amount, '165.00');
    assert.equal(r.tax_items.a!.gross_amount, '110.00');
    assert.throws(() => validateTaxRequest('x', { amount: 1 } as never), /missing required field value/);
    assert.throws(() => validateTaxRequest('x', { amount: 1, value: 1, calculation_type: 'LINE_ITEM' as never }), /PERCENTAGE/);
});

const spec = (over: Partial<BillingCycleSpecification> = {}): BillingCycleSpecification => ({
    id: 's',
    '@type': 'BillingCycleSpecification',
    name: 'Monthly',
    frequency: 'monthly',
    billingCycleStartDay: 1,
    billingDateShift: 0,
    paymentDueDateOffset: 15,
    mailingDateOffset: 1,
    creditDateOffset: 0,
    chargeDateOffset: 0,
    ...over,
});

test('bill cycle: end is one second before the next boundary', () => {
    const now = new Date('2026-01-10T00:00:00Z');
    assert.equal(calculateCycleEndDate('2026-01-10T00:00:00Z', spec(), now), '2026-01-31T23:59:59.000Z');
    assert.equal(calculateCycleEndDate('2026-01-10T00:00:00Z', spec({ billingCycleStartDay: 15 }), now), '2026-01-14T23:59:59.000Z');
    assert.equal(calculateCycleEndDate('2026-02-10T00:00:00Z', spec({ frequency: 'quarterly' }), new Date('2026-02-10T00:00:00Z')), '2026-03-31T23:59:59.000Z');
    assert.equal(calculateCycleEndDate('2026-12-20T00:00:00Z', spec(), new Date('2026-12-20T00:00:00Z')), '2026-12-31T23:59:59.000Z');
    // a start in a cycle that is already over rolls to the current cycle
    assert.equal(calculateCycleEndDate('2025-11-03T00:00:00Z', spec(), now), '2026-01-31T23:59:59.000Z');
    assert.throws(() => calculateCycleEndDate('yesterday', spec(), now), /valid ISO date/);
    assert.throws(() => cycleBoundaries('monthly', 29, 2026), /maximum allowed/);
    assert.throws(() => cycleBoundaries('monthly', -1, 2026), /negative/);
});

test('bill cycle payload dates are offsets from the cycle end', () => {
    const account = { id: 'a', name: 'Acc' } as BillingAccount;
    const c = prepareBillCycle(spec(), account, '2026-01-31T23:59:59.000Z', '2026-01-10T00:00:00.000Z');
    assert.equal(c.name, 'Monthly Bill Cycle for Acc');
    assert.equal(c.paymentDueDate, '2026-02-15T23:59:59.000Z');
    assert.equal(c.mailingDate, '2026-02-01T23:59:59.000Z');
    assert.equal(c.billingDate, '2026-01-31T23:59:59.000Z');
});

const inr = (value: number) => ({ unit: 'INR', value });
const charge = (incl: number, excl: number) => ({
    customerBillItemType: 'appliedBillingChargeProductRecurringCharge' as const,
    taxIncludedAmount: inr(incl),
    taxExcludedAmount: inr(excl),
});
const credit = (incl: number, excl: number) => ({
    customerBillItemType: 'appliedBillingChargeCreditProrationAdjustment' as const,
    taxIncludedAmount: inr(incl),
    taxExcludedAmount: inr(excl),
});

test('bill amounts: zero balance', () => {
    const a = calculateCustomerBillAmounts(inr(0), [charge(118, 100)], inr(0), false);
    assert.equal(a.taxIncludedAmount.value, 118);
    assert.equal(a.taxExcludedAmount.value, 100);
    assert.equal(a.remainingAmount.value, 118);
    assert.equal(a.amountDue.value, 118);
    assert.equal(a.payableBalanceUpdateAmount.value, -118);
    assert.equal(a.unsettledBillsAmount.value, 118);
});

test('bill amounts: existing credit reduces what is left to pay', () => {
    const a = calculateCustomerBillAmounts(inr(50), [charge(118, 100)], inr(0), false);
    assert.equal(a.previousAmountDue.value, 50);
    assert.equal(a.remainingAmount.value, 68);
    assert.equal(a.amountDue.value, 68);
    assert.equal(a.payableBalanceUpdateAmount.value, -118);
    assert.equal(a.unsettledBillsAmount.value, 68);
    // pay-now bills ignore existing credit for settlement
    assert.equal(calculateCustomerBillAmounts(inr(50), [charge(118, 100)], inr(0), true).remainingAmount.value, 118);
});

test('bill amounts: existing debt carries into amount due; credits net against charges', () => {
    const a = calculateCustomerBillAmounts(inr(-200), [charge(118, 100), credit(18, 15.25)], inr(200), false);
    assert.equal(a.taxIncludedAmount.value, 100);
    assert.equal(a.taxExcludedAmount.value, 84.75);
    assert.equal(a.remainingAmount.value, 100);
    assert.equal(a.amountDue.value, 300);
    assert.equal(a.payableBalanceUpdateAmount.value, -100);
    assert.equal(a.unsettledBillsAmount.value, 300);
});

test('bill amounts: a bill that is a net credit', () => {
    const a = calculateCustomerBillAmounts(inr(0), [credit(30, 25)], inr(0), false);
    assert.equal(a.taxIncludedAmount.value, 0);
    assert.equal(a.remainingAmount.value, 0);
    assert.equal(a.payableBalanceUpdateAmount.value, 30);
    assert.deepEqual(determineTransactionType(a.payableBalanceUpdateAmount), { transactionType: 'paymentTransaction', amount: inr(30) });
    assert.deepEqual(determineTransactionType(inr(-5)), { transactionType: 'billGenerationTransaction', amount: inr(5) });
});

test('proration: credit for the unused part of a period', () => {
    assert.equal(calculateProratedAdjustment(300, 10, 30), 200);
    assert.equal(calculateProratedAdjustment(588.82, 31, 31), 0);
    assert.equal(calculateProratedAdjustment(100, 1, 3), 66.67);
});

const bill = (id: string, remaining: number, state: CustomerBill['state'] = 'validated'): CustomerBill =>
    ({ id, billNo: id, state, remainingAmount: inr(remaining), appliedPayment: [] }) as unknown as CustomerBill;

test('settleBills: oldest first, partial on the last one, leftover reported', () => {
    const bills = [bill('b1', 100), bill('b2', 100), bill('b3', 100, 'new')];
    const r = settleBills(bills, 'p1', inr(150), { id: 'card' });
    assert.equal(bills[0]!.state, 'settled');
    assert.equal(bills[0]!.remainingAmount.value, 0);
    assert.equal(bills[1]!.state, 'partiallySettled');
    assert.equal(bills[1]!.remainingAmount.value, 50);
    assert.equal(bills[1]!.paymentMethod?.id, 'card');
    assert.equal(r.amountUsedForSettlement.value, 150);
    assert.equal(r.unappliedAmount, 0);
    // a "new" bill is not payable yet, so extra money stays unapplied
    const r2 = settleBills(bills, 'p2', inr(500));
    assert.equal(r2.amountUsedForSettlement.value, 50);
    assert.equal(r2.unappliedAmount, 450);
    assert.equal(bills[2]!.appliedPayment.length, 0);
});

test('payment matching', () => {
    const p = { totalAmount: inr(100), paymentItem: [{ id: '1', totalAmount: inr(60), unmatchedAmount: inr(0), isMatchedSuccessfully: true }] };
    assert.equal(calculateUnmatchedAmount(p).value, 40);
    assert.equal(deriveMatchingStatus(p), 'matchedPartially');
    p.paymentItem.push({ id: '2', totalAmount: inr(40), unmatchedAmount: inr(0), isMatchedSuccessfully: true });
    assert.equal(deriveMatchingStatus(p), 'matchedFully');
    assert.ok(paymentLifecycle.allows('reserved', 'approved'));
    assert.ok(!paymentLifecycle.allows('approved', 'cancelled'));
    assert.ok(!paymentLifecycle.allows('declined', 'approved'));
});

test('dunning: state graph and schedule', () => {
    assert.equal(resolveAction('active', 'graceWithSubscription'), 'active_to_gws');
    assert.equal(resolveAction('terminating', 'active'), 'terminating_to_active');
    assert.equal(resolveAction('active', 'active'), undefined);
    assert.throws(() => resolveAction('active', 'terminated'), /Unknown subscriber state transition/);
    const s = defaultConfig.dunning;
    assert.equal(targetStateFor(0, s), 'active');
    assert.equal(targetStateFor(1, s), 'graceWithSubscription');
    assert.equal(targetStateFor(15, s), 'graceWithoutSubscription');
    assert.equal(targetStateFor(45, s), 'terminating');
    assert.equal(targetStateFor(60, s), 'terminated');
});

const prod = (id: string, rel: Product['productRelationship'] = []): Product =>
    ({ id, productOffering: { id: 'o-' + id }, productRelationship: rel }) as unknown as Product;

test('bundle deactivation: all members -> head; partial only when allowed', () => {
    const products = [
        prod('head', [{ relationshipType: 'bundles', id: 'm1' }, { relationshipType: 'bundles', id: 'm2' }]),
        prod('m1', [{ relationshipType: 'bundledBy', id: 'head' }]),
        prod('m2', [{ relationshipType: 'bundledBy', id: 'head' }]),
        prod('solo'),
    ];
    assert.deepEqual(resolveBundleDeactivation(products, ['m1', 'm2', 'solo', 'ghost'], false).map((t) => t.productId).sort(), ['head', 'solo']);
    assert.throws(() => resolveBundleDeactivation(products, ['m1'], false), /part of a bundle/);
    assert.deepEqual(resolveBundleDeactivation(products, ['m1'], true).map((t) => t.productId), ['m1']);
});

test('activation payload: term window and manual repurchase', () => {
    const now = new Date('2026-01-10T00:00:00Z');
    const p = { productTerm: [{ duration: { amount: 12, units: 'month' }, renewalAction: 'manualRepurchase' }] } as unknown as Product;
    const payload = buildActivationPayload(p, now);
    assert.equal(payload.status, 'active');
    assert.equal(payload.productTerm![0]!.validFor!.endDateTime, '2027-01-10T00:00:00.000Z');
    assert.equal(payload.terminationDate, '2027-01-10T00:00:00.000Z');
    assert.equal(buildActivationPayload({} as Product, now).terminationDate, undefined);
});
