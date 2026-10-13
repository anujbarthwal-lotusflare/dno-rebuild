/**
 * Customer 360 (TMF717 style): one read model over the core domain (party, ordering,
 * inventory, billing, payment) for residential (Individual) and business (Organization)
 * customers, plus the actions the Customer 360 tabs offer.
 */
import type { App } from '../app.ts';
import type { Collection } from '../common/store.ts';
import { invalid, notFound } from '../common/errors.ts';
import type { BillingAccount, ContactMedium, Individual, Organization, Product, ProductOrder, RelatedParty, Subscription } from '../common/model.ts';
import { payableBalanceOf } from '../billing/accountService.ts';
import type { Quote } from './model.ts';
import { renderPdf } from './pdf.ts';
import { Rng } from './random.ts';

export type CustomerKind = 'residential' | 'business';
type Party = Individual | Organization;

const LIVE_PRODUCT = ['created', 'pendingActive', 'active', 'suspended', 'pendingTerminate'];

const contact = (party: Party, type: string, field: string): string => {
    const cm = (party.contactMedium ?? []).find((c) => c['@type'] === type && c.preferred) ?? (party.contactMedium ?? []).find((c) => c['@type'] === type);
    return cm ? String(cm[field] ?? '') : '';
};

const partyName = (p: Party): string => (p['@type'] === 'Individual' ? `${p.givenName} ${p.familyName}` : p.name);

const isCustomerOf = (partyId: string) => (rp: RelatedParty[] | undefined) => (rp ?? []).some((r) => r.partyOrPartyRole.id === partyId);

export class Customer360Service {
    private readonly app: App;
    readonly quotes: Collection<Quote>;

    constructor(app: App) {
        this.app = app;
        this.quotes = app.store.collection<Quote>('c360Quote', 'Quote');
    }

    private async party(kind: CustomerKind, id: string): Promise<Party> {
        return kind === 'residential' ? this.app.parties.getIndividual(id) : this.app.parties.getOrganization(id);
    }

    kind(raw: string): CustomerKind {
        if (raw !== 'residential' && raw !== 'business') throw invalid(`Unknown customer type "${raw}"`);
        return raw;
    }

    async list(kind: CustomerKind) {
        const parties: Party[] = kind === 'residential' ? await this.app.parties.listIndividuals() : await this.app.parties.listOrganizations();
        const accounts = await this.app.accounts.list();
        return parties.map((p) => ({
            id: p.id,
            name: partyName(p),
            status: p.status,
            email: contact(p, 'EmailContactMedium', 'emailAddress'),
            phone: contact(p, 'PhoneContactMedium', 'phoneNumber'),
            accounts: accounts.filter((a) => isCustomerOf(p.id)(a.relatedParty)).length,
            category: p['@type'] === 'Organization' ? (p.organizationType ?? '') : 'Individual',
        }));
    }

    async header(kind: CustomerKind, id: string) {
        const p = await this.party(kind, id);
        const meta = (p as unknown as { c360?: Record<string, string> }).c360 ?? {};
        return {
            id: p.id,
            kind,
            name: partyName(p),
            status: p.status,
            type: p['@type'] === 'Organization' ? (p.isLegalEntity === false ? 'Department' : 'Company') : 'Individual',
            segment: meta.segment ?? (kind === 'business' ? 'Small and Medium Companies' : 'Consumer'),
            phone: contact(p, 'PhoneContactMedium', 'phoneNumber'),
            email: contact(p, 'EmailContactMedium', 'emailAddress'),
            postalAddress: [contact(p, 'GeographicAddressContactMedium', 'street1'), contact(p, 'GeographicAddressContactMedium', 'city'), contact(p, 'GeographicAddressContactMedium', 'postCode')].filter(Boolean).join(', '),
            billingResponsiblePerson: meta.billingResponsiblePerson ?? '',
            customerSignatoryPerson: meta.customerSignatoryPerson ?? '',
        };
    }

    async general(kind: CustomerKind, id: string) {
        const p = await this.party(kind, id);
        return {
            party: p,
            contactMedium: p.contactMedium ?? [],
            identifications: ((p as unknown as { c360Identification?: unknown[] }).c360Identification ?? []) as { type: string; value: string; issuedBy?: string }[],
            creditProfile: p.creditProfile ?? [],
        };
    }

