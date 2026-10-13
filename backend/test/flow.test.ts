import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.ts';
import type { App } from '../src/app.ts';
import { FixedClock } from '../src/common/runtime.ts';
import { payableBalanceOf } from '../src/billing/accountService.ts';
import { seed } from '../src/seed.ts';
import type { CreateOrder } from '../src/ordering/service.ts';

const fresh = async (config = {}) => {
    const clock = new FixedClock('2026-01-10T00:00:00Z');
    const app = createApp({ clock, config });
    const ids = await seed(app);
    return { app, ids: ids as Record<string, string>, clock };
};
const customer = (id: string, type: 'Individual' | 'Organization' = 'Individual') => [
    { role: 'customer', partyOrPartyRole: { id, '@referredType': type } },
];
const balance = async (app: App, id: string) => payableBalanceOf(await app.accounts.get(id)).value;
const term12 = [{ duration: { amount: 12, units: 'month' as const } }];

test('postpaid: order -> active product -> bill -> payment -> settled', async () => {
    const { app, ids, clock } = await fresh();
    const order = await app.ordering.create({
        relatedParty: customer(ids.individualId!),
        billingAccount: { id: ids.postpaidAccountId! },
        productOrderItem: [{ action: 'add', quantity: 1, productOffering: { id: ids.planId! } }],
    });
    assert.equal(order.state, 'completed', JSON.stringify(order.stateReason));
    assert.equal(order.productOrderItem[0]!.state, 'completed');
    assert.equal(order.deficitAmount!.value, 0); // postpaid pays on the bill
    const totals = Object.fromEntries(order.orderTotalPrice!.map((t) => [t.priceType, t.price.taxIncludedAmount!.value]));
    assert.deepEqual(totals, { recurringCharge: 588.82, oneTimeFee: 116.82 });

    // inventory
    const product = await app.inventory.getProduct(order.productOrderItem[0]!.product!.id!);
    assert.equal(product.status, 'active');
    assert.equal(product.startDate, '2026-01-10T00:00:00.000Z');
    const subscription = await app.inventory.getSubscription(product.subscription!.id);
    assert.equal(subscription.state, 'active');

    // the order activated the billing account and opened its first cycle
    const account = await app.accounts.get(ids.postpaidAccountId!);
    assert.equal(account.state, 'active');
    assert.equal((await app.accounts.listCycles(account.id)).length, 1);

    // rating: first month in advance + activation fee
    const acbrs = await app.billing.listAcbrs();
    assert.deepEqual(acbrs.map((a) => [a.appliedBillingRateType, a.taxIncludedAmount.value]).sort(), [
        ['appliedBillingChargeProductRecurringCharge', 588.82],
        ['appliedBillingChargeServiceFee', 116.82],
    ]);
    assert.equal(acbrs[0]!.periodCoverage!.endDateTime, '2026-02-10T00:00:00.000Z');
    assert.equal(await balance(app, account.id), 0); // nothing billed yet

    // bill run at the end of the cycle
    clock.set('2026-02-01T00:00:00Z');
    const bill = await app.billing.calculateBill(account.id, { approve: true });
    assert.equal(bill.state, 'validated');
    assert.equal(bill.billNo, 'INV-000001');
    assert.equal(bill.taxIncludedAmount.value, 705.64);
    assert.equal(bill.taxExcludedAmount.value, 598);
    assert.equal(bill.remainingAmount.value, 705.64);
    assert.equal(bill.customerBillItems.length, 2);
    assert.equal(await balance(app, account.id), -705.64);
    assert.equal((await app.accounts.get(account.id)).unsettledBillsAmount!.value, 705.64);
    await assert.rejects(app.billing.calculateBill(account.id), /no unbilled charges/);

    // part payment, then the rest plus a little extra
    const p1 = await app.payments.create({ account: { id: account.id }, totalAmount: { unit: 'INR', value: 500 } });
    assert.equal(p1.matchingStatus, 'matchedFully');
    assert.equal(p1.paymentItem[0]!.item!.id, bill.id);
    assert.equal((await app.billing.getBill(bill.id)).state, 'partiallySettled');
    assert.equal(await balance(app, account.id), -205.64);
    const p2 = await app.payments.create({ account: { id: account.id }, totalAmount: { unit: 'INR', value: 250 } });
    assert.equal(p2.matchingStatus, 'matchedPartially');
    assert.equal(p2.unmatchedAmount!.value, 44.36);
    const settled = await app.billing.getBill(bill.id);
    assert.equal(settled.state, 'settled');
    assert.equal(settled.remainingAmount.value, 0);
    assert.equal(settled.appliedPayment.length, 2);
    assert.equal(await balance(app, account.id), 44.36); // overpayment stays as credit
    assert.equal((await app.accounts.get(account.id)).unsettledBillsAmount!.value, 0);

    // next month: recurring run rates February, the credit reduces the new bill
    clock.set('2026-02-10T00:00:00Z');
    const created = await app.billing.runRecurringCharges();
    assert.equal(created.length, 1);
    assert.equal(created[0]!.periodCoverage!.startDateTime, '2026-02-10T00:00:00.000Z');
    assert.equal((await app.billing.runRecurringCharges()).length, 0); // idempotent
    const bill2 = await app.billing.calculateBill(account.id, { approve: true });
    assert.equal(bill2.previousAmountDue.value, 44.36);
    assert.equal(bill2.taxIncludedAmount.value, 588.82);
    assert.equal(bill2.remainingAmount.value, 544.46);
    assert.equal(bill2.previousCustomerBill!.id, bill.id);
    assert.equal(bill2.billCycle!.name, 'Monthly Bill Cycle for Asha Verma - Postpaid');
    assert.equal(bill2.paymentDueDate, '2026-03-15T23:59:59.000Z'); // the February cycle was opened automatically

    // refund is limited to the credit the customer holds
    await assert.rejects(app.payments.requestRefund({ account: { id: account.id }, totalAmount: { unit: 'INR', value: 10 } }), /exceeds the credit/);
});

