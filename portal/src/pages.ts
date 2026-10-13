/** All screens of the console. Each page function loads what it needs and returns one element. */
import { act, api, date, dateTime, facts, field, form, go, h, link, money, page, partyName, select, table, tag, toast, track, words } from './ui.ts';

type Any = any;

const payable = (a: Any): Any => a.accountBalance.find((b: Any) => b.balanceType === 'payableBalance')?.amount;
const customerOf = (x: Any): Any => x.relatedParty?.find((rp: Any) => rp.role === 'customer')?.partyOrPartyRole;
const partyHash = (ref: Any): string => `#/customers/${ref?.['@referredType'] === 'Organization' ? 'organization' : 'individual'}/${ref?.id}`;
const totalOf = (prices: Any[] | undefined, type: string): Any => prices?.find((p: Any) => p.priceType === type)?.price?.taxIncludedAmount;

/* ---------- overview ---------- */

export async function overview(): Promise<HTMLElement> {
    const [orders, accounts, bills, products, events] = await Promise.all([
        api('/ordering/productOrder'),
        api('/billing/billingAccount'),
        api('/billing/customerBill'),
        api('/inventory/product'),
        api('/event?limit=25'),
    ]);
    const open = bills.filter((b: Any) => ['validated', 'sent', 'partiallySettled', 'overdue'].includes(b.state));
    const owedByUnit = new Map<string, number>();
    for (const b of open) owedByUnit.set(b.remainingAmount.unit, (owedByUnit.get(b.remainingAmount.unit) ?? 0) + b.remainingAmount.value);
    const owed = [...owedByUnit].map(([unit, value]) => money({ unit, value })).join(', ') || '0.00';
    return page(
        'Overview',
        'Where things stand across orders, service and billing.',
        h(
            'div',
            { class: 'panel' },
            h(
                'dl',
                { class: 'figures' },
                h('div', null, h('dt', null, 'Active products'), h('dd', null, products.filter((p: Any) => p.status === 'active').length)),
                h('div', null, h('dt', null, 'Orders needing attention'), h('dd', null, orders.filter((o: Any) => ['rejected', 'failed', 'draft'].includes(o.state)).length)),
                h('div', null, h('dt', null, 'Unpaid bills'), h('dd', null, open.length)),
                h('div', null, h('dt', null, 'Outstanding'), h('dd', { class: open.length ? 'owed' : '' }, owed)),
                h('div', null, h('dt', null, 'Accounts in dunning'), h('dd', null, accounts.filter((a: Any) => a.subscriberState && a.subscriberState !== 'active').length))
            )
        ),
        h('h2', null, 'Daily jobs'),
        h(
            'div',
            { class: 'panel' },
            h('p', { class: 'muted', style: 'margin-top:0' }, 'These normally run on a schedule. Run them here to move time-based billing forward.'),
            h(
                'div',
                { class: 'actions' },
                act('Rate recurring charges', async () => {
                    const r = await api('/billing/run/recurringCharges', 'POST', {});
                    toast(r.created.length ? `Rated ${r.created.length} recurring charge(s)` : 'No recurring charges were due');
                }),
                act('Run dunning', async () => {
                    const r = await api('/billing/run/dunning', 'POST', {});
                    toast(`${r.overdueBills} bill(s) became overdue, ${r.changed.length} account(s) changed state`);
                })
            )
        ),
        h('h2', null, 'Recent activity'),
        table(
            events as Any[],
            [
                { title: 'When', cell: (e) => dateTime(e.eventTime) },
                { title: 'Event', cell: (e) => words(e.eventType.replace(/Event$/, '')) },
                { title: 'Change', cell: (e) => (e.payload?.newState ? [tag(e.payload.previousState), ' to ', tag(e.payload.newState)] : '') },
            ],
            'Nothing has happened yet. Place an order to get started.'
        )
    );
}

/* ---------- customers ---------- */

