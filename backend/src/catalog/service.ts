/**
 * Product catalog (TMF620): product specifications and product offerings.
 *
 * Ported from ts-polaris `apps/productCatalogManagement`:
 *  - lifecycle transitions from `resources/.../enum_name_to_state_transition.json`
 *  - POP generation from price tables on create and on every price-table change
 *  - the core checks of ProductOfferingValidator / ValidityDateValidator
 */
import type { Collection, Store } from '../common/store.ts';
import type { Clock, EventBus } from '../common/runtime.ts';
import { mergePatch } from '../common/runtime.ts';
import { TransitionTable } from '../common/stateMachine.ts';
import { invalid, notAllowed } from '../common/errors.ts';
import type { LifecycleStatus, ProductOffering, ProductOfferingPrice, ProductSpecification } from '../common/model.ts';
import { buildPOPs } from './popBuilder.ts';

/** Verbatim from the original transition file (null = not yet created / deleted). */
export const offeringLifecycle = new TransitionTable('productOffering', [
    { currentState: null, nextState: 'active' },
    { currentState: null, nextState: 'inDraft' },
    { currentState: 'retired', nextState: null },
    { currentState: 'inDraft', nextState: 'active' },
    { currentState: 'active', nextState: 'retired' },
    { currentState: 'active', nextState: 'launched' },
    { currentState: 'active', nextState: 'obsolete' },
    { currentState: 'launched', nextState: 'retired' },
    { currentState: 'inDraft', nextState: 'retired' },
]);

export const specificationLifecycle = new TransitionTable('productSpecification', [
    { currentState: null, nextState: 'inDraft' },
    { currentState: 'retired', nextState: null },
    { currentState: 'inDraft', nextState: 'active' },
    { currentState: 'active', nextState: 'retired' },
    { currentState: 'active', nextState: 'launched' },
    { currentState: 'active', nextState: 'obsolete' },
    { currentState: 'launched', nextState: 'retired' },
    { currentState: 'inDraft', nextState: 'retired' },
]);

/** Offerings in these states can be ordered. */
export const ORDERABLE: LifecycleStatus[] = ['active', 'launched'];

export type CreateOffering = Omit<ProductOffering, 'id' | '@type' | 'lifecycleStatus' | 'productOfferingPrice'> & {
    lifecycleStatus?: LifecycleStatus;
};
export type CreateSpecification = Omit<ProductSpecification, 'id' | '@type' | 'lifecycleStatus'> & {
    lifecycleStatus?: LifecycleStatus;
};

export class CatalogService {
    private readonly specs: Collection<ProductSpecification>;
    private readonly offerings: Collection<ProductOffering>;
    private readonly events: EventBus;
    private readonly clock: Clock;

    constructor(store: Store, events: EventBus, clock: Clock) {
        this.specs = store.collection<ProductSpecification>('productSpecification', 'ProductSpecification');
        this.offerings = store.collection<ProductOffering>('productOffering', 'ProductOffering');
        this.events = events;
        this.clock = clock;
    }

    /* ----- specifications ----- */

    listSpecifications(): Promise<ProductSpecification[]> {
        return this.specs.list();
    }
    getSpecification(id: string): Promise<ProductSpecification> {
        return this.specs.require(id);
    }

    async createSpecification(body: CreateSpecification): Promise<ProductSpecification> {
        if (!body.name?.trim()) throw invalid('name is required');
        const status = body.lifecycleStatus ?? 'inDraft';
        specificationLifecycle.assert(null, status);
        this.validateCharacteristics(body);
        return this.specs.insert({
            ...body,
            '@type': 'ProductSpecification',
            version: body.version ?? '1',
            lifecycleStatus: status,
            lastUpdate: this.clock.now().toISOString(),
        });
    }

