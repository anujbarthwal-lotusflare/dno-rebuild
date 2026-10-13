import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.ts';
import { FixedClock } from '../src/common/runtime.ts';
import { DomainError } from '../src/common/errors.ts';
import { seed } from '../src/seed.ts';
import {
    applyBundlePriceForChild,
    buildProductPrices,
    calculateDifference,
    calculateDutyFreeAmount,
    calculateOneTimeFee,
    calculatePriceAfterAlteration,
    earlyTerminationPayRestOfTerm,
    filterProductOfferingPrice,
    totalsFor,
} from '../src/pricing/pricing.ts';
import type { PriceAlteration, Product, ProductOfferingPrice } from '../src/common/model.ts';

const fresh = async () => {
    const clock = new FixedClock('2026-01-10T00:00:00Z');
    const app = createApp({ clock });
    const ids = await seed(app);
    return { app, ids, clock };
};
const code = (c: string) => (e: unknown) => e instanceof DomainError && e.code === c;

/* ---------- party ---------- */

test('party: status follows the state machine', async () => {
    const { app, ids } = await fresh();
    const asha = await app.parties.getIndividual(ids.individualId!);
    assert.equal(asha.status, 'validated');
    await assert.rejects(app.parties.patchIndividual(asha.id, { status: 'initialized' }), code('PARTY-VALIDATE_ERROR'));
    assert.equal((await app.parties.patchIndividual(asha.id, { status: 'deceased' })).status, 'deceased');
    await assert.rejects(app.parties.patchIndividual(asha.id, { status: 'validated' }), /Invalid status transition/);
    // a new party can only start as initialized
    await assert.rejects(app.parties.createIndividual({ givenName: 'A', familyName: 'B', status: 'validated' }), /not initializable/);
    const events = await app.events.recent();
    assert.ok(events.some((e) => e.eventType === 'IndividualStateChangeEvent'));
});

test('party: validators', async () => {
    const { app, ids } = await fresh();
    await assert.rejects(
        app.parties.createIndividual({
            givenName: 'A',
            familyName: 'B',
            contactMedium: [
                { '@type': 'EmailContactMedium', preferred: true },
                { '@type': 'EmailContactMedium', preferred: true },
            ],
        }),
        code('PARTY-MULTIPLE_PREFERRED_CONTACT_MEDIUM')
    );
    await assert.rejects(app.parties.createIndividual({ givenName: 'A', familyName: 'B', creditProfile: [{ creditScore: 700 }] }), code('PARTY-INVALID_CREDIT_RATING'));
    await assert.rejects(app.parties.createIndividual({ givenName: 'A', familyName: 'B', taxExemptionCertificate: [{}] }), code('PARTY-TAX_EXEMPTION_CERTIFICATE_INVALID'));
    await assert.rejects(app.parties.createOrganization({ name: 'D', isLegalEntity: true, organizationType: 'Department' }), code('PARTY-DEPARTMENT_CANNOT_BE_LEGAL_ENTITY'));
    await assert.rejects(
        app.parties.createOrganization({ name: 'H', isHeadOffice: true, organizationParentRelationship: { organization: { id: ids.organizationId! } } }),
        code('PARTY-HEAD_OFFICE_ORGANIZATION_CANNOT_HAVE_PARENT')
    );
    await assert.rejects(
        app.parties.createOrganization({ name: 'O', organizationParentRelationship: { organization: { id: 'nope' } } }),
        code('PARTY-PARENT_ORGANIZATION_NOT_FOUND')
    );
    await assert.rejects(app.parties.patchOrganization(ids.organizationId!, { organizationParentRelationship: { organization: { id: ids.organizationId! } } }), /head office|own parent/);
});

/* ---------- catalog ---------- */