test('postpaid: 5 lines on a 12 month term get the term price and the tier discount', async () => {
    const { app, ids } = await fresh();
    const order = await app.ordering.create({
        relatedParty: customer(ids.individualId!),
        billingAccount: { id: ids.postpaidAccountId! },
        productOrderItem: [{ action: 'add', quantity: 5, productOffering: { id: ids.planId! }, product: { productTerm: term12 } }],
    });
    assert.equal(order.state, 'completed', JSON.stringify(order.stateReason));
    const rc = order.orderTotalPrice!.find((t) => t.priceType === 'recurringCharge')!;
    assert.equal(rc.price.dutyFreeAmount!.value, 1995);
    assert.equal(rc.price.taxIncludedAmount!.value, 2354.1);
    const product = await app.inventory.getProduct(order.productOrderItem[0]!.product!.id!);
    assert.equal(product.productTerm![0]!.validFor!.endDateTime, '2027-01-10T00:00:00.000Z');
    assert.equal(product.productTerm![0]!.productOfferingTerm!.id, 'term-12m');
});

test('prepaid: reservation is taken, the order is billed and paid on delivery', async () => {
    const { app, ids } = await fresh();
    const body: CreateOrder = {
        relatedParty: customer(ids.organizationId!, 'Organization'),
        billingAccount: { id: ids.prepaidAccountId! },
        productOrderItem: [{ action: 'add', productOffering: { id: ids.handsetId! } }],
    };
    // no money and no payment method: rejected before anything is fulfilled
    const rejected = await app.ordering.create(body);
    assert.equal(rejected.state, 'rejected');
    assert.match(rejected.stateReason![0]!.label, /short by 11800 INR/);
    assert.equal((await app.inventory.listProducts()).length, 0);
    assert.equal((await app.accounts.get(ids.prepaidAccountId!)).state, 'created');

    const order = await app.ordering.create({ ...body, paymentMethod: { id: 'card-1' } });
    assert.equal(order.state, 'completed', JSON.stringify(order.stateReason));
    assert.equal(order.deficitAmount!.value, 11800);
    const payment = await app.payments.get(order.payment![0]!.id);
    assert.equal(payment.status, 'approved');
    assert.equal(payment.matchingStatus, 'matchedFully');
    const [bill] = await app.billing.listBills();
    assert.equal(bill!.state, 'settled');
    assert.equal(bill!.taxIncludedAmount.value, 11800);
    assert.equal(bill!.taxExcludedAmount.value, 10000); // price was tax inclusive
    assert.equal(bill!.customerBillItems[0]!.taxAmount!.value, 1800);
    assert.equal(bill!.billCycle, null); // prepaid bills have no cycle
    assert.equal(await balance(app, ids.prepaidAccountId!), 0);

    // with credit on the account only the shortfall is reserved
    await app.payments.create({ account: { id: ids.prepaidAccountId! }, totalAmount: { unit: 'INR', value: 5000 } });
    const second = await app.ordering.create({ ...body, paymentMethod: { id: 'card-1' } });
    assert.equal(second.state, 'completed');
    assert.equal(second.deficitAmount!.value, 6800);
    assert.equal(await balance(app, ids.prepaidAccountId!), 0);
    assert.ok((await app.billing.listBills()).every((b) => b.state === 'settled'));
});