    async patchSpecification(id: string, patch: Partial<ProductSpecification>): Promise<ProductSpecification> {
        const current = await this.specs.require(id);
        const merged = mergePatch(current, patch);
        merged.id = id;
        specificationLifecycle.assert(current.lifecycleStatus, merged.lifecycleStatus);
        this.validateCharacteristics(merged);
        merged.lastUpdate = this.clock.now().toISOString();
        return this.specs.replace(merged);
    }

    async deleteSpecification(id: string): Promise<void> {
        const current = await this.specs.require(id);
        specificationLifecycle.assert(current.lifecycleStatus, null);
        const inUse = await this.offerings.list((o) => o.productSpecification?.id === id);
        if (inUse.length) throw notAllowed('Specification is referenced by product offerings');
        await this.specs.delete(id);
    }

    private validateCharacteristics(spec: Partial<ProductSpecification>): void {
        const names = new Set<string>();
        for (const c of spec.productSpecCharacteristic ?? []) {
            if (!c.id || !c.name) throw invalid('Each characteristic needs an id and a name');
            if (names.has(c.name)) throw invalid(`Duplicate characteristic name: ${c.name}`);
            names.add(c.name);
            const ids = new Set<string>();
            for (const v of c.characteristicValueSpecification ?? []) {
                if (ids.has(v.id)) throw invalid(`Duplicate characteristic value id ${v.id} in ${c.name}`);
                ids.add(v.id);
            }
        }
    }

    /* ----- offerings ----- */

    listOfferings(): Promise<ProductOffering[]> {
        return this.offerings.list();
    }
    getOffering(id: string): Promise<ProductOffering> {
        return this.offerings.require(id);
    }
    findOffering(id: string): Promise<ProductOffering | undefined> {
        return this.offerings.get(id);
    }
    private lookup = (ids: string[]): Promise<ProductOffering[]> => this.offerings.list((o) => ids.includes(o.id));

    async createOffering(body: CreateOffering): Promise<ProductOffering> {
        const status = body.lifecycleStatus ?? 'inDraft';
        offeringLifecycle.assert(null, status);
        const draft: ProductOffering = {
            ...body,
            id: '',
            '@type': 'ProductOffering',
            version: body.version ?? '1',
            lifecycleStatus: status,
        };
        await this.validateOffering(draft);
        draft.productOfferingPrice = await this.buildPrices(draft);
        draft.lastUpdate = this.clock.now().toISOString();
        const { id: _drop, ...rest } = draft;
        const created = await this.offerings.insert(rest);
        await this.events.publish('ProductOfferingCreateEvent', { productOffering: created });
        return created;
    }

    async patchOffering(id: string, patch: Partial<ProductOffering>): Promise<ProductOffering> {
        const current = await this.offerings.require(id);
        const merged = mergePatch(current, patch);
        merged.id = id;
        merged['@type'] = 'ProductOffering';
        offeringLifecycle.assert(current.lifecycleStatus, merged.lifecycleStatus);
        const commercialChange = ['productOfferingPriceTable', 'productOfferingTerm', 'bundledProductOffering', 'earlyTerminationFee'].some(
            (k) => k in patch
        );
        if (commercialChange && current.lifecycleStatus !== 'inDraft') {
            throw notAllowed('Prices, terms and bundle content can only be edited while the offering is inDraft');
        }
        await this.validateOffering(merged);
        if (['productOfferingPriceTable', 'bundledProductOffering', 'earlyTerminationFee'].some((k) => k in patch)) {
            merged.productOfferingPrice = await this.buildPrices(merged);
        }
        merged.lastUpdate = this.clock.now().toISOString();
        const saved = await this.offerings.replace(merged);
        if (current.lifecycleStatus !== saved.lifecycleStatus) {
            await this.events.publish('ProductOfferingStateChangeEvent', {
                entityId: id,
                previousState: current.lifecycleStatus,
                newState: saved.lifecycleStatus,
            });
        }
        return saved;
    }

