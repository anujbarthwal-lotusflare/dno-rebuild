/**
 * Demo data: one customer of each kind, a small catalog (plan with tiers, a term
 * discount, a device, an activation fee, an early-termination fee) and billing accounts.
 */
import type { App } from './app.ts';

export async function seed(app: App): Promise<Record<string, string>> {
    const { parties, catalog, accounts } = app;

    const asha = await parties.createIndividual({
        givenName: 'Asha',
        familyName: 'Verma',
        contactMedium: [
            { '@type': 'EmailContactMedium', preferred: true, emailAddress: 'asha.verma@example.com' },
            { '@type': 'PhoneContactMedium', preferred: true, phoneNumber: '+91 98100 00001' },
        ],
    });
    await parties.patchIndividual(asha.id, { status: 'validated' });

    const acme = await parties.createOrganization({
        name: 'Acme Logistics',
        tradingName: 'Acme',
        isLegalEntity: true,
        isHeadOffice: true,
        organizationType: 'company',
        contactMedium: [{ '@type': 'EmailContactMedium', preferred: true, emailAddress: 'billing@acme.example.com' }],
    });
    await parties.createOrganization({
        name: 'Acme Logistics - Fleet',
        organizationType: 'department',
        organizationParentRelationship: { relationshipType: 'parent', organization: { id: acme.id } },
    });

    const spec = await catalog.createSpecification({
        name: 'Mobile plan',
        productSpecCharacteristic: [
            {
                id: 'data',
                name: 'Data allowance',
                characteristicValueSpecification: [
                    { id: 'data-10', value: 10, unitOfMeasure: 'GB', isDefault: true },
                    { id: 'data-50', value: 50, unitOfMeasure: 'GB' },
                ],
            },
        ],
    });
    await catalog.patchSpecification(spec.id, { lifecycleStatus: 'active' });
    const deviceSpec = await catalog.createSpecification({ name: 'Device' });
    await catalog.patchSpecification(deviceSpec.id, { lifecycleStatus: 'active' });

    const plan = await catalog.createOffering({
        name: 'Unlimited Talk 10GB',
        description: 'Monthly mobile plan. 449 instead of 499 on a 12 month term, 50 off per line from 5 lines.',
        productSpecification: { id: spec.id },
        earlyTerminationFee: { currency: 'INR' },
        productOfferingTerm: [{ id: 'term-12m', name: '12 months', duration: { amount: 12, units: 'month' }, renewalAction: 'autoRenew' }],
        productOfferingPriceTable: [
            {
                '@type': 'SimpleProductOfferingBasePriceTable',
                tableConfig: { isTaxIncluded: false, recurringChargePeriodType: 'monthly', taxRate: 18 },
                tableData: [
                    { priceType: 'recurringCharge', price: { unit: 'INR', value: 499 } },
                    { priceType: 'oneTimeFee', price: { unit: 'INR', value: 99 }, action: 'add' },
                ],
            },
            {
                // committing to 12 months replaces the monthly price
                '@type': 'SimpleProductOfferingComplexPriceTable',
                tableConfig: {
                    priceRelationshipType: 'overrides',
                    priceAdjustmentType: 'fixed',
                    tableRows: [
                        {
                            priceTableHeaderItems: [
                                { categoryName: 'Terms', categoryValues: [{ id: 'term-12m', name: '12 months', duration: { amount: 12, units: 'month' } }] },
                            ],
                        },
                    ],
                },
                tableData: [{ priceType: 'recurringCharge', currency: 'INR', rowIndex: 0, colIndex: -1, alterationAmount: 449 }],
            },
            {
                // 50 off per line from 5 lines
                '@type': 'SimpleProductOfferingComplexPriceTable',
                tableConfig: {
                    priceRelationshipType: 'discount',
                    priceAdjustmentType: 'fixed',
                    tableRows: [{ priceTableHeaderItems: [{ categoryName: 'QuantityTiers', categoryValues: [{ lowerValue: 5 }] }] }],
                    tableColumns: [
                        {
                            priceTableHeaderItems: [
                                { categoryName: 'Terms', categoryValues: [{ id: 'term-12m', name: '12 months', duration: { amount: 12, units: 'month' } }] },
                            ],
                        },
                    ],
                },
                // a price only applies to the term it is defined for, so the tier is listed without and with the term
                tableData: [
                    { priceType: 'recurringCharge', currency: 'INR', rowIndex: 0, colIndex: -1, alterationAmount: 50 },
                    { priceType: 'recurringCharge', currency: 'INR', rowIndex: 0, colIndex: 0, alterationAmount: 50 },
                ],
            },
        ],
    });
    await catalog.patchOffering(plan.id, { lifecycleStatus: 'active' });

    const handset = await catalog.createOffering({
        name: 'Handset X1',
        description: 'Smartphone, one-time purchase.',
        productSpecification: { id: deviceSpec.id },
        lifecycleStatus: 'active',
        productOfferingPriceTable: [
            {
                '@type': 'SimpleProductOfferingBasePriceTable',
                tableConfig: { isTaxIncluded: true, taxRate: 18 },
                tableData: [{ priceType: 'oneTimeCharge', price: { unit: 'INR', value: 11800 } }],
            },
        ],
    });

    const draftOffer = await catalog.createOffering({
        name: 'Fibre 300 (draft)',
        description: 'Not yet orderable: still in draft.',
        productOfferingPriceTable: [
            {
                '@type': 'SimpleProductOfferingBasePriceTable',
                tableConfig: { isTaxIncluded: false, recurringChargePeriodType: 'monthly', taxRate: 18 },
                tableData: [{ priceType: 'recurringCharge', price: { unit: 'INR', value: 999 } }],
            },
        ],
    });

    const monthly = await accounts.createCycleSpecification({
        name: 'Monthly, 1st of month',
        frequency: 'monthly',
        billingCycleStartDay: 1,
        paymentDueDateOffset: 15,
    });

    const ashaAccount = await accounts.create({
        name: 'Asha Verma - Postpaid',
        ratingType: 'postpaid',
        currency: 'INR',
        relatedParty: [{ role: 'customer', partyOrPartyRole: { id: asha.id, '@referredType': 'Individual' } }],
        creditLimit: { unit: 'INR', value: 20000 },
        billStructure: { cycleSpecification: { id: monthly.id, name: monthly.name } },
    });
    const acmeAccount = await accounts.create({
        name: 'Acme Logistics - Prepaid',
        ratingType: 'prepaid',
        currency: 'INR',
        relatedParty: [{ role: 'customer', partyOrPartyRole: { id: acme.id, '@referredType': 'Organization' } }],
    });

    return {
        individualId: asha.id,
        organizationId: acme.id,
        planId: plan.id,
        handsetId: handset.id,
        draftOfferingId: draftOffer.id,
        cycleSpecificationId: monthly.id,
        postpaidAccountId: ashaAccount.id,
        prepaidAccountId: acmeAccount.id,
    };
}
