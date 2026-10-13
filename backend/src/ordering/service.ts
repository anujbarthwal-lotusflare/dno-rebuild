/**
 * Product ordering (TMF622): capture, validation, and delivery of product orders.
 *
 * Ported from ts-polaris:
 *  - productOrderCaptureAndValidation: draft vs acknowledged handling in
 *    ProductOrderingService.create, enrichment before persistence, and the
 *    validators (StateValidator, RelatedPartyValidator, BillingAccountValidator
 *    credit-limit rule, QuantityRangeValidator, TermConsistencyValidator, PriceComparator)
 *  - the step sequence of the orchestration plans `place_order.json`,
 *    `fulfilment_execution_v2.json` and `product_order_item_fulfilment.json`,
 *    including "rejected before fulfilment starts, failed after" and rollback
 * Reconstructed: the bodies of the plan steps (the original implements them as
 * calls between a dozen services), service-order decomposition towards the
 * network (SOM/OSS) is out of scope for this slice.
 */
import type { Collection, Store } from '../common/store.ts';
import type { Clock, EventBus, OperatorConfig, SagaRunner, SagaStep } from '../common/runtime.ts';
import { Dec, roundMoney } from '../common/decimal.ts';
import { DomainError, invalid, notAllowed } from '../common/errors.ts';
import type {
    Acbr,
    BillingAccount,
    Characteristic,
    CustomerBill,
    ItemAction,
    OrderPrice,
    Payment,
    Product,
    ProductOffering,
    ProductOrder,
    ProductOrderItem,
    ProductPrice,
    ProductTerm,
    Ref,
    RelatedParty,
    StateReason,
} from '../common/model.ts';
import type { PartyService } from '../party/service.ts';
import { ORDERABLE } from '../catalog/service.ts';
import type { CatalogService } from '../catalog/service.ts';
import { currencyOf, payableBalanceOf } from '../billing/accountService.ts';
import type { BillingAccountService } from '../billing/accountService.ts';
import type { BillingService } from '../billing/billingService.ts';
import { LIVE, resolveBundleDeactivation } from '../inventory/service.ts';
import type { InventoryService } from '../inventory/service.ts';
import type { PaymentService } from '../payment/service.ts';
import { buildProductPrices, calculateOneTimeFee, chargeAmount, sumTotals, totalsFor } from '../pricing/pricing.ts';
import type { BuildPriceItem, OneTimeFeeResult } from '../pricing/pricing.ts';
import { splitTax } from '../tax/tax.ts';

const reason = (code: string, label: string): StateReason => ({ code, label });

export interface CreateOrderItem {
    id?: string;
    action: ItemAction;
    quantity?: number;
    productOffering?: Ref;
    product?: {
        id?: string;
        name?: string;
        productCharacteristic?: Characteristic[];
        productTerm?: ProductTerm[];
        productPrice?: ProductPrice[];
    };
    /** On a bundle item: its child items, `{ id: childItemId, relationshipType: 'bundles' }`. */
    productOrderItemRelationship?: { id: string; relationshipType: string }[];
}
export interface CreateOrder {
    state?: 'draft' | 'acknowledged';
    category?: string;
    description?: string;
    currency?: string;
    relatedParty: RelatedParty[];
    billingAccount?: Ref;
    paymentMethod?: Ref;
    channel?: Ref;
    productOrderItem: CreateOrderItem[];
}

/** Everything the validators and the saga need about one order item, resolved once. */
interface ItemContext {
    item: ProductOrderItem;
    offering?: ProductOffering;
    existing?: Product;
    parentItemId?: string;
    calculatedPrice: ProductPrice[];
    fee: OneTimeFeeResult;
    suppliedPrice?: ProductPrice[];
}

interface PlaceContext {
    order: ProductOrder;
    account?: BillingAccount;
    items: ItemContext[];
    fulfilmentStarted: boolean;
    reservation?: Payment;
    created: Map<string, Product>; // item id -> product
    snapshots: Product[]; // products as they were before modify/delete
    acbrs: Acbr[];
    bill?: CustomerBill;
    upfront: number;
}

const BUNDLE_REL = ['bundles', 'isBundleOf'];
const numEq = (a: number, b: number): boolean => (Number.isNaN(a) && Number.isNaN(b)) || a === b;