    async updateGeneral(kind: CustomerKind, id: string, body: { contactMedium?: ContactMedium[]; creditProfile?: unknown[]; name?: string; givenName?: string; familyName?: string }) {
        const patch: Record<string, unknown> = {};
        if (body.contactMedium !== undefined) {
            if (!Array.isArray(body.contactMedium)) throw invalid('contactMedium must be a list');
            patch.contactMedium = body.contactMedium;
        }
        if (body.creditProfile !== undefined) patch.creditProfile = body.creditProfile;
        if (kind === 'business' && body.name !== undefined) patch.name = body.name;
        if (kind === 'residential') {
            if (body.givenName !== undefined) patch.givenName = body.givenName;
            if (body.familyName !== undefined) patch.familyName = body.familyName;
        }
        if (kind === 'residential') await this.app.parties.patchIndividual(id, patch as Partial<Individual>);
        else await this.app.parties.patchOrganization(id, patch as Partial<Organization>);
        return this.general(kind, id);
    }

    async accounts(kind: CustomerKind, id: string) {
        await this.party(kind, id);
        const accounts = await this.app.accounts.listForParty(id);
        return accounts.map((a) => this.accountRow(a));
    }

    private accountRow(a: BillingAccount) {
        let balance = 0;
        try {
            balance = payableBalanceOf(a).value;
        } catch {
            balance = 0;
        }
        return { id: a.id, name: a.name, state: a.state, ratingType: a.ratingType, balance: { value: balance, unit: a.accountBalance[0]?.amount.unit ?? 'USD' }, creditLimit: a.creditLimit };
    }

    async closeAccount(kind: CustomerKind, id: string, accountId: string) {
        if (kind !== 'business') throw invalid('Financial accounts can only be deleted for business customers');
        const accounts = await this.app.accounts.listForParty(id);
        if (!accounts.some((a) => a.id === accountId)) throw notFound('Billing account', accountId);
        const products = await this.app.inventory.listProducts((p) => p.billingAccount?.id === accountId && LIVE_PRODUCT.includes(p.status));
        if (products.length) throw invalid('The account still has products in service; terminate them first');
        return this.accountRow(await this.app.accounts.close(accountId));
    }

    async orders(kind: CustomerKind, id: string): Promise<ProductOrder[]> {
        await this.party(kind, id);
        return (await this.app.ordering.list()).filter((o) => isCustomerOf(id)(o.relatedParty)).sort((a, b) => (b.orderDate ?? '').localeCompare(a.orderDate ?? ''));
    }

    async portfolio(kind: CustomerKind, id: string) {
        await this.party(kind, id);
        const accounts = (await this.app.accounts.listForParty(id)).map((a) => a.id);
        const subs = (await this.app.inventory.listSubscriptions()).filter((s) => isCustomerOf(id)(s.relatedParty) || (s.billingAccount && accounts.includes(s.billingAccount.id)));
        const products = await this.app.inventory.listProducts();
        return subs.map((s) => this.subscriptionRow(s, products));
    }

    private subscriptionRow(s: Subscription, all: Product[]) {
        const products = all.filter((p) => p.subscription?.id === s.id && p.status !== 'aborted' && p.status !== 'cancelled');
        const top = products.filter((p) => !p.productRelationship?.some((r) => r.relationshipType === 'bundledBy'));
        const toRow = (p: Product): Record<string, unknown> => {
            const term = p.productTerm?.[0];
            const children = products.filter((c) => c.productRelationship?.some((r) => r.relationshipType === 'bundledBy' && r.id === p.id));
            return {
                kind: 'product',
                id: p.id,
                name: p.name ?? p.productOffering.name ?? p.productOffering.id,
                quantity: p.quantity,
                offeringTerm: term?.duration ? `${term.duration.amount} ${term.duration.units}` : '-',
                startDate: p.startDate ?? p.creationDate,
                endDate: p.terminationDate ?? (term?.validFor?.endDateTime ?? ''),
                status: p.status,
                isBundle: Boolean(p.isBundle),
                billingAccount: p.billingAccount,
                productOffering: p.productOffering,
                productPrice: p.productPrice ?? [],
                children: children.map(toRow),
            };
        };
        return {
            kind: 'subscription',
            id: s.id,
            name: s.name ?? s.id,
            quantity: '-',
            offeringTerm: '-',
            startDate: s.creationDate,
            endDate: '',
            status: s.state,
            billingAccount: s.billingAccount,
            children: top.map(toRow),
        };
    }

