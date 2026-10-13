/**
 * Product inventory (TMF637): products and the subscriptions that group them.
 *
 * Ported from ts-polaris `apps/productInventory`:
 *  - activation: allowed source states, term validity window, manual-repurchase
 *    termination date, subscription activation (ProductService.activateProduct /
 *    buildActivationPayload)
 * Ported from Lua `subscriptionlifecycle/StateTransitions.lua`:
 *  - bundle deactivation resolution (_build_ids_and_parents / _resolve_bundle_deactivation)
 * The product status table is reconstructed from how the original services use
 * ProductStatusType; the original does not declare it in one place.
 */
import type { Collection, Store } from '../common/store.ts';
import type { Clock, EventBus } from '../common/runtime.ts';
import { TransitionTable } from '../common/stateMachine.ts';
import { DomainError, invalid } from '../common/errors.ts';
import type { Duration, Product, ProductStatus, ProductTerm, Ref, Subscription } from '../common/model.ts';

export const productLifecycle = new TransitionTable('product', [
    { currentState: null, nextState: 'created' },
    { currentState: 'created', nextState: 'pendingActive' },
    { currentState: 'created', nextState: 'active' },
    { currentState: 'created', nextState: 'cancelled' },
    { currentState: 'created', nextState: 'aborted' },
    { currentState: 'pendingActive', nextState: 'active' },
    { currentState: 'pendingActive', nextState: 'cancelled' },
    { currentState: 'pendingActive', nextState: 'aborted' },
    { currentState: 'active', nextState: 'suspended' },
    { currentState: 'active', nextState: 'pendingTerminate' },
    { currentState: 'active', nextState: 'terminated' },
    { currentState: 'active', nextState: 'aborted' },
    { currentState: 'suspended', nextState: 'active' },
    { currentState: 'suspended', nextState: 'pendingTerminate' },
    { currentState: 'suspended', nextState: 'terminated' },
    { currentState: 'pendingTerminate', nextState: 'active' },
    { currentState: 'pendingTerminate', nextState: 'terminated' },
]);

/** States from which a product may be (re)activated — verbatim from activateProductByProductID. */
export const ACTIVATABLE: ProductStatus[] = ['created', 'suspended', 'pendingTerminate', 'pendingActive'];
/** States in which a product still counts as "live" for billing and credit checks. */
export const LIVE: ProductStatus[] = ['created', 'pendingActive', 'active', 'suspended', 'pendingTerminate'];

export function addDuration(from: Date, d: Duration): Date {
    const out = new Date(from);
    switch (d.units) {
        case 'day':
            out.setUTCDate(out.getUTCDate() + d.amount);
            break;
        case 'week':
            out.setUTCDate(out.getUTCDate() + 7 * d.amount);
            break;
        case 'month':
            out.setUTCMonth(out.getUTCMonth() + d.amount);
            break;
        case 'year':
            out.setUTCFullYear(out.getUTCFullYear() + d.amount);
            break;
    }
    return out;
}

/** What activation writes onto a product (port of buildActivationPayload). */
export function buildActivationPayload(product: Product, now: Date): Partial<Product> {
    const payload: Partial<Product> = { startDate: product.startDate ?? now.toISOString(), status: 'active' };
    const first = product.productTerm?.[0];
    if (first) {
        const start = first.validFor?.startDateTime ?? now.toISOString();
        const end = first.validFor?.endDateTime ?? addDuration(new Date(start), first.duration).toISOString();
        const term: ProductTerm = { ...first, validFor: { startDateTime: start, endDateTime: end } };
        payload.productTerm = [term, ...product.productTerm!.slice(1)];
        if (first.renewalAction === 'manualRepurchase') payload.terminationDate = end;
    }
    return payload;
}

export interface DeactivationTarget {
    productId: string;
    offeringId: string;
}

/**
 * Decide what to deactivate when some products are selected and some of them are
 * bundle members. If every member of a bundle is selected the bundle head is
 * deactivated instead; a partial selection is only allowed when the operator
 * permits partial bundle deactivation.
 */