export async function customers(): Promise<HTMLElement> {
    const [individuals, organizations] = await Promise.all([api('/party/individual'), api('/party/organization')]);
    const rows = [...individuals, ...organizations];
    return page(
        'Customers',
        'People and organizations you sell to.',
        table(
            rows as Any[],
            [
                { title: 'Name', cell: (p) => link(partyHash({ id: p.id, '@referredType': p['@type'] }), partyName(p)) },
                { title: 'Type', cell: (p) => (p['@type'] === 'Organization' ? words(p.organizationType ?? 'organization') : 'Individual') },
                { title: 'Status', cell: (p) => tag(p.status) },
                { title: 'Preferred contact', cell: (p) => { const c = p.contactMedium?.find((m: Any) => m.preferred); return c?.emailAddress ?? c?.phoneNumber ?? ''; } },
            ],
            'No customers yet. Add one below.'
        ),
        h('h2', null, 'Add a person'),
        h(
            'div',
            { class: 'panel' },
            form([field('Given name', 'givenName', { required: true }), field('Family name', 'familyName', { required: true }), field('Email', 'email', { type: 'email' })], 'Add person', async (v) => {
                await api('/party/individual', 'POST', {
                    givenName: v.givenName,
                    familyName: v.familyName,
                    contactMedium: v.email ? [{ '@type': 'EmailContactMedium', preferred: true, emailAddress: v.email }] : [],
                });
                return 'Person added';
            })
        ),
        h('h2', null, 'Add an organization'),
        h(
            'div',
            { class: 'panel' },
            form(
                [
                    field('Name', 'name', { required: true }),
                    select('Type', 'organizationType', [['company', 'Company'], ['department', 'Department']]),
                    select('Parent organization', 'parent', [['', 'None'], ...organizations.map((o: Any): [string, string] => [o.id, o.name])]),
                    h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'isLegalEntity' }), 'Legal entity'),
                ],
                'Add organization',
                async (v) => {
                    await api('/party/organization', 'POST', {
                        name: v.name,
                        organizationType: v.organizationType,
                        isLegalEntity: v.isLegalEntity === 'on',
                        organizationParentRelationship: v.parent ? { relationshipType: 'parent', organization: { id: v.parent } } : undefined,
                    });
                    return 'Organization added';
                }
            )
        )
    );
}

export async function customer(kind: string, id: string): Promise<HTMLElement> {
    const isOrg = kind === 'organization';
    const [p, accounts, orders] = await Promise.all([api(`/party/${kind}/${id}`), api('/billing/billingAccount'), api('/ordering/productOrder')]);
    const mine = accounts.filter((a: Any) => a.relatedParty.some((rp: Any) => rp.partyOrPartyRole.id === id));
    const myOrders = orders.filter((o: Any) => customerOf(o)?.id === id);
    const end = isOrg ? 'closed' : 'deceased';
    const next: Record<string, string[]> = { initialized: ['validated', end], validated: [end] };
    const setStatus = (status: string) => act(`Mark ${words(status).toLowerCase()}`, () => api(`/party/${kind}/${id}`, 'PATCH', { status }), `Customer is now ${words(status).toLowerCase()}`, status === end ? 'danger' : '');
    return page(
        partyName(p),
        isOrg ? 'Organization' : 'Individual',
        track(['initialized', 'validated', end], p.status, [end]),
        h('div', { class: 'actions' }, (next[p.status] ?? []).map(setStatus), link(`#/orders/new?customer=${id}`, h('span', { class: 'button primary' }, 'New order'))),
        h('h2', null, 'Contact'),
        table(p.contactMedium ?? [], [
            { title: 'Type', cell: (c: Any) => words(String(c['@type']).replace('ContactMedium', '')) },
            { title: 'Value', cell: (c: Any) => c.emailAddress ?? c.phoneNumber ?? '' },
            { title: 'Preferred', cell: (c: Any) => (c.preferred ? 'Yes' : '') },
        ], 'No contact details on file.'),
        h('h2', null, 'Billing accounts'),
        table(mine as Any[], [
            { title: 'Account', cell: (a) => link(`#/accounts/${a.id}`, a.name) },
            { title: 'Type', cell: (a) => words(a.ratingType) },
            { title: 'State', cell: (a) => tag(a.state) },
            { title: 'Balance', cell: (a) => money(payable(a)), num: true },
        ], 'No billing account yet. Open one under Billing before placing an order.'),
        h('h2', null, 'Orders'),
        orderTable(myOrders)
    );
}

/* ---------- catalog ---------- */