    /** Modify status of a subscription (all its live products) or a single product. */
    async modifyStatus(target: 'subscription' | 'product', id: string, status: string) {
        const apply = async (p: Product) => {
            if (status === 'active') {
                if (p.status === 'suspended') await this.app.inventory.activate(p.id);
            } else if (status === 'suspended') {
                if (p.status === 'active') await this.app.inventory.suspend(p.id, 'customer care');
            } else if (status === 'terminated') {
                if (['active', 'suspended', 'pendingTerminate'].includes(p.status)) {
                    await this.app.inventory.terminate(p.id);
                    await this.app.billing.prorateOnTermination(await this.app.inventory.getProduct(p.id));
                }
            } else throw invalid('Status must be active, suspended or terminated');
        };
        if (target === 'product') {
            await apply(await this.app.inventory.getProduct(id));
            return this.app.inventory.getProduct(id);
        }
        const sub = await this.app.inventory.getSubscription(id);
        for (const ref of sub.product) {
            const p = await this.app.inventory.findProduct(ref.id);
            if (p) await apply(p);
        }
        return this.app.inventory.getSubscription(id);
    }

    /** Purchase product offerings: a new order adding the offering for this customer. */
    async purchase(kind: CustomerKind, id: string, body: { offeringId?: string; quantity?: number; billingAccountId?: string; termMonths?: number }) {
        const p = await this.party(kind, id);
        if (!body.offeringId) throw invalid('Choose a product offering');
        const accounts = await this.app.accounts.listForParty(id);
        const account = accounts.find((a) => a.id === body.billingAccountId) ?? accounts[0];
        if (!account) throw invalid('The customer has no billing account');
        const quantity = Number(body.quantity ?? 1);
        return this.app.ordering.create({
            relatedParty: [{ role: 'customer', partyOrPartyRole: { id: p.id, '@referredType': p['@type'] } }],
            billingAccount: { id: account.id },
            paymentMethod: account.ratingType === 'prepaid' ? { id: 'card-on-file', name: 'Card on file' } : undefined,
            channel: { id: 'customer-care', name: 'Customer care' },
            productOrderItem: [
                {
                    action: 'add',
                    quantity,
                    productOffering: { id: body.offeringId },
                    product: body.termMonths ? { productTerm: [{ duration: { amount: body.termMonths, units: 'month' } }] } : undefined,
                },
            ],
        });
    }

    /** Modify by order: change the quantity of a product through a modify order item. */
    async modifyByOrder(kind: CustomerKind, id: string, body: { productId?: string; quantity?: number }) {
        const p = await this.party(kind, id);
        if (!body.productId) throw invalid('Choose a product to modify');
        const product = await this.app.inventory.getProduct(body.productId);
        const quantity = Number(body.quantity);
        if (!Number.isInteger(quantity) || quantity < 1) throw invalid('Quantity must be a whole number of at least 1');
        return this.app.ordering.create({
            relatedParty: [{ role: 'customer', partyOrPartyRole: { id: p.id, '@referredType': p['@type'] } }],
            billingAccount: product.billingAccount,
            channel: { id: 'customer-care', name: 'Customer care' },
            productOrderItem: [{ action: 'modify', quantity, productOffering: { id: product.productOffering.id }, product: { id: product.id } }],
        });
    }

    async listQuotes(kind: CustomerKind, id: string) {
        if (kind !== 'business') throw invalid('Quotes are only available for business customers');
        await this.party(kind, id);
        return (await this.quotes.list((q) => q.customerId === id)).sort((a, b) => b.quoteDate.localeCompare(a.quoteDate));
    }