test('catalog: POPs are generated from price tables with the original naming', async () => {
    const { app, ids } = await fresh();
    const plan = await app.catalog.getOffering(ids.planId!);
    const names = plan.productOfferingPrice!.map((p) => p.name);
    assert.deepEqual(names, [
        'RC 499 INR monthly',
        'OTF add 99 INR',
        'RC 449 INR monthly Terms(12 month)',
        'RC Discount 50 INR monthly QuantityTiers(5-*)',
        'RC Discount 50 INR monthly QuantityTiers(5-*) Terms(12 month)',
        'Early termination fee',
    ]);
    const base = plan.productOfferingPrice![0]!;
    assert.equal(base.description, 'recurringCharge, monthly, currency INR');
    const override = plan.productOfferingPrice![2]!;
    assert.equal(override.priceType, 'recurringCharge');
    assert.deepEqual(override.popRelationship![0]!.relationshipType, 'overrides');
    assert.equal(override.popRelationship![0]!.id, base.id);
    assert.equal(override.description, 'recurringCharge, monthly, currency INR, match Terms(12 month)');
    const discount = plan.productOfferingPrice![3]!;
    assert.equal(discount.priceType, 'discount');
    assert.equal(discount.lowerOrderQuantity, 5);
    assert.equal(discount.upperOrderQuantity, undefined);
    assert.deepEqual(discount.priceAlterationType, ['fixed']);
    assert.equal(discount.description, 'discount, monthly, currency INR, match QuantityTiers(5-*)');
});

test('catalog: lifecycle and edit rules', async () => {
    const { app, ids } = await fresh();
    const draft = await app.catalog.getOffering(ids.draftOfferingId!);
    assert.equal(draft.lifecycleStatus, 'inDraft');
    await assert.rejects(app.catalog.patchOffering(draft.id, { lifecycleStatus: 'launched' }), code('COMMON-INVALID_STATE_TRANSITION'));
    await assert.rejects(app.catalog.deleteOffering(draft.id), /Invalid productOffering state transition/);
    await app.catalog.patchOffering(draft.id, { lifecycleStatus: 'active' });
    await assert.rejects(app.catalog.patchOffering(draft.id, { productOfferingPriceTable: [] }), /only be edited while the offering is inDraft/);
    await app.catalog.patchOffering(draft.id, { lifecycleStatus: 'retired' });
    await app.catalog.deleteOffering(draft.id);
    await assert.rejects(app.catalog.getOffering(draft.id), code('COMMON-NOT_FOUND'));
    // a specification must start inDraft, an offering may start active
    await assert.rejects(app.catalog.createSpecification({ name: 'S', lifecycleStatus: 'active' }), /Invalid productSpecification state transition/);
    await assert.rejects(app.catalog.createOffering({ name: 'Bad', isBundle: true }), /at least one bundled offering/);
    await assert.rejects(
        app.catalog.createOffering({
            name: 'NoPeriod',
            productOfferingPriceTable: [{ '@type': 'SimpleProductOfferingBasePriceTable', tableConfig: {}, tableData: [{ priceType: 'recurringCharge', price: { unit: 'INR', value: 1 } }] }],
        }),
        /recurringChargePeriodType/
    );
});

test('catalog: bundle discount is only generated when every member can take it', async () => {
    const { app, ids } = await fresh();
    const bundle = await app.catalog.createOffering({
        name: 'Plan + handset',
        isBundle: true,
        lifecycleStatus: 'active',
        bundledProductOffering: [{ id: ids.handsetId! }],
        productOfferingPriceTable: [
            {
                '@type': 'BundleProductOfferingBasePriceTable',
                tableConfig: { isTaxIncluded: true, recurringChargePeriodType: 'monthly', bundlePriceRelationshipType: 'discount', bundlePriceAdjustmentType: 'percentage' },
                tableData: [
                    { priceType: 'oneTimeCharge', currency: 'INR', alterationAmount: 10 },
                    { priceType: 'oneTimeCharge', currency: 'USD', alterationAmount: 10 }, // no member priced in USD
                    { priceType: 'recurringCharge', currency: 'INR', alterationAmount: 10 }, // handset has no recurring charge
                ],
            },
        ],
    });
    assert.equal(bundle.productOfferingPrice!.length, 1);
    const pop = bundle.productOfferingPrice![0]!;
    assert.equal(pop.name, 'OTC discount 10% INR');
    assert.equal(pop.priceType, 'discount');
    assert.equal(pop.percentage, 10);
    assert.equal(pop.bundledPopRelationship!.length, 1);
    assert.equal(pop.bundledPopRelationship![0]!.relationshipType, 'composedOf');
});

/* ---------- pricing ---------- */

const pop = (over: Partial<ProductOfferingPrice>): ProductOfferingPrice => ({ '@type': 'ProductOfferingPrice', id: 'x', priceType: 'recurringCharge', ...over });