export async function catalog(): Promise<HTMLElement> {
    const offerings: Any[] = await api('/catalog/productOffering');
    const headline = (o: Any): string => {
        const base = (o.productOfferingPrice ?? []).filter((p: Any) => !p.popRelationship?.length && ['recurringCharge', 'oneTimeCharge'].includes(p.priceType));
        return base.map((p: Any) => `${money(p.price)}${p.recurringChargePeriodType ? ' ' + p.recurringChargePeriodType : ''}`).join(' + ');
    };
    return page(
        'Catalog',
        'What can be sold. Only active or launched offerings can be ordered.',
        table(offerings, [
            { title: 'Offering', cell: (o) => link(`#/catalog/${o.id}`, o.name) },
            { title: 'Status', cell: (o) => tag(o.lifecycleStatus) },
            { title: 'Price', cell: headline },
            { title: 'Prices defined', cell: (o) => (o.productOfferingPrice ?? []).length, num: true },
        ], 'The catalog is empty. Add an offering below.'),
        h('h2', null, 'Add an offering'),
        h(
            'div',
            { class: 'panel' },
            h('p', { class: 'muted', style: 'margin-top:0' }, 'Starts in draft. Leave a price empty to skip it.'),
            form(
                [
                    field('Name', 'name', { required: true }),
                    field('Currency', 'currency', { required: true, value: 'INR', maxLength: 3 }),
                    field('Recurring charge', 'rc', { type: 'number', min: 0, step: '0.01' }),
                    select('Charged', 'period', [['monthly', 'Monthly'], ['quarterly', 'Quarterly'], ['yearly', 'Yearly'], ['daily', 'Daily']]),
                    field('One-time charge', 'otc', { type: 'number', min: 0, step: '0.01' }),
                    field('Activation fee', 'fee', { type: 'number', min: 0, step: '0.01' }),
                    field('Price on a 12 month term', 'termPrice', { type: 'number', min: 0, step: '0.01' }),
                    field('Tax rate %', 'taxRate', { type: 'number', min: 0, step: '0.01', value: 18 }),
                    h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'taxIncluded' }), 'Prices include tax'),
                ],
                'Add offering',
                async (v) => {
                    const unit = v.currency!.toUpperCase();
                    const tableData: Any[] = [];
                    if (v.rc) tableData.push({ priceType: 'recurringCharge', price: { unit, value: Number(v.rc) } });
                    if (v.otc) tableData.push({ priceType: 'oneTimeCharge', price: { unit, value: Number(v.otc) } });
                    if (v.fee) tableData.push({ priceType: 'oneTimeFee', price: { unit, value: Number(v.fee) }, action: 'add' });
                    const tables: Any[] = [{ '@type': 'SimpleProductOfferingBasePriceTable', tableConfig: { isTaxIncluded: v.taxIncluded === 'on', recurringChargePeriodType: v.period, taxRate: Number(v.taxRate || 0) }, tableData }];
                    const term = { id: 'term-12m', name: '12 months', duration: { amount: 12, units: 'month' }, renewalAction: 'autoRenew' };
                    const withTerm = !!(v.rc && v.termPrice);
                    if (withTerm) {
                        tables.push({
                            '@type': 'SimpleProductOfferingComplexPriceTable',
                            tableConfig: { priceRelationshipType: 'overrides', priceAdjustmentType: 'fixed', tableRows: [{ priceTableHeaderItems: [{ categoryName: 'Terms', categoryValues: [term] }] }] },
                            tableData: [{ priceType: 'recurringCharge', currency: unit, rowIndex: 0, colIndex: -1, alterationAmount: Number(v.termPrice) }],
                        });
                    }
                    const created = await api('/catalog/productOffering', 'POST', {
                        name: v.name,
                        productOfferingTerm: withTerm ? [term] : undefined,
                        earlyTerminationFee: withTerm ? { currency: unit } : undefined,
                        productOfferingPriceTable: tables,
                    });
                    go(`#/catalog/${created.id}`);
                    return 'Offering added as a draft';
                }
            )
        )
    );
}

export async function offering(id: string): Promise<HTMLElement> {
    const o = await api(`/catalog/productOffering/${id}`);
    const next: Record<string, string[]> = { inDraft: ['active', 'retired'], active: ['launched', 'retired', 'obsolete'], launched: ['retired'] };
    const describe = (p: Any): string => {
        if (p.pricingLogicAlgorithm?.length) return 'Rest of the term';
        if (p.isPercentage) return p.isRange ? `${p.lowerPercentageLimit}% to ${p.upperPercentageLimit}%` : `${p.percentage}%`;
        return money(p.price);
    };
    const kind = (p: Any): string => {
        const rel = p.popRelationship?.[0]?.relationshipType;
        if (rel === 'overrides') return `${words(p.priceType)} (replaces base)`;
        return words(p.priceType);
    };
    return page(
        o.name,
        o.description ?? null,
        track(['inDraft', 'active', 'launched', 'retired'], o.lifecycleStatus, ['retired', 'obsolete']),
        h(
            'div',
            { class: 'actions' },
            (next[o.lifecycleStatus] ?? []).map((s) => act(s === 'active' ? 'Activate' : s === 'launched' ? 'Launch' : words(s) === 'Retired' ? 'Retire' : 'Mark obsolete', () => api(`/catalog/productOffering/${id}`, 'PATCH', { lifecycleStatus: s }), `Offering is now ${words(s).toLowerCase()}`, s === 'retired' || s === 'obsolete' ? 'danger' : 'primary')),
            o.lifecycleStatus === 'retired' ? act('Delete', async () => { await api(`/catalog/productOffering/${id}`, 'DELETE'); go('#/catalog'); }, 'Offering deleted', 'danger') : null
        ),
        h('h2', null, 'Prices'),
        table(o.productOfferingPrice ?? [], [
            { title: 'Price', cell: (p: Any) => p.name },
            { title: 'Kind', cell: kind },
            { title: 'Amount', cell: describe, num: true },
            { title: 'Applies when', cell: (p: Any) => [p.lowerOrderQuantity ? `quantity from ${p.lowerOrderQuantity}${p.upperOrderQuantity ? ' to ' + p.upperOrderQuantity : ''}` : '', p.productOfferingTerm?.length ? `term ${p.productOfferingTerm.map((t: Any) => `${t.duration.amount} ${t.duration.units}`).join(', ')}` : '', p.allowedAction?.length ? `on ${p.allowedAction.map((a: Any) => a.action).join(', ')}` : ''].filter(Boolean).join('; ') || 'Always' },
            { title: 'Tax', cell: (p: Any) => (p.taxRate !== undefined ? `${p.taxRate}% ${p.isTaxIncluded ? 'included' : 'added'}` : '') },
        ], 'This offering has no prices.'),
        o.productOfferingTerm?.length ? [h('h2', null, 'Terms'), table(o.productOfferingTerm, [{ title: 'Term', cell: (t: Any) => t.name ?? `${t.duration.amount} ${t.duration.units}` }, { title: 'At the end', cell: (t: Any) => words(t.renewalAction ?? 'none') }], '')] : null
    );
}