/** PriceComparator.diffPrices: prices sent on the order must equal what the catalog yields. */
export function diffPrices(fromOrder: ProductPrice[], calculated: ProductPrice[]): StateReason[] {
    const out: StateReason[] = [];
    const match = (o: ProductPrice, c: ProductPrice): boolean => {
        const ov = Number(o.price?.dutyFreeAmount?.value ?? NaN);
        const cv = Number(c.price?.dutyFreeAmount?.value ?? NaN);
        if (Number.isNaN(ov) || Number.isNaN(cv)) return false;
        if (c.isRange) {
            return ov >= Number(c.lowerValueLimit ?? Number.MIN_SAFE_INTEGER) && ov <= Number(c.upperValueLimit ?? Number.MAX_SAFE_INTEGER);
        }
        return ov === cv;
    };
    for (const o of fromOrder) {
        const c = calculated.find((x) => x.productOfferingPrice?.id === o.productOfferingPrice?.id);
        if (!c) {
            out.push(reason('noMatchingPrice', 'A price on the order does not exist for this configuration'));
            continue;
        }
        if (!match(o, c)) out.push(reason('productPriceMismatch', `Price ${o.name ?? ''} does not match the catalog`));
        for (const oa of o.priceAlteration ?? []) {
            const ca = c.priceAlteration?.find((x) => x.productOfferingPrice?.id === oa.productOfferingPrice?.id);
            if (!ca) {
                out.push(reason('invalidOrMissingPriceAlteration', `Price alteration ${oa.productOfferingPrice?.id} is not valid`));
            } else if (
                !numEq(Number(oa.price?.dutyFreeAmount?.value ?? NaN), Number(ca.price?.dutyFreeAmount?.value ?? NaN)) ||
                !numEq(Number(oa.price?.percentage ?? NaN), Number(ca.price?.percentage ?? NaN)) ||
                !!oa.isPercentage !== !!ca.isPercentage
            ) {
                out.push(reason('alterationPriceMismatch', 'A price alteration does not match the catalog'));
            }
        }
    }
    for (const c of calculated) {
        const o = fromOrder.find((x) => x.productOfferingPrice?.id === c.productOfferingPrice?.id);
        if (!o) {
            out.push(reason('completenessMissingPrice', `Price ${c.name ?? c.productOfferingPrice?.id} is missing from the order`));
            continue;
        }
        for (const ca of c.priceAlteration ?? []) {
            if (!o.priceAlteration?.some((x) => x.productOfferingPrice?.id === ca.productOfferingPrice?.id)) {
                out.push(reason('completenessInvalidOrMissingPriceAlteration', `Price alteration ${ca.name ?? ''} is missing from the order`));
            }
        }
    }
    return out;
}

export class OrderingService {
    private readonly orders: Collection<ProductOrder>;
    private readonly locks = new Set<string>();
    private readonly parties: PartyService;
    private readonly catalog: CatalogService;
    private readonly accounts: BillingAccountService;
    private readonly inventory: InventoryService;
    private readonly billing: BillingService;
    private readonly payments: PaymentService;
    private readonly sagas: SagaRunner;
    private readonly events: EventBus;
    private readonly clock: Clock;
    private readonly config: OperatorConfig;
    /** Test hook: throw from inside a named saga step to exercise rollback. */
    failAtStep?: string;

    constructor(deps: {
        store: Store;
        parties: PartyService;
        catalog: CatalogService;
        accounts: BillingAccountService;
        inventory: InventoryService;
        billing: BillingService;
        payments: PaymentService;
        sagas: SagaRunner;
        events: EventBus;
        clock: Clock;
        config: OperatorConfig;
    }) {
        this.orders = deps.store.collection<ProductOrder>('productOrder', 'ProductOrder');
        this.parties = deps.parties;
        this.catalog = deps.catalog;
        this.accounts = deps.accounts;
        this.inventory = deps.inventory;
        this.billing = deps.billing;
        this.payments = deps.payments;
        this.sagas = deps.sagas;
        this.events = deps.events;
        this.clock = deps.clock;
        this.config = deps.config;
    }

    list(): Promise<ProductOrder[]> {
        return this.orders.list();
    }
    get(id: string): Promise<ProductOrder> {
        return this.orders.require(id);
    }

    /* ---------- capture ---------- */

    /** Price an order without storing it. */
    async preview(body: CreateOrder): Promise<{ order: Omit<ProductOrder, 'id'>; upfrontAmount: number; stateReason: StateReason[] }> {
        const { order, contexts } = await this.build(body);
        const account = order.billingAccount ? await this.accounts.find(order.billingAccount.id) : undefined;
        const stateReason = await this.validate(order, contexts, account);
        return { order, upfrontAmount: this.upfront(contexts), stateReason };
    }

    async create(body: CreateOrder): Promise<ProductOrder> {
        const { order, contexts } = await this.build(body);
        if (order.state === 'draft') return this.orders.insert(order);
        return this.submit(await this.orders.insert(order), contexts);
    }