export function resolveBundleDeactivation(
    products: Product[],
    requestedIds: string[],
    allowPartialBundleDeactivation: boolean
): DeactivationTarget[] {
    const byId = new Map(products.map((p) => [p.id, p]));
    const parentOf = (p: Product): string | undefined =>
        p.productRelationship?.find((r) => r.relationshipType === 'bundledBy')?.id;
    const childrenOf = (p: Product): string[] =>
        (p.productRelationship ?? []).filter((r) => r.relationshipType === 'bundles').map((r) => r.id);

    const targets: DeactivationTarget[] = [];
    const parents = new Map<string, Product[]>();
    for (const id of requestedIds) {
        const p = byId.get(id);
        if (!p) continue; // unknown ids are ignored, as in the original (it only emits a metric)
        const parentId = parentOf(p);
        if (!parentId) targets.push({ productId: p.id, offeringId: p.productOffering.id });
        else parents.set(parentId, [...(parents.get(parentId) ?? []), p]);
    }
    for (const [parentId, selected] of parents) {
        const parent = byId.get(parentId);
        const total = parent ? childrenOf(parent).length : 0;
        if (parent && selected.length === total) {
            targets.push({ productId: parent.id, offeringId: parent.productOffering.id });
        } else if (allowPartialBundleDeactivation) {
            for (const s of selected) targets.push({ productId: s.id, offeringId: s.productOffering.id });
        } else {
            throw new DomainError(
                'SUBSCRIPTION-SUBSCRIPTION_IS_PART_OF_BUNDLE',
                'A product that is part of a bundle cannot be deactivated on its own',
                409
            );
        }
    }
    return targets;
}

export class InventoryService {
    private readonly products: Collection<Product>;
    private readonly subscriptions: Collection<Subscription>;
    private readonly events: EventBus;
    private readonly clock: Clock;

    constructor(store: Store, events: EventBus, clock: Clock) {
        this.products = store.collection<Product>('product', 'Product');
        this.subscriptions = store.collection<Subscription>('subscription', 'Subscription');
        this.events = events;
        this.clock = clock;
    }

    listProducts(filter?: (p: Product) => boolean): Promise<Product[]> {
        return this.products.list(filter);
    }
    getProduct(id: string): Promise<Product> {
        return this.products.require(id);
    }
    findProduct(id: string): Promise<Product | undefined> {
        return this.products.get(id);
    }
    listSubscriptions(): Promise<Subscription[]> {
        return this.subscriptions.list();
    }
    getSubscription(id: string): Promise<Subscription> {
        return this.subscriptions.require(id);
    }
    productsForAccount(accountId: string, statuses: ProductStatus[] = LIVE): Promise<Product[]> {
        return this.products.list((p) => p.billingAccount?.id === accountId && statuses.includes(p.status));
    }

    /** Create a product in `created`. It is not billable until activated. */
    async instantiate(body: Omit<Product, 'id' | '@type' | 'status'>): Promise<Product> {
        if (!(body.quantity >= 1)) throw invalid('quantity must be at least 1');
        if (!body.productOffering?.id) throw invalid('productOffering is required');
        const now = this.clock.now().toISOString();
        return this.products.insert({ ...body, '@type': 'Product', status: 'created', creationDate: now, lastUpdate: now });
    }

    /** Find the subscription for (account, customer) or create one in `pending`. */
    async ensureSubscription(billingAccount: Ref | undefined, relatedParty: Product['relatedParty'], name: string): Promise<Subscription> {
        const existing = await this.subscriptions.list(
            (s) => s.state !== 'terminated' && s.billingAccount?.id === billingAccount?.id && !!billingAccount?.id
        );
        if (existing[0]) return existing[0];
        return this.subscriptions.insert({
            '@type': 'Subscription',
            name,
            state: 'pending',
            product: [],
            billingAccount,
            relatedParty,
            creationDate: this.clock.now().toISOString(),
        });
    }

    async addProductToSubscription(subscriptionId: string, productId: string): Promise<Subscription> {
        const sub = await this.subscriptions.require(subscriptionId);
        const product = await this.products.require(productId);
        if (!sub.product.some((r) => r.id === productId)) sub.product.push({ id: productId, name: product.name });
        product.subscription = { id: sub.id, name: sub.name };
        await this.products.replace(product);
        return this.subscriptions.replace(sub);
    }

    async removeProductFromSubscription(productId: string): Promise<void> {
        const product = await this.products.get(productId);
        if (!product?.subscription) return;
        const sub = await this.subscriptions.get(product.subscription.id);
        if (!sub) return;
        sub.product = sub.product.filter((r) => r.id !== productId);
        if (!sub.product.length && sub.state === 'pending') await this.subscriptions.delete(sub.id);
        else await this.subscriptions.replace(sub);
    }