/* ---------- orders ---------- */

const ORDER_PATH = ['acknowledged', 'queued', 'inProgress', 'completed'];

function orderTable(orders: Any[]): HTMLElement {
    return table(orders, [
        { title: 'Order', cell: (o) => link(`#/orders/${o.id}`, o.id.slice(0, 8)) },
        { title: 'Placed', cell: (o) => dateTime(o.orderDate) },
        { title: 'Customer', cell: (o) => customerOf(o)?.name ?? '' },
        { title: 'Lines', cell: (o) => o.productOrderItem.map((i: Any) => `${words(i.action)} ${i.quantity} x ${i.product?.name ?? ''}`).join(', ') },
        { title: 'State', cell: (o) => tag(o.state) },
    ], 'No orders yet.');
}

export async function orders(): Promise<HTMLElement> {
    const list = await api('/ordering/productOrder');
    return h('div', null, h('div', { class: 'head' }, h('div', null, h('h1', null, 'Orders'), h('p', { class: 'lede' }, 'Every order, newest first.')), link('#/orders/new', h('span', { class: 'button primary' }, 'New order'))), orderTable(list));
}

export async function order(id: string): Promise<HTMLElement> {
    const [o, sagas] = await Promise.all([api(`/ordering/productOrder/${id}`), api('/sagaExecution')]);
    const saga = sagas.find((s: Any) => s.ref === id);
    const cust = customerOf(o);
    return page(
        `Order ${id.slice(0, 8)}`,
        null,
        track(o.state === 'draft' ? ['draft', ...ORDER_PATH] : ORDER_PATH, o.state, ['rejected', 'failed', 'cancelled']),
        o.stateReason?.length ? h('div', { class: 'notice stop' }, `This order was ${o.state}.`, h('ul', null, o.stateReason.map((r: Any) => h('li', null, r.label)))) : null,
        h(
            'div',
            { class: 'actions' },
            o.state === 'draft' ? act('Place order', () => api(`/ordering/productOrder/${id}/submit`, 'POST', {}), 'Order placed', 'primary') : null,
            ['draft', 'acknowledged', 'queued', 'pending', 'held'].includes(o.state) ? act('Cancel order', () => api(`/ordering/productOrder/${id}/cancel`, 'POST', {}), 'Order cancelled', 'danger') : null
        ),
        h('div', { class: 'panel', style: 'margin-top:1rem' }, facts([
            ['Customer', cust ? link(partyHash(cust), cust.name ?? cust.id) : ''],
            ['Billing account', o.billingAccount ? link(`#/accounts/${o.billingAccount.id}`, o.billingAccount.name ?? o.billingAccount.id) : ''],
            ['Placed', dateTime(o.orderDate)],
            ['Completed', dateTime(o.completionDate)],
            ['Paid on delivery', o.deficitAmount?.value ? money(o.deficitAmount) : ''],
        ])),
        h('h2', null, 'Lines'),
        table(o.productOrderItem, [
            { title: 'Line', cell: (i: Any) => i.id },
            { title: 'Action', cell: (i: Any) => words(i.action) },
            { title: 'Product', cell: (i: Any) => i.product?.name ?? '' },
            { title: 'Quantity', cell: (i: Any) => i.quantity, num: true },
            { title: 'Recurring', cell: (i: Any) => money(totalOf(i.itemTotalPrice, 'recurringCharge')), num: true },
            { title: 'One-time', cell: (i: Any) => money(totalOf(i.itemTotalPrice, 'oneTimeCharge')), num: true },
            { title: 'Fees', cell: (i: Any) => money(totalOf(i.itemTotalPrice, 'oneTimeFee')), num: true },
            { title: 'State', cell: (i: Any) => tag(i.state) },
        ], ''),
        h('p', { class: 'muted small' }, 'Amounts include tax.'),
        saga ? [h('h2', null, 'Delivery steps'), table(saga.steps, [{ title: 'Step', cell: (s: Any) => words(s.name.replace('rollback:', 'undo ').replace(/_/g, ' ')) }, { title: 'Result', cell: (s: Any) => tag(s.status === 'done' ? 'completed' : s.status === 'compensated' ? 'cancelled' : 'failed') }, { title: 'Detail', cell: (s: Any) => s.error ?? '' }], '')] : null
    );
}