test('order validation collects every reason and rejects', async () => {
    const { app, ids } = await fresh();
    await app.parties.patchOrganization(ids.organizationId!, { status: 'closed' });
    const order = await app.ordering.create({
        relatedParty: customer(ids.organizationId!, 'Organization'),
        billingAccount: { id: ids.postpaidAccountId! }, // belongs to someone else
        productOrderItem: [
            { action: 'add', productOffering: { id: ids.draftOfferingId! } },
            { action: 'add', productOffering: { id: ids.planId! }, product: { productTerm: [{ duration: { amount: 24, units: 'month' } }] } },
            { action: 'delete', product: { id: 'missing' } },
            { action: 'add', quantity: 0, productOffering: { id: ids.handsetId! } },
        ],
    });
    assert.equal(order.state, 'rejected');
    const codes = order.stateReason!.map((r) => r.code);
    for (const expected of [
        'CustomerStatusError',
        'WrongBillingAccountError',
        'ProductOfferingNotAvailable',
        'productPriceTermNotDeclared',
        'noMatchingPrice',
        'ProductNotFound',
        'modifiedQuantityOutOfRange',
    ]) {
        assert.ok(codes.includes(expected), `missing ${expected} in ${codes.join(',')}`);
    }
    assert.ok(order.productOrderItem.every((i) => i.state === 'rejected'));
    assert.equal((await app.inventory.listProducts()).length, 0);

    await assert.rejects(app.ordering.create({ relatedParty: [], productOrderItem: [] } as never), /at least one productOrderItem/);
    const noCustomer = await app.ordering.create({
        relatedParty: [],
        billingAccount: { id: ids.postpaidAccountId! },
        productOrderItem: [{ action: 'add', productOffering: { id: ids.handsetId! } }],
    });
    assert.deepEqual(noCustomer.stateReason!.map((r) => r.code), ['CustomerAssociationError']);
});