test('price filter: each rule drops what it should and says why', () => {
    const pops = [
        pop({ id: 'rc', price: { unit: 'INR', value: 100 }, recurringChargePeriodType: 'monthly' }),
        pop({ id: 'rc2', price: { unit: 'INR', value: 90 } }), // second RC: not unique
        pop({ id: 'usd', priceType: 'oneTimeCharge', price: { unit: 'USD', value: 1 } }),
        pop({ id: 'tier', priceType: 'discount', percentage: 5, isPercentage: true, lowerOrderQuantity: 10, popRelationship: [{ id: 'rc', relationshipType: 'discount' }] }),
        pop({ id: 'termed', priceType: 'oneTimeCharge', price: { unit: 'INR', value: 5 }, productOfferingTerm: [{ duration: { amount: 12, units: 'month' } }] }),
        pop({ id: 'fee', priceType: 'oneTimeFee', price: { unit: 'INR', value: 9 } }),
        pop({ id: 'orphan', priceType: 'discount', percentage: 5, isPercentage: true, popRelationship: [{ id: 'gone', relationshipType: 'discount' }] }),
        pop({ id: 'ok', priceType: 'discount', percentage: 5, isPercentage: true, popRelationship: [{ id: 'rc', relationshipType: 'discount' }] }),
    ];
    const { prices, failedReasonById } = filterProductOfferingPrice(pops, { quantity: 2, currency: 'INR' });
    assert.deepEqual(prices.map((p) => p.id), ['rc', 'ok']);
    assert.deepEqual(failedReasonById, {
        termed: 'failedFilterByTerm',
        usd: 'failedFilterByCurrency',
        fee: 'failedFilterByOneTimeFeePrice',
        rc2: 'failedFilterMajorPriceUnique',
        orphan: 'failedFilterAlterationPrice',
    });
    // with a term selected, prices without that term no longer apply
    const withTerm = filterProductOfferingPrice(pops, { quantity: 2, currency: 'INR', productTerm: [{ duration: { amount: 12, units: 'month' } }] });
    assert.deepEqual(withTerm.prices.map((p) => p.id), ['termed']);
});

test('price filter: characteristic-conditioned prices', () => {
    const p = pop({
        id: 'big',
        price: { unit: 'INR', value: 1 },
        prodSpecCharValueUse: [{ name: 'Data', characteristicSpecificationRef: { id: 'data' }, productSpecCharacteristicValue: [{ id: 'data-50', value: 50, unitOfMeasure: 'GB' }] }],
    });
    const cfg = (value: number) => ({
        quantity: 1,
        currency: 'INR',
        characteristic: [{ name: 'Data', value, unitOfMeasure: 'GB', characteristicSpecificationRef: { id: 'data' } }],
    });
    assert.equal(filterProductOfferingPrice([p], cfg(50)).prices.length, 1);
    assert.equal(filterProductOfferingPrice([p], cfg(10)).prices.length, 0);
    assert.equal(filterProductOfferingPrice([p], { quantity: 1, currency: 'INR' }).prices.length, 0);
});

const alt = (priceType: 'markup' | 'discount', over: Partial<PriceAlteration>): PriceAlteration => ({ priceType, price: {}, ...over });

test('alterations: markups before discounts, same priority summed on the same base', () => {
    // 100 +10% = 110; then priority 1: -10% and -5 on 110 = 94; then priority 2: -50% = 47
    const list = [
        alt('discount', { priority: 1, isPercentage: true, price: { percentage: 10 } }),
        alt('discount', { priority: 1, price: { dutyFreeAmount: { unit: 'INR', value: 5 } } }),
        alt('discount', { priority: 2, isPercentage: true, price: { percentage: 50 } }),
        alt('markup', { isPercentage: true, price: { percentage: 10 } }),
    ];
    assert.equal(calculatePriceAfterAlteration(list, 100), 47);
    assert.equal(calculatePriceAfterAlteration([], 12.345), 12.34);
    // duty-free variant: per layer, markup then discount; quantity applied at the end
    const layered = [
        alt('markup', { priority: 0, price: { percentage: 10 } }),
        alt('discount', { priority: 0, price: { percentage: 10 } }),
    ];
    assert.deepEqual(calculateDutyFreeAmount({ unit: 'INR', value: 100 }, layered, 3), { unit: 'INR', value: 297 });
});