export async function newOrder(query: URLSearchParams): Promise<HTMLElement> {
    const [individuals, organizations, accounts, offerings, products] = await Promise.all([
        api('/party/individual'), api('/party/organization'), api('/billing/billingAccount'), api('/catalog/productOffering'), api('/inventory/product'),
    ]);
    const parties: Any[] = [...individuals, ...organizations];
    const sellable: Any[] = offerings.filter((o: Any) => ['active', 'launched'].includes(o.lifecycleStatus));
    let customerId = query.get('customer') ?? parties[0]?.id ?? '';
    const result = h('div', { 'aria-live': 'polite' });
    const accountSelect = h('select', { name: 'account' }) as HTMLSelectElement;
    const existingSelect = h('select', { name: 'existing' }) as HTMLSelectElement;
    const customerSelect = h('select', { name: 'customer' }, parties.map((p) => h('option', { value: p.id, selected: p.id === customerId }, partyName(p)))) as HTMLSelectElement;
    const actionSelect = h('select', { name: 'action' }, h('option', { value: 'add' }, 'Add a product'), h('option', { value: 'modify' }, 'Change quantity'), h('option', { value: 'delete' }, 'Remove a product')) as HTMLSelectElement;
    const offeringSelect = h('select', { name: 'offering' }, sellable.map((o) => h('option', { value: o.id }, o.name))) as HTMLSelectElement;
    const quantity = h('input', { name: 'quantity', type: 'number', min: 1, step: 1, value: 1 }) as HTMLInputElement;
    const termBox = h('input', { type: 'checkbox', name: 'term' }) as HTMLInputElement;
    const termLabel = h('label', { class: 'check' }, termBox, h('span', null, 'Commit to the term'));
    const method = h('input', { name: 'paymentMethod', placeholder: 'e.g. card-1' }) as HTMLInputElement;
    const offeringLabel = h('label', null, 'Offering', offeringSelect);
    const existingLabel = h('label', null, 'Product', existingSelect);
    const quantityLabel = h('label', null, 'Quantity', quantity);

    const sync = (): void => {
        customerId = customerSelect.value;
        const mine = accounts.filter((a: Any) => a.state !== 'closed' && a.relatedParty.some((rp: Any) => rp.partyOrPartyRole.id === customerId));
        accountSelect.replaceChildren(...mine.map((a: Any) => h('option', { value: a.id }, `${a.name} (${a.ratingType})`)));
        const live = products.filter((p: Any) => p.billingAccount?.id === accountSelect.value && ['active', 'suspended'].includes(p.status));
        existingSelect.replaceChildren(...live.map((p: Any) => h('option', { value: p.id }, `${p.name} x ${p.quantity}`)));
        const adding = actionSelect.value === 'add';
        offeringLabel.hidden = !adding;
        existingLabel.hidden = adding;
        quantityLabel.hidden = actionSelect.value === 'delete';
        const term = sellable.find((o) => o.id === offeringSelect.value)?.productOfferingTerm?.[0];
        termLabel.hidden = !adding || !term;
        if (term) termLabel.querySelector('span')!.textContent = `Commit to ${term.name ?? `${term.duration.amount} ${term.duration.units}`}`;
        result.replaceChildren();
    };
    const build = (): Any => {
        const party = parties.find((p) => p.id === customerSelect.value);
        const action = actionSelect.value;
        const off = sellable.find((o) => o.id === offeringSelect.value);
        const item: Any = { action };
        if (action === 'add') {
            item.productOffering = { id: offeringSelect.value };
            item.quantity = Number(quantity.value);
            if (termBox.checked && !termLabel.hidden) item.product = { productTerm: [{ duration: off.productOfferingTerm[0].duration }] };
        } else {
            item.product = { id: existingSelect.value };
            if (action === 'modify') item.quantity = Number(quantity.value);
        }
        return {
            relatedParty: party ? [{ role: 'customer', partyOrPartyRole: { id: party.id, name: partyName(party), '@referredType': party['@type'] } }] : [],
            billingAccount: accountSelect.value ? { id: accountSelect.value } : undefined,
            currency: accountSelect.value ? undefined : 'INR',
            paymentMethod: method.value.trim() ? { id: method.value.trim() } : undefined,
            productOrderItem: [item],
        };
    };
    const showPreview = async (): Promise<void> => {
        try {
            const p = await api('/ordering/productOrder/preview', 'POST', build());
            const totals: Any[] = p.order.orderTotalPrice ?? [];
            result.replaceChildren(
                h('h2', null, 'Price'),
                table(totals, [
                    { title: 'Charge', cell: (t: Any) => `${words(t.priceType)}${t.recurringChargePeriod ? ', ' + t.recurringChargePeriod : ''}` },
                    { title: 'Before tax', cell: (t: Any) => money(t.price.dutyFreeAmount), num: true },
                    { title: 'With tax', cell: (t: Any) => money(t.price.taxIncludedAmount), num: true },
                ], 'This order has no charges.'),
                h('p', null, `Due on delivery: ${money({ unit: p.order.currency, value: p.upfrontAmount })}`, h('span', { class: 'muted' }, ' (postpaid accounts pay this on their next bill)')),
                p.stateReason.length ? h('div', { class: 'notice stop' }, 'This order would be rejected.', h('ul', null, p.stateReason.map((r: Any) => h('li', null, r.label)))) : ''
            );
        } catch (e) {
            toast((e as Error).message, true);
        }
    };
    for (const el of [customerSelect, accountSelect, actionSelect, offeringSelect]) el.addEventListener('change', sync);
    sync();

    return page(
        'New order',
        'Pick the customer and what changes. Check the price before placing the order.',
        !parties.length ? h('div', { class: 'notice' }, 'Add a customer first.') : null,
        h(
            'div',
            { class: 'panel' },
            h(
                'div',
                { class: 'grid', style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(13rem,1fr));gap:.75rem 1rem;align-items:end' },
                h('label', null, 'Customer', customerSelect),
                h('label', null, 'Billing account', accountSelect),
                h('label', null, 'What to do', actionSelect),
                offeringLabel,
                existingLabel,
                quantityLabel,
                termLabel,
                h('label', null, 'Payment method (prepaid)', method)
            ),
            h(
                'div',
                { class: 'actions', style: 'margin-top:1rem' },
                h('button', { type: 'button', onclick: showPreview }, 'Check price'),
                act('Place order', async () => {
                    const o = await api('/ordering/productOrder', 'POST', build());
                    toast(o.state === 'completed' ? 'Order placed and delivered' : `Order ${o.state}`, o.state !== 'completed');
                    go(`#/orders/${o.id}`);
                }, undefined, 'primary')
            )
        ),
        result
    );
}