test('order validation: prices sent by the client must match the catalog; credit limit is enforced', async () => {
    const { app, ids } = await fresh();
    const base = { relatedParty: customer(ids.individualId!), billingAccount: { id: ids.postpaidAccountId! } };
    const preview = await app.ordering.preview({ ...base, productOrderItem: [{ action: 'add', productOffering: { id: ids.handsetId! } }] });
    assert.equal(preview.upfrontAmount, 11800);
    assert.deepEqual(preview.stateReason, []);
    const honest = preview.order.productOrderItem[0]!.product!.productPrice!;
    const tampered = structuredClone(honest);
    tampered[0]!.price.dutyFreeAmount!.value = 1;
    const bad = await app.ordering.create({ ...base, productOrderItem: [{ action: 'add', productOffering: { id: ids.handsetId! }, product: { productPrice: tampered } }] });
    assert.equal(bad.state, 'rejected');
    assert.deepEqual(bad.stateReason!.map((r) => r.code), ['productPriceMismatch']);
    const good = await app.ordering.create({ ...base, productOrderItem: [{ action: 'add', productOffering: { id: ids.handsetId! }, product: { productPrice: honest } }] });
    assert.equal(good.state, 'completed');

    // limit is 20000: a second handset (11800) on top of nothing recurring is fine, two in one order is not
    const over = await app.ordering.create({ ...base, productOrderItem: [{ action: 'add', quantity: 2, productOffering: { id: ids.handsetId! } }] });
    assert.equal(over.state, 'rejected');
    assert.deepEqual(over.stateReason!.map((r) => r.code), ['AccountCreditLimitExceeded']);
});

test('a failure during fulfilment rolls everything back and fails the order', async () => {
    const { app, ids } = await fresh();
    app.ordering.failAtStep = 'commit_payment_deficit';
    const order = await app.ordering.create({
        relatedParty: customer(ids.organizationId!, 'Organization'),
        billingAccount: { id: ids.prepaidAccountId! },
        paymentMethod: { id: 'card-1' },
        productOrderItem: [{ action: 'add', productOffering: { id: ids.handsetId! } }],
    });
    assert.equal(order.state, 'failed');
    assert.equal(order.stateReason![0]!.code, 'FulfilmentError');
    assert.equal(order.productOrderItem[0]!.product!.id, undefined);
    const products = await app.inventory.listProducts();
    assert.deepEqual(products.map((p) => p.status), ['aborted']);
    assert.ok((await app.billing.listAcbrs()).every((a) => a.status === 'cancelled'));
    assert.equal((await app.payments.list())[0]!.status, 'cancelled');
    assert.equal((await app.billing.listBills()).length, 0);
    assert.equal(await balance(app, ids.prepaidAccountId!), 0);
    const [execution] = await app.sagas.list();
    assert.equal(execution!.status, 'rolledBack');
    assert.ok(execution!.steps.some((s) => s.name === 'rollback:fulfill_order_items' && s.status === 'compensated'));

    // a failure before fulfilment starts means "rejected", and the lock is released either way
    app.ordering.failAtStep = 'update_state_to_queued';
    const early = await app.ordering.create({
        relatedParty: customer(ids.organizationId!, 'Organization'),
        billingAccount: { id: ids.prepaidAccountId! },
        paymentMethod: { id: 'card-1' },
        productOrderItem: [{ action: 'add', productOffering: { id: ids.handsetId! } }],
    });
    assert.equal(early.state, 'rejected');
    app.ordering.failAtStep = undefined;
    const retry = await app.ordering.create({
        relatedParty: customer(ids.organizationId!, 'Organization'),
        billingAccount: { id: ids.prepaidAccountId! },
        paymentMethod: { id: 'card-1' },
        productOrderItem: [{ action: 'add', productOffering: { id: ids.handsetId! } }],
    });
    assert.equal(retry.state, 'completed');
});