    /** draft -> acknowledged, then validate and place. */
    async submitDraft(id: string): Promise<ProductOrder> {
        const draft = await this.orders.require(id);
        if (draft.state !== 'draft') throw notAllowed(`Only a draft order can be submitted (state: ${draft.state})`);
        const { order, contexts } = await this.build({
            ...draft,
            state: 'acknowledged',
            productOrderItem: draft.productOrderItem.map((i) => ({ ...i, product: { ...i.product, productPrice: undefined } })),
        } as CreateOrder);
        return this.submit(await this.orders.replace({ ...order, id }), contexts);
    }

    async cancel(id: string): Promise<ProductOrder> {
        const order = await this.orders.require(id);
        if (!['draft', 'acknowledged', 'queued', 'pending', 'held'].includes(order.state)) {
            throw notAllowed(`An order in state ${order.state} cannot be cancelled`);
        }
        return this.save({
            ...order,
            state: 'cancelled',
            productOrderItem: order.productOrderItem.map((i) => ({ ...i, state: 'cancelled' })),
        });
    }

    private async save(order: ProductOrder, previousState?: string): Promise<ProductOrder> {
        order.lastUpdate = this.clock.now().toISOString();
        const saved = await this.orders.replace(order);
        if (previousState !== undefined && previousState !== saved.state) {
            await this.events.publish('ProductOrderStateChangeEvent', {
                productOrderId: saved.id,
                previousState,
                newState: saved.state,
            });
        }
        return saved;
    }