    private async setStatus(
        id: string,
        status: ProductStatus,
        extra: Partial<Product> = {},
        allowedFrom?: ProductStatus[]
    ): Promise<{ before: Product; after: Product }> {
        const before = await this.products.require(id);
        if (allowedFrom && !allowedFrom.includes(before.status)) {
            throw new DomainError(
                'PI-INVALID_STATE_TRANSITION',
                `Product in status ${before.status} cannot move to ${status}`,
                409
            );
        }
        productLifecycle.assert(before.status, status);
        const after = await this.products.replace({
            ...before,
            ...extra,
            status,
            lastUpdate: this.clock.now().toISOString(),
        });
        if (before.status !== after.status) {
            await this.events.publish('ProductStateChangeEvent', {
                entityId: id,
                previousState: before.status,
                newState: after.status,
                billingAccountId: after.billingAccount?.id,
            });
        }
        return { before, after };
    }

    /** Activate (or re-activate) a product and its subscription. */
    async activate(id: string): Promise<Product> {
        const product = await this.products.require(id);
        const payload = buildActivationPayload(product, this.clock.now());
        if (product.status === 'suspended') payload.resumeDate = this.clock.now().toISOString();
        const { after } = await this.setStatus(id, 'active', { ...payload, suspensionReason: undefined }, ACTIVATABLE);
        if (after.subscription) {
            const sub = await this.subscriptions.get(after.subscription.id);
            if (sub && sub.state !== 'active') await this.subscriptions.replace({ ...sub, state: 'active' });
        }
        return after;
    }

    async suspend(id: string, reason = 'manual'): Promise<Product> {
        const { after } = await this.setStatus(id, 'suspended', { suspensionReason: reason }, ['active']);
        await this.syncSubscription(after);
        return after;
    }

    async requestTermination(id: string): Promise<Product> {
        return (await this.setStatus(id, 'pendingTerminate', {}, ['active', 'suspended'])).after;
    }

    async terminate(id: string): Promise<Product> {
        const { after } = await this.setStatus(
            id,
            'terminated',
            { terminationDate: this.clock.now().toISOString() },
            ['active', 'suspended', 'pendingTerminate']
        );
        await this.syncSubscription(after);
        return after;
    }

    /** Undo an instantiation during order rollback. */
    async abort(id: string): Promise<Product> {
        const { after } = await this.setStatus(id, 'aborted', {}, ['created', 'pendingActive', 'active']);
        await this.syncSubscription(after);
        return after;
    }

    /** Overwrite commercial fields of a live product (order item action "modify"). */
    async modify(
        id: string,
        change: Pick<Partial<Product>, 'quantity' | 'productCharacteristic' | 'productPrice' | 'productTerm'>
    ): Promise<{ before: Product; after: Product }> {
        const before = await this.products.require(id);
        if (!['active', 'suspended'].includes(before.status)) {
            throw new DomainError('PI-INVALID_STATE', `Product in status ${before.status} cannot be modified`, 409);
        }
        if (change.quantity !== undefined && !(change.quantity >= 1)) throw invalid('quantity must be at least 1');
        const defined = Object.fromEntries(Object.entries(change).filter(([, v]) => v !== undefined));
        const after = await this.products.replace({ ...before, ...defined, lastUpdate: this.clock.now().toISOString() });
        await this.events.publish('ProductAttributeValueChangeEvent', { entityId: id });
        return { before, after };
    }

    /** Restore a product to an earlier snapshot (order rollback). */
    async restore(snapshot: Product): Promise<void> {
        await this.products.replace(snapshot);
        await this.syncSubscription(snapshot);
    }

    /** Subscription follows its products: suspended when none is active, terminated when all are gone. */
    private async syncSubscription(product: Product): Promise<void> {
        if (!product.subscription) return;
        const sub = await this.subscriptions.get(product.subscription.id);
        if (!sub) return;
        const members = await this.products.list((p) => sub.product.some((r) => r.id === p.id));
        const statuses = members.map((m) => m.status);
        let state: Subscription['state'] = sub.state;
        if (statuses.length && statuses.every((s) => ['terminated', 'aborted', 'cancelled'].includes(s))) state = 'terminated';
        else if (statuses.some((s) => s === 'active' || s === 'pendingTerminate')) state = 'active';
        else if (statuses.some((s) => s === 'suspended')) state = 'suspended';
        if (state !== sub.state) await this.subscriptions.replace({ ...sub, state });
    }
}