test('modify changes quantity and price; delete charges early termination and credits the unused period', async () => {
    const { app, ids, clock } = await fresh({ shouldValidateCreditLimit: false });
    const base = { relatedParty: customer(ids.individualId!), billingAccount: { id: ids.postpaidAccountId! } };
    const first = await app.ordering.create({
        ...base,
        productOrderItem: [{ action: 'add', quantity: 1, productOffering: { id: ids.planId! }, product: { productTerm: term12 } }],
    });
    const productId = first.productOrderItem[0]!.product!.id!;

    clock.set('2026-01-20T00:00:00Z');
    const modify = await app.ordering.create({ ...base, productOrderItem: [{ action: 'modify', quantity: 5, product: { id: productId } }] });
    assert.equal(modify.state, 'completed', JSON.stringify(modify.stateReason));
    const modified = await app.inventory.getProduct(productId);
    assert.equal(modified.quantity, 5);
    assert.equal(modified.productPrice![0]!.priceAlteration!.length, 1); // now qualifies for the tier discount
    assert.equal(modified.productTerm![0]!.validFor!.endDateTime, '2027-01-10T00:00:00.000Z'); // term keeps running

    // terminate on day 10 of a 31 day period that was rated in advance at 449 + 18%
    clock.set('2026-07-10T00:00:00Z');
    await app.billing.runRecurringCharges();
    clock.set('2026-07-20T00:00:00Z');
    const preview = await app.ordering.preview({ ...base, productOrderItem: [{ action: 'delete', product: { id: productId } }] });
    assert.equal(preview.order.orderTotalPrice![0]!.priceType, 'oneTimeFee');
    const del = await app.ordering.create({ ...base, productOrderItem: [{ action: 'delete', product: { id: productId } }] });
    assert.equal(del.state, 'completed', JSON.stringify(del.stateReason));
    assert.equal((await app.inventory.getProduct(productId)).status, 'terminated');
    assert.equal((await app.inventory.getSubscription(modified.subscription!.id)).state, 'terminated');

    const acbrs = await app.billing.listAcbrs((a) => a.productOrder?.id === del.id || a.appliedBillingRateType === 'appliedBillingChargeCreditProrationAdjustment');
    const penalty = acbrs.find((a) => a.appliedBillingRateType === 'appliedBillingChargePenaltyFee')!;
    // 174 days of term left / 30.4375 x 449 = 2566.77, + 18% tax
    assert.equal(penalty.taxExcludedAmount.value, 2566.77);
    assert.equal(penalty.taxIncludedAmount.value, 3028.79);
    const credit = acbrs.find((a) => a.appliedBillingRateType === 'appliedBillingChargeCreditProrationAdjustment')!;
    // July period was rated at (449-50) x 5 = 1995 + 18% = 2354.10; 10 of 31 days used -> credit 21/31
    assert.equal(credit.taxIncludedAmount.value, 1594.71);
    assert.equal(credit.relatedAcbr!.id.length > 0, true);

    // nothing more is rated for a terminated product
    clock.set('2026-09-10T00:00:00Z');
    assert.equal((await app.billing.runRecurringCharges()).length, 0);
    await assert.rejects(app.inventory.activate(productId), /cannot move to active/);
});

test('bundle order: members are added with the bundle and cannot be removed on their own', async () => {
    const { app, ids } = await fresh({ shouldValidateCreditLimit: false });
    const bundle = await app.catalog.createOffering({
        name: 'Starter bundle',
        isBundle: true,
        lifecycleStatus: 'active',
        bundledProductOffering: [{ id: ids.handsetId! }, { id: ids.planId! }],
        productOfferingPriceTable: [
            {
                '@type': 'BundleProductOfferingBasePriceTable',
                tableConfig: { isTaxIncluded: true, bundlePriceRelationshipType: 'discount', bundlePriceAdjustmentType: 'percentage' },
                tableData: [{ priceType: 'oneTimeCharge', currency: 'INR', alterationAmount: 10 }],
            },
        ],
    });
    // the plan has no one-time charge and its prices exclude tax, so the bundle discount cannot be generated
    assert.equal(bundle.productOfferingPrice!.length, 0);

    const base = { relatedParty: customer(ids.individualId!), billingAccount: { id: ids.postpaidAccountId! } };
    const order = await app.ordering.create({ ...base, productOrderItem: [{ action: 'add', productOffering: { id: bundle.id } }] });
    assert.equal(order.state, 'completed', JSON.stringify(order.stateReason));
    assert.deepEqual(order.productOrderItem.map((i) => i.id), ['1', '1.1', '1.2']);
    const products = await app.inventory.listProducts();
    assert.equal(products.length, 3);
    const head = products.find((p) => p.isBundle)!;
    assert.equal(head.productRelationship!.filter((r) => r.relationshipType === 'bundles').length, 2);
    const member = products.find((p) => p.productOffering.id === ids.planId)!;
    assert.equal(member.productRelationship![0]!.id, head.id);

    const partial = await app.ordering.create({ ...base, productOrderItem: [{ action: 'delete', product: { id: member.id } }] });
    assert.equal(partial.state, 'rejected');
    assert.deepEqual(partial.stateReason!.map((r) => r.code), ['SubscriptionIsPartOfBundle']);

    const whole = await app.ordering.create({ ...base, productOrderItem: [{ action: 'delete', product: { id: head.id } }] });
    assert.equal(whole.state, 'completed', JSON.stringify(whole.stateReason));
    assert.ok((await app.inventory.listProducts()).every((p) => p.status === 'terminated'));
});