    /** Normalise the request, resolve offerings/products, and enrich items with prices. */
    private async build(body: CreateOrder): Promise<{ order: Omit<ProductOrder, 'id'> & { id?: string }; contexts: ItemContext[] }> {
        if (!Array.isArray(body.productOrderItem) || !body.productOrderItem.length) {
            throw invalid('An order needs at least one productOrderItem');
        }
        if (!Array.isArray(body.relatedParty)) throw invalid('relatedParty is required');
        const state = body.state ?? 'acknowledged';
        if (state !== 'draft' && state !== 'acknowledged') throw invalid('A new order must be draft or acknowledged');

        const account = body.billingAccount?.id ? await this.accounts.find(body.billingAccount.id) : undefined;
        const currency = body.currency ?? (account ? currencyOf(account) : undefined);
        if (!currency) throw invalid('currency is required when the order has no billing account');
        const now = this.clock.now();

        // 1. normalise
        const rawItems = body.productOrderItem.map((raw, idx) => ({ ...raw, id: raw.id ?? String(idx + 1) }));
        const ids = new Set<string>();
        for (const raw of rawItems) {
            if (ids.has(raw.id)) throw invalid(`Duplicate productOrderItem id ${raw.id}`);
            ids.add(raw.id);
            if (!['add', 'modify', 'delete', 'noChange'].includes(raw.action)) throw invalid(`Invalid item action ${raw.action}`);
            if (raw.action === 'add' && !raw.productOffering?.id) throw invalid(`Item ${raw.id}: productOffering is required for add`);
            if ((raw.action === 'modify' || raw.action === 'delete') && !raw.product?.id) {
                throw invalid(`Item ${raw.id}: product.id is required for ${raw.action}`);
            }
        }

        // 2. expand bundles: an added bundle offering brings its member offerings as child items
        const expanded: (CreateOrderItem & { id: string })[] = [];
        for (const raw of rawItems) {
            expanded.push(raw);
            if (raw.action !== 'add') continue;
            const offering = await this.catalog.findOffering(raw.productOffering!.id);
            const hasChildren = raw.productOrderItemRelationship?.some((r) => BUNDLE_REL.includes(r.relationshipType));
            if (!offering?.isBundle || hasChildren) continue;
            const children = [
                ...(offering.bundledProductOffering ?? []),
                ...(offering.bundledGroupProductOffering ?? []).flatMap((g) => g.bundledProductOffering),
            ];
            raw.productOrderItemRelationship = [];
            children.forEach((child, n) => {
                const childId = `${raw.id}.${n + 1}`;
                raw.productOrderItemRelationship!.push({ id: childId, relationshipType: 'bundles' });
                expanded.push({ id: childId, action: 'add', quantity: raw.quantity, productOffering: { id: child.id } });
            });
        }

        // 3. resolve
        const contexts: ItemContext[] = [];
        for (const raw of expanded) {
            const existing = raw.product?.id ? await this.inventory.findProduct(raw.product.id) : undefined;
            const offeringId = raw.productOffering?.id ?? existing?.productOffering.id;
            const offering = offeringId ? await this.catalog.findOffering(offeringId) : undefined;
            const quantity = raw.quantity ?? existing?.quantity ?? 1;
            let productTerm = raw.product?.productTerm;
            productTerm = productTerm?.map((t) => {
                const ot = offering?.productOfferingTerm?.find(
                    (x) => x.duration.amount === t.duration?.amount && x.duration.units === t.duration?.units
                );
                return { ...t, name: t.name ?? ot?.name, renewalAction: t.renewalAction ?? ot?.renewalAction, productOfferingTerm: ot?.id ? { id: ot.id, name: ot.name } : undefined };
            });
            const item: ProductOrderItem = {
                id: raw.id,
                action: raw.action,
                quantity,
                state: state === 'draft' ? 'draft' : 'acknowledged',
                productOffering: offering ? { id: offering.id, name: offering.name, version: offering.version } : raw.productOffering,
                product: {
                    id: raw.product?.id,
                    name: raw.product?.name ?? offering?.name ?? existing?.name,
                    productCharacteristic: raw.product?.productCharacteristic ?? (raw.action === 'add' ? [] : existing?.productCharacteristic),
                    productTerm: productTerm ?? (raw.action === 'add' ? undefined : existing?.productTerm),
                },
                productOrderItemRelationship: raw.productOrderItemRelationship,
            };
            contexts.push({
                item,
                offering,
                existing,
                calculatedPrice: [],
                fee: { money: { value: 0, unit: currency } },
                suppliedPrice: raw.product?.productPrice,
            });
        }
        for (const ctx of contexts) {
            for (const rel of ctx.item.productOrderItemRelationship ?? []) {
                if (!BUNDLE_REL.includes(rel.relationshipType)) continue;
                const child = contexts.find((c) => c.item.id === rel.id);
                if (!child) throw invalid(`Item ${ctx.item.id}: related item ${rel.id} not found`);
                child.parentItemId = ctx.item.id;
            }
        }

        // 4. enrich with prices and totals
        const priceable: BuildPriceItem[] = contexts
            .filter((c) => c.offering && (c.item.action === 'add' || c.item.action === 'modify'))
            .map((c) => ({
                id: c.item.id,
                offering: structuredClone(c.offering!),
                parentItemId: c.parentItemId,
                config: {
                    quantity: c.item.quantity,
                    currency,
                    characteristic: c.item.product?.productCharacteristic,
                    productTerm: c.item.product?.productTerm,
                },
            }));
        const prices = buildProductPrices(priceable);
        for (const ctx of contexts) {
            const { item } = ctx;
            if (item.action === 'add' || item.action === 'modify') {
                ctx.calculatedPrice = prices.get(item.id) ?? [];
                item.product!.productPrice = ctx.suppliedPrice ?? ctx.calculatedPrice;
            }
            if (ctx.offering && item.action !== 'noChange') {
                ctx.fee = calculateOneTimeFee(
                    ctx.offering,
                    { quantity: item.quantity, currency, action: item.action, channel: body.channel },
                    ctx.existing,
                    now
                );
            }
            const totals: OrderPrice[] =
                item.action === 'add' || item.action === 'modify'
                    ? totalsFor(item.product!.productPrice ?? [], item.quantity, this.config.defaultTaxRatePercent, this.config.monetaryPrecision)
                    : [];
            if (ctx.fee.money.value > 0) {
                const split = this.feeSplit(ctx.fee);
                totals.push({
                    priceType: 'oneTimeFee',
                    price: {
                        dutyFreeAmount: { unit: currency, value: split.taxExcluded },
                        taxIncludedAmount: { unit: currency, value: split.taxIncluded },
                        taxRate: ctx.fee.taxRate ?? this.config.defaultTaxRatePercent,
                    },
                });
            }
            item.itemTotalPrice = totals;
        }

        const order: Omit<ProductOrder, 'id'> = {
            '@type': 'ProductOrder',
            state,
            category: body.category,
            description: body.description,
            currency,
            relatedParty: body.relatedParty,
            billingAccount: account ? { id: account.id, name: account.name } : body.billingAccount,
            paymentMethod: body.paymentMethod,
            channel: body.channel ?? { id: this.config.defaultChannel, name: this.config.defaultChannel },
            productOrderItem: contexts.map((c) => c.item),
            orderTotalPrice: sumTotals(contexts.map((c) => c.item.itemTotalPrice ?? [])),
            orderDate: now.toISOString(),
            lastUpdate: now.toISOString(),
        };
        return { order, contexts };
    }

    private feeSplit(fee: OneTimeFeeResult): { taxExcluded: number; taxIncluded: number; tax: number } {
        return splitTax(fee.money.value, fee.taxRate ?? this.config.defaultTaxRatePercent, !!fee.isTaxIncluded, this.config.monetaryPrecision);
    }

    /** What must be paid when the order is delivered: one-time charges, first in-advance period, fees. */
    private upfront(contexts: ItemContext[]): number {
        let total = Dec.ZERO;
        for (const ctx of contexts) {
            if (ctx.item.action === 'add') {
                for (const pp of ctx.item.product?.productPrice ?? []) {
                    const upfrontPrice = pp.priceType === 'oneTimeCharge' || (pp.priceType === 'recurringCharge' && pp.chargeType !== 'inArrear');
                    if (!upfrontPrice) continue;
                    total = total.plus(
                        chargeAmount(pp, ctx.item.quantity, this.config.defaultTaxRatePercent, this.config.monetaryPrecision).taxIncluded
                    );
                }
            }
            if (ctx.fee.money.value > 0) total = total.plus(this.feeSplit(ctx.fee).taxIncluded);
        }
        return roundMoney(total);
    }