test('pricing: term override and quantity tier on the seeded plan', async () => {
    const { app, ids } = await fresh();
    const plan = await app.catalog.getOffering(ids.planId!);
    const price = (quantity: number, term: boolean) =>
        buildProductPrices([
            {
                id: '1',
                offering: structuredClone(plan),
                config: { quantity, currency: 'INR', productTerm: term ? [{ duration: { amount: 12, units: 'month' } }] : undefined },
            },
        ]).get('1')!;

    const basic = price(1, false);
    assert.equal(basic.length, 1);
    assert.equal(basic[0]!.price.dutyFreeAmount!.value, 499);
    assert.equal(basic[0]!.priceAlteration!.length, 0);
    assert.deepEqual(totalsFor(basic, 1, 0)[0]!.price, {
        dutyFreeAmount: { unit: 'INR', value: 499 },
        taxIncludedAmount: { unit: 'INR', value: 588.82 },
        taxRate: 18,
    });

    const committed = price(1, true);
    assert.equal(committed[0]!.price.dutyFreeAmount!.value, 449);
    assert.equal(committed[0]!.productOfferingTerm?.id, 'term-12m');

    const fleet = price(5, true);
    assert.equal(fleet[0]!.priceAlteration!.length, 1);
    const total = totalsFor(fleet, 5, 0)[0]!.price;
    assert.equal(total.dutyFreeAmount!.value, 1995); // (449 - 50) x 5
    assert.equal(total.taxIncludedAmount!.value, 2354.1);

    assert.equal(price(4, false)[0]!.priceAlteration!.length, 0); // below the tier
    assert.equal(totalsFor(price(5, false), 5, 0)[0]!.price.dutyFreeAmount!.value, 2245); // (499 - 50) x 5
});

test('pricing: one-time fees per action, and early termination pays the rest of the term', async () => {
    const { app, ids } = await fresh();
    const plan = await app.catalog.getOffering(ids.planId!);
    const now = new Date('2026-07-10T00:00:00Z');
    const add = calculateOneTimeFee(plan, { quantity: 3, currency: 'INR', action: 'add' }, undefined, now);
    assert.equal(add.money.value, 99); // appliesOn item: not multiplied by quantity
    assert.equal(calculateOneTimeFee(plan, { quantity: 1, currency: 'USD', action: 'add' }, undefined, now).money.value, 0);

    const override = plan.productOfferingPrice!.find((p) => p.name?.includes('449'))!;
    const product = {
        quantity: 1,
        productPrice: [{ priceType: 'recurringCharge', price: {}, productOfferingPrice: { id: override.id } }],
        productTerm: [{ duration: { amount: 12, units: 'month' }, validFor: { endDateTime: '2027-01-10T00:00:00Z' } }],
    } as unknown as Product;
    const etf = calculateOneTimeFee(plan, { quantity: 1, currency: 'INR', action: 'delete' }, product, now);
    // 184 days left / (365.25/12 days per month) x 449
    assert.equal(etf.money.value, 2714.28);
    assert.equal(etf.name, 'Early termination fee');
    // no term on the product -> nothing to pay
    const noTerm = { ...product, productTerm: [] } as Product;
    assert.equal(calculateOneTimeFee(plan, { quantity: 1, currency: 'INR', action: 'delete' }, noTerm, now).money.value, 0);
    // a product on the plain monthly price has no term either
    assert.equal(earlyTerminationPayRestOfTerm(noTerm, override, 'delete', now), 0);
    assert.equal(earlyTerminationPayRestOfTerm(product, override, 'add', now), 0);
    assert.equal(earlyTerminationPayRestOfTerm(product, override, 'delete', new Date('2027-02-01T00:00:00Z')), 0);
});

test('pricing: a bundle can nullify or discount member prices', () => {
    const child = [pop({ id: 'c-otc', priceType: 'oneTimeCharge', price: { unit: 'INR', value: 100 } }), pop({ id: 'c-rc', price: { unit: 'INR', value: 10 } })];
    const bundle = [
        pop({ id: 'b-null', priceType: 'recurringCharge', price: { unit: 'INR', value: 0 }, bundledPopRelationship: [{ id: 'r1', bundledProductOfferingPriceId: 'c-rc', relationshipType: 'nullify' }] }),
        pop({ id: 'b-disc', priceType: 'discount', isPercentage: true, percentage: 10, bundledPopRelationship: [{ id: 'r2', bundledProductOfferingPriceId: 'c-otc', relationshipType: 'composedOf' }] }),
    ];
    const result = applyBundlePriceForChild(child, bundle);
    assert.deepEqual(result.map((p) => p.id), ['c-otc', 'b-disc']);
    const prices = buildProductPrices([
        { id: 'p', offering: { id: 'b', '@type': 'ProductOffering', name: 'B', lifecycleStatus: 'active', productOfferingPrice: bundle }, config: { quantity: 1, currency: 'INR' } },
        { id: 'c', parentItemId: 'p', offering: { id: 'c', '@type': 'ProductOffering', name: 'C', lifecycleStatus: 'active', productOfferingPrice: child }, config: { quantity: 1, currency: 'INR' } },
    ]);
    assert.equal(totalsFor(prices.get('c')!, 1, 0)[0]!.price.dutyFreeAmount!.value, 90);
});