/* ---------- billing ---------- */

export async function accounts(): Promise<HTMLElement> {
    const [list, individuals, organizations, specs] = await Promise.all([api('/billing/billingAccount'), api('/party/individual'), api('/party/organization'), api('/billing/billingCycleSpecification')]);
    const parties: Any[] = [...individuals, ...organizations];
    return page(
        'Billing',
        'Accounts, what they owe and their bills.',
        table(list as Any[], [
            { title: 'Account', cell: (a) => link(`#/accounts/${a.id}`, a.name) },
            { title: 'Customer', cell: (a) => customerOf(a)?.name ?? '' },
            { title: 'Type', cell: (a) => words(a.ratingType) },
            { title: 'State', cell: (a) => tag(a.state) },
            { title: 'Service', cell: (a) => tag(a.subscriberState) },
            { title: 'Balance', cell: (a) => money(payable(a)), num: true },
            { title: 'Unpaid bills', cell: (a) => money(a.unsettledBillsAmount), num: true },
        ], 'No billing accounts yet.'),
        h('h2', null, 'Open an account'),
        h(
            'div',
            { class: 'panel' },
            form(
                [
                    field('Account name', 'name', { required: true }),
                    select('Customer', 'party', parties.map((p): [string, string] => [p.id, partyName(p)])),
                    select('Type', 'ratingType', [['postpaid', 'Postpaid (billed each cycle)'], ['prepaid', 'Prepaid (pays on delivery)']]),
                    field('Currency', 'currency', { required: true, value: 'INR', maxLength: 3 }),
                    select('Bill cycle', 'spec', [['', 'None'], ...specs.map((s: Any): [string, string] => [s.id, s.name])]),
                    field('Credit limit', 'creditLimit', { type: 'number', min: 0, step: '0.01' }),
                ],
                'Open account',
                async (v) => {
                    const unit = v.currency!.toUpperCase();
                    await api('/billing/billingAccount', 'POST', {
                        name: v.name,
                        ratingType: v.ratingType,
                        currency: unit,
                        relatedParty: [{ role: 'customer', partyOrPartyRole: { id: v.party } }],
                        creditLimit: v.creditLimit ? { unit, value: Number(v.creditLimit) } : undefined,
                        billStructure: v.spec ? { cycleSpecification: { id: v.spec } } : undefined,
                    });
                    return 'Account opened';
                }
            )
        )
    );
}