    /* ---------- validation ---------- */

    private async validate(
        order: Omit<ProductOrder, 'id'>,
        contexts: ItemContext[],
        account: BillingAccount | undefined
    ): Promise<StateReason[]> {
        const reasons: StateReason[] = [];
        const push = (code: string, label: string, item?: ProductOrderItem): void => {
            const r = reason(code, item ? `Item ${item.id}: ${label}` : label);
            reasons.push(r);
            if (item) (item.stateReason ??= []).push(r);
        };

        // header: RelatedPartyValidator
        const customers = order.relatedParty.filter((rp) => rp.role === 'customer');
        if (!customers.length) push('CustomerAssociationError', 'The order has no related party with role "customer"');
        for (const rp of customers) {
            const party = await this.parties.findParty(rp.partyOrPartyRole.id, rp.partyOrPartyRole['@referredType']);
            if (!party) {
                push('CustomerAssociationError', `Customer ${rp.partyOrPartyRole.id} does not exist`);
                continue;
            }
            if (party.status === 'closed' || party.status === 'deceased') {
                push('CustomerStatusError', `Customer is ${party.status}`);
            }
            if (account && !account.relatedParty.some((x) => x.partyOrPartyRole.id === party.id)) {
                push('WrongBillingAccountError', 'The billing account does not belong to the customer');
            }
        }
        if (order.billingAccount && !account) push('WrongBillingAccountError', 'The billing account does not exist');
        if (!order.billingAccount) push('BillingAccountMissing', 'A billing account is required to deliver an order');
        if (account?.state === 'closed') push('BillingAccountClosed', 'The billing account is closed');
        if (account && order.currency !== currencyOf(account)) {
            push('CurrencyMismatch', `Order currency ${order.currency} differs from the account currency ${currencyOf(account)}`);
        }
        if (account?.state === 'created' && account.ratingType !== 'prepaid' && !account.billStructure?.cycleSpecification?.id) {
            push('BillingAccountNotActivatable', 'The billing account has no bill cycle specification and cannot be activated');
        }

        // items
        for (const ctx of contexts) {
            const { item, offering, existing } = ctx;
            if (!(item.quantity >= 1) || !Number.isInteger(item.quantity)) push('modifiedQuantityOutOfRange', 'Quantity must be a whole number of at least 1', item);

            if (item.action === 'add' || item.action === 'modify') {
                if (!offering) {
                    push('ProductOfferingNotFound', 'The product offering does not exist', item);
                    continue;
                }
                if (item.action === 'add' && !ORDERABLE.includes(offering.lifecycleStatus)) {
                    push('ProductOfferingNotAvailable', `Offering "${offering.name}" is ${offering.lifecycleStatus} and cannot be ordered`, item);
                }
                const iso = this.clock.now().toISOString();
                if (item.action === 'add' && ((offering.validFor?.startDateTime ?? '') > iso || (offering.validFor?.endDateTime ?? '9999') < iso)) {
                    push('ProductOfferingNotAvailable', `Offering "${offering.name}" is outside its validity period`, item);
                }
                // TermConsistencyValidator
                const terms = item.product?.productTerm ?? [];
                if (terms.some((t) => !t.productOfferingTerm?.id) && terms.length) {
                    push('productPriceTermNotDeclared', 'The selected term is not offered by this product offering', item);
                }
                // QuantityRangeValidator + price existence
                const sellable = (offering.productOfferingPrice ?? []).some((p) => p.priceType === 'oneTimeCharge' || p.priceType === 'recurringCharge');
                if (sellable && !ctx.calculatedPrice.length && !ctx.parentItemId) {
                    push('noMatchingPrice', 'No price matches this quantity, currency, term and configuration', item);
                }
                // PriceComparator
                if (ctx.suppliedPrice) {
                    for (const r of diffPrices(ctx.suppliedPrice, ctx.calculatedPrice)) push(r.code, r.label, item);
                }
            }
            if (item.action === 'modify' || item.action === 'delete') {
                if (!existing) {
                    push('ProductNotFound', 'The product does not exist', item);
                    continue;
                }
                if (!['active', 'suspended'].includes(existing.status)) {
                    push('ProductStatusError', `A product in status ${existing.status} cannot be changed`, item);
                }
                if (account && existing.billingAccount?.id !== account.id) {
                    push('WrongBillingAccountError', 'The product is billed to a different billing account', item);
                }
            }
        }

        // bundle rule for deletes
        const deletes = contexts.filter((c) => c.item.action === 'delete' && c.existing);
        if (deletes.length && account) {
            try {
                resolveBundleDeactivation(
                    await this.inventory.productsForAccount(account.id),
                    deletes.map((c) => c.existing!.id),
                    this.config.allowPartialBundleDeactivation
                );
            } catch (e) {
                push('SubscriptionIsPartOfBundle', (e as Error).message);
            }
        }

        // BillingAccountValidator: credit limit
        if (account && this.config.shouldValidateCreditLimit && account.creditLimit?.value) {
            const excluded = new Set(
                contexts.filter((c) => c.item.action === 'delete' || c.item.action === 'modify').map((c) => c.item.product?.id)
            );
            const p = this.config.monetaryPrecision;
            const t = this.config.defaultTaxRatePercent;
            let current = Dec.ZERO;
            for (const product of await this.inventory.productsForAccount(account.id, LIVE)) {
                if (excluded.has(product.id)) continue;
                for (const pp of product.productPrice ?? []) {
                    if (pp.priceType === 'recurringCharge') current = current.plus(chargeAmount(pp, product.quantity, t, p).taxIncluded);
                }
            }
            let orderTotal = Dec.ZERO;
            for (const total of order.orderTotalPrice ?? []) orderTotal = orderTotal.plus(total.price.taxIncludedAmount?.value ?? 0);
            if (current.plus(orderTotal).gt(account.creditLimit.value)) {
                push('AccountCreditLimitExceeded', `The order would exceed the credit limit of ${account.creditLimit.value} ${account.creditLimit.unit}`);
            }
        }
        return reasons;
    }