test('pricing: difference between an order line and the installed product', () => {
    const original = {
        quantity: 2,
        productCharacteristic: [{ id: 'v1', name: 'Data', value: 10, characteristicSpecificationRef: { id: 'data' } }],
    } as unknown as Product;
    assert.deepEqual(calculateDifference(original, 'modify', [{ id: 'v1', name: 'Data', value: 10, characteristicSpecificationRef: { id: 'data' } }], 2), { action: 'noChange' });
    const d = calculateDifference(original, 'modify', [{ id: 'v2', name: 'Data', value: 50, characteristicSpecificationRef: { id: 'data' } }], 3);
    assert.equal(d.action, 'modify');
    assert.equal(d.quantityDifference, 1);
    assert.equal(d.characteristicDifference![0]!.currentValue, 50);
    assert.deepEqual(calculateDifference(original, 'delete', [], 2), { action: 'delete', quantityDifference: 2 });
});

/* ---------- billing accounts ---------- */

test('billing account: state rules, balance guard rails, activation opens a cycle', async () => {
    const { app, ids } = await fresh();
    const id = ids.postpaidAccountId!;
    await assert.rejects(app.accounts.patch(id, { accountBalance: [] }), code('BAM-UNAUTHORIZED_OPERATION'));
    await assert.rejects(app.accounts.patch(id, { creditLimit: { unit: 'USD', value: 1 } }), code('BAM-CURRENCY_CHANGE_NOT_ALLOWED'));
    await assert.rejects(app.accounts.editAccountBalance(id, 'adjustmentCreditTransaction', 'availableCreditLimit', { unit: 'INR', value: 1 }), /dedicated endpoint/);
    await assert.rejects(app.accounts.editAccountBalance(id, 'adjustmentCreditTransaction', 'payableBalance', { unit: 'USD', value: 1 }), code('BAM-CURRENCY_MISMATCH'));

    const { billingAccount, billCycle } = await app.accounts.activate(id);
    assert.equal(billingAccount.state, 'active');
    assert.equal(billCycle.billingPeriod.endDateTime, '2026-01-31T23:59:59.000Z');
    assert.equal(billCycle.paymentDueDate, '2026-02-15T23:59:59.000Z');
    await assert.rejects(app.accounts.activate(id), code('BAM-INVALID_ACTIVATION_REQUEST'));
    await assert.rejects(app.accounts.patch(id, { state: 'created' }), code('BAM-ACCOUNT_INVALID_STATE_TRANSITION'));

    // debt lowers available credit; a closed account needs a clean balance
    await app.accounts.editAccountBalance(id, 'adjustmentDebitTransaction', 'payableBalance', { unit: 'INR', value: 500 });
    const owing = await app.accounts.get(id);
    assert.equal(owing.accountBalance.find((b) => b.balanceType === 'payableBalance')!.amount.value, -500);
    assert.equal(owing.accountBalance.find((b) => b.balanceType === 'availableCreditLimit')!.amount.value, 19500);
    await assert.rejects(app.accounts.close(id), code('BAM-ACCOUNT_HAS_OUTSTANDING_BALANCE'));
    await app.accounts.editAccountBalance(id, 'adjustmentCreditTransaction', 'payableBalance', { unit: 'INR', value: 500 });
    assert.equal((await app.accounts.close(id)).state, 'closed');
    assert.equal((await app.accounts.listTransactions(id)).length, 2);

    // prepaid account without a cycle specification cannot be activated through the cycle path
    await assert.rejects(app.accounts.activate(ids.prepaidAccountId!), code('BAM-INVALID_CYCLE_SPECIFICATION'));
    await assert.rejects(
        app.accounts.create({ name: 'X', currency: 'INR', relatedParty: [{ role: 'customer', partyOrPartyRole: { id: 'ghost' } }] }),
        /does not exist/
    );
});