    /** POPs from the price tables, plus the early-termination fee when the offering asks for one. */
    private async buildPrices(offering: ProductOffering): Promise<ProductOfferingPrice[]> {
        const pops = await buildPOPs(offering, this.lookup, this.clock.now());
        const etf = offering.earlyTerminationFee;
        if (etf) {
            const rc = pops.find(
                (p) => p.priceType === 'recurringCharge' && !p.popRelationship?.length && p.price?.unit === etf.currency
            );
            if (!rc) throw invalid('An early termination fee needs a recurring charge in the same currency');
            pops.push({
                '@type': 'ProductOfferingPrice',
                id: `etf-${rc.id}`,
                name: 'Early termination fee',
                description: 'oneTimeFee delete, pay rest of term',
                lifecycleStatus: 'active',
                priceType: 'oneTimeFee',
                price: { unit: etf.currency, value: 0 },
                isTaxIncluded: etf.isTaxIncluded ?? rc.isTaxIncluded,
                taxRate: etf.taxRate ?? rc.taxRate,
                allowedAction: [{ action: 'delete' }],
                pricingLogicAlgorithm: [{ plaSpecId: 'earlyTerminationPayRestOfTerm', name: 'Pay rest of term' }],
                popRelationship: [{ id: rc.id, name: rc.name, relationshipType: 'appliesTo' }],
            });
        }
        return pops;
    }

    async deleteOffering(id: string): Promise<void> {
        const current = await this.offerings.require(id);
        offeringLifecycle.assert(current.lifecycleStatus, null);
        await this.offerings.delete(id);
    }

    private async validateOffering(o: ProductOffering): Promise<void> {
        if (!o.name?.trim()) throw invalid('name is required');
        if (o.validFor?.startDateTime && o.validFor.endDateTime && o.validFor.endDateTime <= o.validFor.startDateTime) {
            throw invalid('validFor.endDateTime must be after validFor.startDateTime');
        }
        if (o.productSpecification?.id) {
            const spec = await this.specs.get(o.productSpecification.id);
            if (!spec) throw invalid(`Product specification ${o.productSpecification.id} does not exist`);
            if (ORDERABLE.includes(o.lifecycleStatus) && !ORDERABLE.includes(spec.lifecycleStatus)) {
                throw invalid('An offering cannot be active while its specification is not active');
            }
        }
        const children = [
            ...(o.bundledProductOffering ?? []),
            ...(o.bundledGroupProductOffering ?? []).flatMap((g) => g.bundledProductOffering),
        ];
        if (o.isBundle && !children.length) throw invalid('A bundle offering needs at least one bundled offering');
        if (!o.isBundle && children.length) throw invalid('Only bundle offerings can contain bundled offerings');
        for (const child of children) {
            if (child.id === o.id && o.id) throw invalid('A bundle cannot contain itself');
            const found = await this.offerings.get(child.id);
            if (!found) throw invalid(`Bundled product offering ${child.id} does not exist`);
            if (found.isBundle) throw invalid('Nested bundles are not supported');
        }
        for (const term of o.productOfferingTerm ?? []) {
            if (!term.duration || !(term.duration.amount > 0)) throw invalid('Each term needs a positive duration');
        }
        for (const table of o.productOfferingPriceTable ?? []) {
            for (const row of table.tableData ?? []) {
                const amount = 'price' in row ? row.price?.value : (row as { alterationAmount?: number | null }).alterationAmount;
                if (amount !== undefined && amount !== null && amount < 0) throw invalid('Prices cannot be negative');
                if (row.priceType === 'oneTimeFee' && table['@type'].includes('Base') && !('action' in row && row.action)) {
                    throw invalid('A one-time fee needs the action it applies to');
                }
            }
            if (table['@type'] === 'SimpleProductOfferingBasePriceTable' || table['@type'] === 'BundleProductOfferingBasePriceTable') {
                const hasRc = (table.tableData ?? []).some((r) => r.priceType === 'recurringCharge');
                if (hasRc && !table.tableConfig.recurringChargePeriodType) {
                    throw invalid('A recurring charge needs a recurringChargePeriodType');
                }
            }
        }
    }
}