    /* ---------- placement ---------- */

    private async submit(order: ProductOrder, contexts: ItemContext[]): Promise<ProductOrder> {
        await this.events.publish('ProductOrderCreateEvent', { productOrderId: order.id });
        const account = order.billingAccount ? await this.accounts.find(order.billingAccount.id) : undefined;
        const reasons = await this.validate(order, contexts, account);
        if (reasons.length) {
            return this.save(
                {
                    ...order,
                    state: 'rejected',
                    stateReason: reasons,
                    productOrderItem: order.productOrderItem.map((i) => ({ ...i, state: 'rejected' })),
                },
                order.state
            );
        }
        return this.placeOrder(order, contexts, account!);
    }

    private async setState(ctx: PlaceContext, state: ProductOrder['state'], itemState?: ProductOrderItem['state']): Promise<void> {
        const previous = ctx.order.state;
        ctx.order.state = state;
        if (itemState) for (const i of ctx.order.productOrderItem) i.state = itemState;
        ctx.order = await this.save(ctx.order, previous);
        // keep item contexts pointing at the stored items
        for (const ic of ctx.items) ic.item = ctx.order.productOrderItem.find((i) => i.id === ic.item.id)!;
    }

    private async placeOrder(order: ProductOrder, contexts: ItemContext[], account: BillingAccount): Promise<ProductOrder> {
        const ctx: PlaceContext = {
            order,
            account,
            items: contexts,
            fulfilmentStarted: false,
            created: new Map(),
            snapshots: [],
            acbrs: [],
            upfront: this.upfront(contexts),
        };
        const orderRef: Ref = { id: order.id };
        const lockKey = account.id;
        const currency = order.currency!;
        const step = (name: string, run: () => Promise<void>, compensate?: () => Promise<void>): SagaStep<PlaceContext> => ({
            name,
            run: async () => {
                if (this.failAtStep === name) throw new Error(`Injected failure at ${name}`);
                await run();
            },
            compensate,
        });

        const steps: SagaStep<PlaceContext>[] = [
            /* ----- place_order ----- */
            step(
                'lock_existing_subscriptions',
                async () => {
                    if (this.locks.has(lockKey)) {
                        throw new DomainError('POCV-LOCKED', 'Another order is being processed for this billing account', 409);
                    }
                    this.locks.add(lockKey);
                },
                async () => void this.locks.delete(lockKey)
            ),
            step('validate_product_last_update', async () => {
                for (const ic of ctx.items) {
                    if (!ic.existing) continue;
                    const fresh = await this.inventory.getProduct(ic.existing.id);
                    if (fresh.lastUpdate !== ic.existing.lastUpdate) {
                        throw new DomainError('POCV-STALE_PRODUCT', `Product ${fresh.id} changed while the order was being placed`, 409);
                    }
                }
            }),
            step('update_state_to_queued', () => this.setState(ctx, 'queued', 'queued')),
            step('calculate_deficit', async () => {
                // prepaid customers pay on delivery; postpaid charges wait for the bill cycle
                const fresh = await this.accounts.get(account.id);
                const credit = Dec.max(payableBalanceOf(fresh).value, 0);
                const deficit = fresh.ratingType === 'prepaid' ? Dec.max(Dec.of(ctx.upfront).minus(credit), 0) : Dec.ZERO;
                ctx.order.deficitAmount = { unit: currency, value: roundMoney(deficit) };
            }),
            step(
                'reserve_deficit',
                async () => {
                    const deficit = ctx.order.deficitAmount!;
                    if (deficit.value <= 0) return;
                    if (!ctx.order.paymentMethod?.id) {
                        throw new DomainError(
                            'POCV-INSUFFICIENT_BALANCE',
                            `Prepaid balance is short by ${deficit.value} ${deficit.unit} and the order has no payment method`,
                            409
                        );
                    }
                    ctx.reservation = await this.payments.create({
                        account: { id: account.id },
                        totalAmount: deficit,
                        status: 'reserved',
                        paymentMethod: ctx.order.paymentMethod,
                        productOrder: orderRef,
                        description: `Reservation for order ${order.id}`,
                    });
                },
                async () => {
                    if (!ctx.reservation) return;
                    const p = await this.payments.get(ctx.reservation.id);
                    if (p.status === 'reserved' || p.status === 'approved') await this.payments.cancel(p.id);
                }
            ),
            step('patch_order_with_created_reservation', async () => {
                if (ctx.reservation) ctx.order.payment = [{ id: ctx.reservation.id }];
                ctx.order = await this.save(ctx.order);
            }),

            /* ----- fulfilment_execution_v2 ----- */
            step('update_state_to_in_progress', async () => {
                ctx.fulfilmentStarted = true;
                await this.setState(ctx, 'inProgress', 'inProgress');
            }),
            step(
                'fulfill_order_items',
                async () => {
                    const subscription = await this.inventory.ensureSubscription(
                        ctx.order.billingAccount,
                        ctx.order.relatedParty,
                        `Subscription for ${account.name}`
                    );
                    for (const ic of ctx.items) {
                        const { item } = ic;
                        if (item.action === 'add') {
                            // instantiate_product -> patch_order_item -> patch_subscription
                            const product = await this.inventory.instantiate({
                                name: item.product?.name,
                                quantity: item.quantity,
                                isBundle: ic.offering?.isBundle,
                                productOffering: item.productOffering as Product['productOffering'],
                                productPrice: item.product?.productPrice,
                                productTerm: item.product?.productTerm,
                                productCharacteristic: item.product?.productCharacteristic,
                                billingAccount: ctx.order.billingAccount,
                                relatedParty: ctx.order.relatedParty,
                                productOrderItem: [{ orderId: order.id, orderItemId: item.id, action: 'add' }],
                            });
                            ctx.created.set(item.id, product);
                            item.product = { ...item.product, id: product.id };
                            await this.inventory.addProductToSubscription(subscription.id, product.id);
                        } else if (item.action === 'modify') {
                            ctx.snapshots.push(await this.inventory.getProduct(ic.existing!.id));
                            await this.inventory.modify(ic.existing!.id, {
                                quantity: item.quantity,
                                productCharacteristic: item.product?.productCharacteristic,
                                productPrice: item.product?.productPrice,
                                productTerm: item.product?.productTerm,
                            });
                        }
                    }
                    ctx.order = await this.save(ctx.order);
                },
                async () => {
                    for (const product of ctx.created.values()) {
                        await this.inventory.abort(product.id);
                        await this.inventory.removeProductFromSubscription(product.id);
                    }
                    for (const snapshot of ctx.snapshots) await this.inventory.restore(snapshot);
                }
            ),
            step('patch_technical_relationships', async () => {
                for (const ic of ctx.items) {
                    if (!ic.parentItemId) continue;
                    const child = ctx.created.get(ic.item.id);
                    const parent = ctx.created.get(ic.parentItemId);
                    if (!child || !parent) continue;
                    await this.linkBundle(parent.id, child.id);
                }
            }),
            step('fulfil_inventory', async () => {
                for (const product of ctx.created.values()) await this.inventory.activate(product.id);
                const deletes = ctx.items.filter((ic) => ic.item.action === 'delete').map((ic) => ic.existing!.id);
                if (deletes.length) {
                    const all = await this.inventory.productsForAccount(account.id);
                    const targets = new Set(
                        resolveBundleDeactivation(all, deletes, this.config.allowPartialBundleDeactivation).map((t) => t.productId)
                    );
                    for (const p of all) {
                        const parent = p.productRelationship?.find((r) => r.relationshipType === 'bundledBy')?.id;
                        if (!targets.has(p.id) && !(parent && targets.has(parent))) continue;
                        if (!['active', 'suspended', 'pendingTerminate'].includes(p.status)) continue;
                        ctx.snapshots.push(p);
                        await this.inventory.terminate(p.id);
                    }
                }
            }),
            step('activate_billing_account', async () => {
                const fresh = await this.accounts.get(account.id);
                if (fresh.state !== 'created') return;
                if (fresh.billStructure?.cycleSpecification?.id) await this.accounts.activate(fresh.id);
                else await this.accounts.patch(fresh.id, { state: 'active' }); // prepaid accounts have no bill cycle
            }),
            step(
                'rate_order',
                async () => {
                    for (const ic of ctx.items) {
                        const product = ctx.created.get(ic.item.id);
                        if (product) {
                            ctx.acbrs.push(...(await this.billing.chargeActivatedProduct(await this.inventory.getProduct(product.id), orderRef)));
                        }
                        if (ic.fee.money.value > 0) {
                            const split = this.feeSplit(ic.fee);
                            const penalty = ic.item.action === 'delete';
                            ctx.acbrs.push(
                                await this.billing.createAcbr({
                                    appliedBillingRateType: penalty ? 'appliedBillingChargePenaltyFee' : 'appliedBillingChargeServiceFee',
                                    billingAccount: { id: account.id },
                                    name: `${ic.fee.name ?? 'Fee'} - ${ic.item.product?.name ?? ''}`.trim(),
                                    product: ic.item.product?.id ? { id: ic.item.product.id } : undefined,
                                    productOrder: orderRef,
                                    taxExcludedAmount: { unit: currency, value: split.taxExcluded },
                                    taxIncludedAmount: { unit: currency, value: split.taxIncluded },
                                    taxRate: ic.fee.taxRate ?? this.config.defaultTaxRatePercent,
                                })
                            );
                        }
                    }
                    for (const snapshot of ctx.snapshots) {
                        const now = await this.inventory.getProduct(snapshot.id);
                        if (now.status === 'terminated') ctx.acbrs.push(...(await this.billing.prorateOnTermination(snapshot)));
                    }
                },
                async () => {
                    for (const acbr of ctx.acbrs) {
                        const fresh = (await this.billing.listAcbrs((a) => a.id === acbr.id))[0];
                        if (fresh && !fresh.isBilled && fresh.status === 'active') await this.billing.cancelAcbr(fresh.id);
                    }
                }
            ),
            step(
                'commit_payment_deficit',
                async () => {
                    const fresh = await this.accounts.get(account.id);
                    if (fresh.ratingType !== 'prepaid' || !ctx.acbrs.length) return;
                    // prepaid: bill the order now; existing credit is used first, the reservation covers the rest
                    ctx.bill = await this.billing.calculateBill(account.id, { approve: true, category: 'PayNowPurchase' });
                    if (ctx.reservation) {
                        await this.payments.transition(ctx.reservation.id, 'approved');
                    }
                },
                async () => {
                    if (ctx.reservation) {
                        const p = await this.payments.get(ctx.reservation.id);
                        if (p.status === 'approved') await this.payments.cancel(p.id);
                    }
                    if (ctx.bill) {
                        const b = await this.billing.getBill(ctx.bill.id);
                        if (!b.appliedPayment.length && b.state !== 'cancelled' && b.state !== 'settled') await this.billing.cancelBill(b.id);
                    }
                }
            ),
            step('update_order_head_state', async () => {
                ctx.order.completionDate = this.clock.now().toISOString();
                await this.setState(ctx, 'completed', 'completed');
            }),
        ];

        const execution = await this.sagas.execute('place_order', steps, ctx, order.id);
        this.locks.delete(lockKey); // unlock_all_subscriptions
        if (execution.status === 'succeeded') return ctx.order;

        // move_order_and_order_items_to_rejected_state (before fulfilment) or failed (after)
        const finalState = ctx.fulfilmentStarted ? 'failed' : 'rejected';
        const latest = await this.orders.require(order.id);
        return this.save(
            {
                ...latest,
                state: finalState,
                stateReason: [reason(execution.status === 'rollbackFailed' ? 'RollbackFailed' : 'FulfilmentError', execution.error ?? 'Order failed')],
                productOrderItem: latest.productOrderItem.map((i) => ({
                    ...i,
                    state: finalState,
                    product: i.action === 'add' ? { ...i.product, id: undefined } : i.product,
                })),
            },
            latest.state
        );
    }

    private async linkBundle(parentId: string, childId: string): Promise<void> {
        const parent = await this.inventory.getProduct(parentId);
        const child = await this.inventory.getProduct(childId);
        await this.inventory.restore({
            ...parent,
            productRelationship: [...(parent.productRelationship ?? []), { relationshipType: 'bundles', id: childId }],
        });
        await this.inventory.restore({
            ...child,
            productRelationship: [...(child.productRelationship ?? []), { relationshipType: 'bundledBy', id: parentId }],
        });
    }
}