test('dunning: overdue bill walks the account down the ladder; paying restores service', async () => {
    const { app, ids, clock } = await fresh();
    const accountId = ids.postpaidAccountId!;
    const order = await app.ordering.create({
        relatedParty: customer(ids.individualId!),
        billingAccount: { id: accountId },
        productOrderItem: [{ action: 'add', productOffering: { id: ids.planId! } }],
    });
    const productId = order.productOrderItem[0]!.product!.id!;
    clock.set('2026-01-31T12:00:00Z');
    const bill = await app.billing.calculateBill(accountId, { approve: true });
    assert.equal(bill.paymentDueDate, '2026-02-15T23:59:59.000Z');

    clock.set('2026-02-15T00:00:00Z');
    assert.deepEqual(await app.dunning.run(), { overdueBills: 0, changed: [] });

    clock.set('2026-02-17T00:00:00Z'); // 1 day late
    const r1 = await app.dunning.run();
    assert.equal(r1.overdueBills, 1);
    assert.deepEqual(r1.changed, [{ accountId, from: 'active', to: 'graceWithSubscription' }]);
    assert.equal((await app.billing.getBill(bill.id)).state, 'overdue');
    assert.equal((await app.inventory.getProduct(productId)).status, 'active'); // grace: service continues

    clock.set('2026-03-03T00:00:00Z'); // 15 days late
    await app.dunning.run();
    const suspended = await app.inventory.getProduct(productId);
    assert.equal(suspended.status, 'suspended');
    assert.equal(suspended.suspensionReason, 'billingInitiated');
    assert.equal((await app.accounts.get(accountId)).subscriberState, 'graceWithoutSubscription');
    assert.equal((await app.billing.runRecurringCharges()).length, 0); // suspended products are not rated

    // paying the bill fires bill_settled and service comes back
    await app.payments.create({ account: { id: accountId }, totalAmount: { unit: 'INR', value: 705.64 } });
    assert.equal((await app.billing.getBill(bill.id)).state, 'settled');
    assert.equal((await app.accounts.get(accountId)).subscriberState, 'active');
    assert.equal((await app.inventory.getProduct(productId)).status, 'active');

    // a customer who never pays is terminated, skipping no step on the way
    clock.set('2026-03-10T00:00:00Z');
    const resumed = await app.billing.runRecurringCharges();
    assert.deepEqual(resumed.map((a) => a.periodCoverage!.startDateTime), ['2026-03-03T00:00:00.000Z']); // not the suspended weeks
    const bill2 = await app.billing.calculateBill(accountId, { approve: true });
    clock.set('2026-06-30T00:00:00Z');
    const final = await app.dunning.run();
    assert.equal(final.changed[0]!.to, 'terminated');
    assert.equal((await app.inventory.getProduct(productId)).status, 'terminated');
    const steps = (await app.events.recent(500)).filter((e) => e.eventType === 'SubscriberStateChangeEvent').map((e) => (e.payload as { action: string }).action);
    assert.deepEqual(steps.slice(0, 4).reverse(), ['active_to_gws', 'gws_to_gwos', 'gwos_to_terminating', 'terminating_to_terminated']);
    assert.equal((await app.billing.getBill(bill2.id)).state, 'overdue');
    assert.equal(app.events.errors.length, 0);
});