    /** Modify by quote (business only): records a quote for the subscription change. */
    async createQuote(kind: CustomerKind, id: string, body: { subscriptionId?: string; name?: string; description?: string; totalAmount?: number }) {
        if (kind !== 'business') throw invalid('Quotes are only available for business customers');
        await this.party(kind, id);
        const name = (body.name ?? '').trim();
        if (!name) throw invalid('Quote name is required');
        const now = this.app.clock.now();
        const accounts = await this.app.accounts.listForParty(id);
        return this.quotes.insert({
            customerId: id,
            subscriptionId: body.subscriptionId,
            name,
            description: body.description,
            state: 'inProgress',
            quoteDate: now.toISOString(),
            validUntil: new Date(now.getTime() + 30 * 86_400_000).toISOString(),
            totalAmount: Number(body.totalAmount ?? 0),
            currency: accounts[0]?.accountBalance[0]?.amount.unit ?? 'USD',
        });
    }

    async setQuoteState(quoteId: string, state: Quote['state']) {
        const q = await this.quotes.require(quoteId);
        const allowed: Record<Quote['state'], Quote['state'][]> = {
            inProgress: ['pending', 'cancelled'],
            pending: ['approved', 'rejected', 'cancelled'],
            approved: ['accepted', 'cancelled'],
            accepted: [],
            cancelled: [],
            rejected: [],
        };
        if (!allowed[q.state].includes(state)) throw invalid(`A quote cannot go from ${q.state} to ${state}`);
        return this.quotes.replace({ ...q, state });
    }

    async bills(kind: CustomerKind, id: string) {
        await this.party(kind, id);
        const accounts = (await this.app.accounts.listForParty(id)).map((a) => a.id);
        return (await this.app.billing.listBills((b) => accounts.includes(b.billingAccount.id))).sort((a, b) => b.billDate.localeCompare(a.billDate));
    }

    async billPdf(billId: string) {
        const bill = await this.app.billing.getBill(billId);
        const m = (v: { value: number; unit: string }) => `${v.unit} ${v.value.toFixed(2)}`;
        const pdf = renderPdf([
            { text: 'LotusFlare', size: 20, bold: true },
            { text: `Bill ${bill.billNo}`, size: 14, bold: true, gap: 12 },
            { text: `Bill date: ${bill.billDate.slice(0, 10)}`, gap: 6 },
            { text: `Due date: ${(bill.paymentDueDate ?? '').slice(0, 10)}` },
            { text: `Billing account: ${bill.billingAccount.name ?? bill.billingAccount.id}` },
            { text: 'Item', bold: true, right: 'Amount', gap: 16 },
            ...bill.customerBillItems.map((i) => ({ text: String((i as unknown as { name?: string }).name ?? (i as unknown as { appliedBillingRateType?: string }).appliedBillingRateType ?? 'Charge'), right: m((i as unknown as { taxIncludedAmount: { value: number; unit: string } }).taxIncludedAmount) })),
            { text: 'Total (tax included)', bold: true, right: m(bill.taxIncludedAmount), gap: 8 },
            { text: 'Remaining', bold: true, right: m(bill.remainingAmount) },
            { text: `State: ${bill.state}`, gap: 16 },
        ]);
        return { filename: `${bill.billNo}.pdf`, pdf };
    }

    async payments(kind: CustomerKind, id: string) {
        await this.party(kind, id);
        const accounts = (await this.app.accounts.listForParty(id)).map((a) => a.id);
        return (await this.app.payments.list()).filter((p) => accounts.includes(p.account.id)).sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
    }

    async createPayment(kind: CustomerKind, id: string, body: { accountId?: string; amount?: number; description?: string; customerBillId?: string }) {
        await this.party(kind, id);
        const accounts = await this.app.accounts.listForParty(id);
        const account = accounts.find((a) => a.id === body.accountId);
        if (!account) throw invalid('Choose one of the customer\'s billing accounts');
        const amount = Number(body.amount);
        if (!Number.isFinite(amount) || amount <= 0) throw invalid('Amount must be greater than 0');
        const unit = account.accountBalance[0]?.amount.unit ?? 'USD';
        return this.app.payments.create({
            account: { id: account.id },
            totalAmount: { unit, value: amount },
            description: body.description || 'Payment taken by customer care',
            paymentMethod: { id: 'agent-card', name: 'Card (agent entered)' },
            customerBillId: body.customerBillId || undefined,
        });
    }