export async function account(id: string): Promise<HTMLElement> {
    const [a, products, acbrs, bills, transactions] = await Promise.all([
        api(`/billing/billingAccount/${id}`),
        api(`/inventory/product?billingAccountId=${id}`),
        api(`/billing/appliedCustomerBillingRate?billingAccountId=${id}`),
        api(`/billing/customerBill?billingAccountId=${id}`),
        api(`/billing/billingAccount/${id}/transaction`),
    ]);
    const bal = payable(a);
    const unbilled = acbrs.filter((x: Any) => !x.isBilled && x.status === 'active');
    const credit = (x: Any): boolean => /Credit|Rebate|Discount|Replacement/.test(x.appliedBillingRateType);
    const cust = customerOf(a);
    return page(
        a.name,
        `${words(a.ratingType)} account${cust ? ' for ' + (cust.name ?? '') : ''}`,
        track(['created', 'active', 'closed'], a.state, ['suspended', 'closed']),
        h(
            'div',
            { class: 'actions' },
            a.state === 'created' && a.billStructure?.cycleSpecification ? act('Activate', () => api(`/billing/billingAccount/${id}/activate`, 'POST', {}), 'Account activated', 'primary') : null,
            a.state !== 'closed' ? act('Close account', () => api(`/billing/billingAccount/${id}/close`, 'POST', {}), 'Account closed', 'danger') : null,
            a.state !== 'closed' ? link(`#/orders/new?customer=${cust?.id ?? ''}`, h('span', { class: 'button' }, 'New order')) : null
        ),
        h(
            'div',
            { class: 'panel', style: 'margin-top:1rem' },
            h(
                'dl',
                { class: 'figures' },
                h('div', null, h('dt', null, bal.value < 0 ? 'Owes' : 'Credit'), h('dd', { class: bal.value < 0 ? 'owed' : '' }, money({ unit: bal.unit, value: Math.abs(bal.value) }))),
                h('div', null, h('dt', null, 'Unpaid bills'), h('dd', null, money(a.unsettledBillsAmount))),
                a.creditLimit ? h('div', null, h('dt', null, 'Credit limit'), h('dd', null, money(a.creditLimit))) : null,
                h('div', null, h('dt', null, 'Service'), h('dd', null, words(a.subscriberState ?? 'active')))
            )
        ),
        a.subscriberState && a.subscriberState !== 'active' ? h('div', { class: 'notice' }, `Unpaid bills have moved this account to "${words(a.subscriberState).toLowerCase()}". Paying the overdue bills restores service.`) : null,

        h('h2', null, 'Record a payment'),
        h('div', { class: 'panel' }, form([field('Amount', 'amount', { type: 'number', min: 0.01, step: '0.01', required: true }), field('Payment method', 'method', { placeholder: 'e.g. bank transfer' })], 'Record payment', async (v) => {
            const p = await api('/payment/payment', 'POST', { account: { id }, totalAmount: { unit: bal.unit, value: Number(v.amount) }, paymentMethod: v.method ? { id: v.method } : undefined });
            const n = p.paymentItem.length;
            return n ? `Payment recorded and applied to ${n} bill(s)` : 'Payment recorded as credit on the account';
        })),

        h('div', { class: 'head' }, h('h2', null, 'Charges not yet billed'), h('div', { style: 'margin-top:2rem' }, unbilled.length && a.state !== 'closed' ? act('Create bill', () => api(`/billing/billingAccount/${id}/calculateBill`, 'POST', { approve: true }), 'Bill created', 'primary') : null)),
        table(unbilled as Any[], [
            { title: 'Charge', cell: (x) => x.name },
            { title: 'Period', cell: (x) => (x.periodCoverage ? `${date(x.periodCoverage.startDateTime)} to ${date(x.periodCoverage.endDateTime)}` : date(x.date)) },
            { title: 'Before tax', cell: (x) => money(x.taxExcludedAmount), num: true },
            { title: 'With tax', cell: (x) => (credit(x) ? '-' : '') + money(x.taxIncludedAmount), num: true },
        ], 'Everything has been billed.'),

        h('h2', null, 'Bills'),
        table([...bills].reverse() as Any[], [
            { title: 'Bill', cell: (b) => link(`#/bills/${b.id}`, b.billNo) },
            { title: 'Date', cell: (b) => date(b.billDate) },
            { title: 'Due', cell: (b) => date(b.paymentDueDate) },
            { title: 'Amount', cell: (b) => money(b.taxIncludedAmount), num: true },
            { title: 'Left to pay', cell: (b) => money(b.remainingAmount), num: true },
            { title: 'State', cell: (b) => tag(b.state) },
        ], 'No bills yet.'),

        h('h2', null, 'Products'),
        table(products as Any[], [
            { title: 'Product', cell: (p) => p.name },
            { title: 'Quantity', cell: (p) => p.quantity, num: true },
            { title: 'Status', cell: (p) => tag(p.status) },
            { title: 'Since', cell: (p) => date(p.startDate) },
            { title: 'Term ends', cell: (p) => date(p.productTerm?.[0]?.validFor?.endDateTime) },
            { title: '', cell: (p) => (p.status === 'active' ? act('Suspend', () => api(`/inventory/product/${p.id}/suspend`, 'POST', { reason: 'manual' }), 'Product suspended') : p.status === 'suspended' ? act('Resume', () => api(`/inventory/product/${p.id}/activate`, 'POST', {}), 'Product resumed') : '') },
        ], 'No products on this account.'),

        h('h2', null, 'Balance history'),
        table([...transactions].reverse() as Any[], [
            { title: 'When', cell: (t) => dateTime(t.created) },
            { title: 'What', cell: (t) => words(t.transactionType.replace('Transaction', '')) },
            { title: 'Reference', cell: (t) => t.reference ?? '' },
            { title: 'Amount', cell: (t) => money(t.amount), num: true },
            { title: 'Balance after', cell: (t) => money(t.balanceAfter), num: true },
        ], 'No balance movements yet.')
    );
}