test('payments: cancelling an approved payment reopens the bill; bill cancellation frees the charges', async () => {
    const { app, ids, clock } = await fresh();
    const accountId = ids.postpaidAccountId!;
    await app.ordering.create({
        relatedParty: customer(ids.individualId!),
        billingAccount: { id: accountId },
        productOrderItem: [{ action: 'add', productOffering: { id: ids.planId! } }],
    });
    clock.set('2026-02-01T00:00:00Z');
    const bill = await app.billing.calculateBill(accountId, { approve: true });
    const payment = await app.payments.create({ account: { id: accountId }, totalAmount: { unit: 'INR', value: 705.64 } });
    assert.equal((await app.billing.getBill(bill.id)).state, 'settled');
    await assert.rejects(app.billing.cancelBill(bill.id), /Only an unpaid bill/);
    await assert.rejects(app.payments.transition(payment.id, 'cancelled'), /Invalid payment state transition/);

    const cancelled = await app.payments.cancel(payment.id);
    assert.equal(cancelled.status, 'cancelled');
    const reopened = await app.billing.getBill(bill.id);
    assert.equal(reopened.state, 'validated');
    assert.equal(reopened.remainingAmount.value, 705.64);
    assert.equal(await balance(app, accountId), -705.64);
    assert.equal((await app.accounts.get(accountId)).unsettledBillsAmount!.value, 705.64);

    await app.billing.cancelBill(bill.id);
    assert.equal(await balance(app, accountId), 0);
    assert.equal((await app.accounts.get(accountId)).unsettledBillsAmount!.value, 0);
    assert.ok((await app.billing.listAcbrs()).every((a) => !a.isBilled && a.status === 'active'));
    const rebilled = await app.billing.calculateBill(accountId);
    assert.equal(rebilled.state, 'new');
    assert.equal(rebilled.taxIncludedAmount.value, 705.64);

    // payment validation
    await assert.rejects(app.payments.create({ account: { id: 'nope' }, totalAmount: { unit: 'INR', value: 1 } }), /existing billing account/);
    await assert.rejects(app.payments.create({ account: { id: accountId }, totalAmount: { unit: 'INR', value: 0 } }), /must be positive/);
    await assert.rejects(app.payments.create({ account: { id: accountId }, totalAmount: { unit: 'USD', value: 5 } }), /currency must be INR/);
    const pending = await app.payments.create({ account: { id: accountId }, totalAmount: { unit: 'INR', value: 5 }, status: 'pending' });
    assert.equal(await balance(app, accountId), -705.64); // not booked until approved
    assert.equal((await app.payments.transition(pending.id, 'declined')).status, 'declined');
    await assert.rejects(app.payments.transition(pending.id, 'approved'), /Invalid payment state transition/);
});

test('draft orders are stored untouched until submitted; orders can be cancelled only before delivery', async () => {
    const { app, ids } = await fresh();
    const draft = await app.ordering.create({
        state: 'draft',
        relatedParty: customer(ids.individualId!),
        billingAccount: { id: ids.postpaidAccountId! },
        productOrderItem: [{ action: 'add', productOffering: { id: ids.handsetId! } }],
    });
    assert.equal(draft.state, 'draft');
    assert.equal((await app.inventory.listProducts()).length, 0);
    const done = await app.ordering.submitDraft(draft.id);
    assert.equal(done.state, 'completed');
    await assert.rejects(app.ordering.cancel(done.id), /cannot be cancelled/);
    await assert.rejects(app.ordering.submitDraft(done.id), /Only a draft order/);
    const other = await app.ordering.create({
        state: 'draft',
        relatedParty: customer(ids.individualId!),
        billingAccount: { id: ids.postpaidAccountId! },
        productOrderItem: [{ action: 'add', productOffering: { id: ids.handsetId! } }],
    });
    assert.equal((await app.ordering.cancel(other.id)).state, 'cancelled');
});