    /** Provisioning records: one service record per live product, as SOM would have created them. */
    async provisioning(kind: CustomerKind, id: string) {
        const portfolio = await this.portfolio(kind, id);
        const rows: Record<string, unknown>[] = [];
        const walk = (items: Record<string, unknown>[]) => {
            for (const p of items) {
                const rng = new Rng(`prov:${p.id}`);
                rows.push({
                    id: rng.uuid(),
                    productId: p.id,
                    productName: p.name,
                    serviceType: rng.pick(['CFS: Mobile voice', 'CFS: Mobile data', 'RFS: Cloud tenant', 'RFS: Security scan']),
                    state: p.status === 'active' ? 'active' : p.status === 'suspended' ? 'inactive' : p.status === 'terminated' ? 'terminated' : 'designed',
                    createdAt: p.startDate,
                });
                walk((p.children as Record<string, unknown>[]) ?? []);
            }
        };
        for (const s of portfolio) walk(s.children as Record<string, unknown>[]);
        return rows;
    }

    async offerings() {
        return (await this.app.catalog.listOfferings()).filter((o) => o.lifecycleStatus === 'active' || o.lifecycleStatus === 'launched').map((o) => ({ id: o.id, name: o.name, description: o.description }));
    }

    /** Demo customers for Customer 360 (AWS Cloud Pte Ltd with two products), created once. */
    async ensureSeeded(): Promise<void> {
        const { parties, catalog, accounts, ordering } = this.app;
        if ((await parties.listOrganizations()).some((o) => o.name === 'AWS Cloud Pte Ltd')) return;
        const plan = (await catalog.listOfferings()).find((o) => o.name === 'Unlimited Talk 10GB' && o.lifecycleStatus === 'active');
        const cycle = (await accounts.listCycleSpecifications())[0];
        const aws = await parties.createOrganization({
            name: 'AWS Cloud Pte Ltd',
            tradingName: 'AWS Cloud',
            isLegalEntity: true,
            isHeadOffice: true,
            organizationType: 'company',
            contactMedium: [
                { '@type': 'PhoneContactMedium', preferred: true, phoneNumber: '1234567890' },
                { '@type': 'EmailContactMedium', preferred: true, emailAddress: 'abhinav.aggarwal@lotusflare.com' },
                { '@type': 'GeographicAddressContactMedium', preferred: true, street1: '11 North Buona Vista Drive, #09-01', city: 'Singapore', postCode: '138589', country: 'SG' },
            ],
            creditProfile: [{ creditScore: 720, creditProfileDate: '2026-01-01', creditRiskRating: 2 }],
        });
        const meta = { segment: 'Small and Medium Companies', billingResponsiblePerson: 'Adrian Tan GlobeB2B-0323-112742', customerSignatoryPerson: 'Michelle Bautista GlobeB2B-0323-112743' };
        await this.app.store.collection<Organization & { c360?: unknown; c360Identification?: unknown }>('organization').replace({
            ...(await parties.getOrganization(aws.id)),
            c360: meta,
            c360Identification: [
                { type: 'Company registration (UEN)', value: '201912345K', issuedBy: 'ACRA' },
                { type: 'GST registration', value: 'M90371234X', issuedBy: 'IRAS' },
            ],
        });
        const account = await accounts.create({
            name: 'AWS Cloud Pte Ltd - Corporate',
            ratingType: 'postpaid',
            currency: 'INR',
            relatedParty: [{ role: 'customer', partyOrPartyRole: { id: aws.id, '@referredType': 'Organization' } }],
            creditLimit: { unit: 'INR', value: 500000 },
            billStructure: cycle ? { cycleSpecification: { id: cycle.id, name: cycle.name } } : undefined,
        });
        if (plan) {
            await ordering.create({
                relatedParty: [{ role: 'customer', partyOrPartyRole: { id: aws.id, '@referredType': 'Organization' } }],
                billingAccount: { id: account.id },
                channel: { id: 'customer-care', name: 'Customer care' },
                productOrderItem: [
                    { action: 'add', quantity: 1, productOffering: { id: plan.id }, product: { productTerm: [{ duration: { amount: 12, units: 'month' } }] } },
                    { action: 'add', quantity: 2, productOffering: { id: plan.id }, product: { productTerm: [{ duration: { amount: 12, units: 'month' } }] } },
                ],
            });
        }
    }
}