export async function bill(id: string): Promise<HTMLElement> {
    const b = await api(`/billing/customerBill/${id}`);
    const credit = (x: Any): boolean => /Credit|Rebate|Discount|Replacement/.test(x.customerBillItemType);
    const path = b.state === 'overdue' ? ['new', 'validated', 'overdue', 'settled'] : ['new', 'validated', 'partiallySettled', 'settled'];
    return page(
        `Bill ${b.billNo}`,
        null,
        track(path, b.state, ['overdue', 'cancelled']),
        h(
            'div',
            { class: 'actions' },
            b.state === 'new' ? act('Approve bill', () => api(`/billing/customerBill/${id}/approve`, 'POST', {}), 'Bill approved', 'primary') : null,
            ['new', 'validated', 'overdue'].includes(b.state) && !b.appliedPayment.length ? act('Cancel bill', () => api(`/billing/customerBill/${id}/cancel`, 'POST', {}), 'Bill cancelled', 'danger') : null
        ),
        h('div', { class: 'panel', style: 'margin-top:1rem' }, facts([
            ['Account', link(`#/accounts/${b.billingAccount.id}`, b.billingAccount.name)],
            ['Bill date', date(b.billDate)],
            ['Payment due', date(b.paymentDueDate)],
            ['Period', b.billingPeriod ? `${date(b.billingPeriod.startDateTime)} to ${date(b.billingPeriod.endDateTime)}` : ''],
            ['Balance before this bill', money(b.previousAmountDue)],
            ['This bill, before tax', money(b.taxExcludedAmount)],
            ['This bill, with tax', money(b.taxIncludedAmount)],
            ['Left to pay on this bill', money(b.remainingAmount)],
            ['Total owed on the account', money(b.amountDue)],
        ])),
        h('h2', null, 'Lines'),
        table(b.customerBillItems, [
            { title: 'Line', cell: (i: Any) => i.name },
            { title: 'Period', cell: (i: Any) => (i.periodCoverage ? `${date(i.periodCoverage.startDateTime)} to ${date(i.periodCoverage.endDateTime)}` : '') },
            { title: 'Before tax', cell: (i: Any) => (credit(i) ? '-' : '') + money(i.taxExcludedAmount), num: true },
            { title: 'Tax', cell: (i: Any) => (credit(i) ? '-' : '') + money(i.taxAmount), num: true },
            { title: 'With tax', cell: (i: Any) => (credit(i) ? '-' : '') + money(i.taxIncludedAmount), num: true },
        ], ''),
        h('h2', null, 'Payments applied'),
        table(b.appliedPayment, [{ title: 'Payment', cell: (p: Any) => p.payment.id.slice(0, 8) }, { title: 'Amount', cell: (p: Any) => money(p.appliedAmount), num: true }], 'No payment has been applied to this bill.')
    );
}

export async function payments(): Promise<HTMLElement> {
    const [list, accountsList] = await Promise.all([api('/payment/payment'), api('/billing/billingAccount')]);
    const name = (id: string): string => accountsList.find((a: Any) => a.id === id)?.name ?? id;
    return page(
        'Payments',
        'Money received. Record a payment from the account it belongs to.',
        table(list as Any[], [
            { title: 'Payment', cell: (p) => p.id.slice(0, 8) },
            { title: 'Date', cell: (p) => dateTime(p.paymentDate) },
            { title: 'Account', cell: (p) => link(`#/accounts/${p.account.id}`, name(p.account.id)) },
            { title: 'Amount', cell: (p) => money(p.totalAmount), num: true },
            { title: 'Not applied to a bill', cell: (p) => (p.status === 'approved' ? money(p.unmatchedAmount) : ''), num: true },
            { title: 'Status', cell: (p) => tag(p.status) },
            { title: '', cell: (p) => (p.status === 'approved' ? act('Cancel payment', () => api(`/payment/payment/${p.id}/cancel`, 'POST', {}), 'Payment cancelled', 'danger') : p.status === 'pending' ? act('Approve', () => api(`/payment/payment/${p.id}/status`, 'POST', { status: 'approved' }), 'Payment approved') : '') },
        ], 'No payments recorded yet.')
    );
}
