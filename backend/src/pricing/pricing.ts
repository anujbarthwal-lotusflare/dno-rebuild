/**
 * Price calculation.
 *
 * Port of ts-polaris `libs/priceCalculation`:
 *   priceFilter.ts               -> filterProductOfferingPrice (7 filters, same order)
 *   priceCalculationHelper.ts    -> applyBundlePriceForChild, construct* helpers
 *   priceAlterationCalculator.ts -> calculatePriceAfterAlteration
 *   DutyFreeAmountCalculator.ts  -> calculateDutyFreeAmount
 *   calculator.ts                -> one-time-fee matching, calculateDifference
 *   priceLogicAlgorithm.ts       -> early termination "pay rest of term"
 *   priceCalculationService.ts   -> buildProductPrice (incl. bundle parent handling)
 * `totalsFor` (tax-aware roll-up of an item) is new glue for the rebuild.
 */
import { Dec, roundMoney } from '../common/decimal.ts';
import { DomainError } from '../common/errors.ts';
import { DAY_MS } from '../common/runtime.ts';
import { splitTax } from '../tax/tax.ts';
import type {
    Characteristic,
    ItemAction,
    Money,
    OrderPrice,
    PriceAlteration,
    PriceType,
    Product,
    ProductOffering,
    ProductOfferingPrice,
    ProductOfferingTerm,
    ProductPrice,
    ProductTerm,
    RecurringChargePeriod,
    Ref,
} from '../common/model.ts';

const priceError = (code: string, message: string): DomainError => new DomainError(`PRICE-${code}`, message, 400);

const isAlteration = (t: PriceType): boolean => t === 'markup' || t === 'discount';
const isMajor = (t: PriceType): boolean => t === 'oneTimeCharge' || t === 'recurringCharge';

export interface ProductConfig {
    quantity: number;
    currency: string;
    characteristic?: Characteristic[];
    productTerm?: ProductTerm[];
}

/* ---------- filtering ---------- */

export function getMatchedProductOfferingTerm(
    offeringTerms: ProductOfferingTerm[] | undefined,
    configTerms: ProductTerm[] | undefined
): ProductOfferingTerm | undefined {
    if (!offeringTerms?.length || !configTerms?.length) return undefined;
    return offeringTerms.find((t) =>
        configTerms.some((c) => c.duration.amount === t.duration.amount && c.duration.units === t.duration.units)
    );
}

export interface FilterOutcome {
    prices: ProductOfferingPrice[];
    /** POP id -> reason it was dropped (same reason strings as the original). */
    failedReasonById: Record<string, string>;
}

export function filterProductOfferingPrice(all: ProductOfferingPrice[], config: ProductConfig): FilterOutcome {
    const failed: Record<string, string> = {};
    const { productTerm, quantity, currency, characteristic } = config;

    // 1. term
    let prices = all.filter((p) => {
        if (!p.productOfferingTerm?.length) {
            if (!productTerm?.length) return true;
            failed[p.id] = 'failedFilterByTerm';
            return false;
        }
        const ok = !!getMatchedProductOfferingTerm(p.productOfferingTerm, productTerm);
        if (!ok) failed[p.id] = 'failedFilterByTerm';
        return ok;
    });

    // 2. quantity tier
    const byQuantity = prices.filter((p) => {
        const lower = p.lowerOrderQuantity !== undefined ? Number(p.lowerOrderQuantity) : undefined;
        const upper = p.upperOrderQuantity !== undefined ? Number(p.upperOrderQuantity) : undefined;
        return (lower === undefined || quantity >= lower) && (upper === undefined || quantity <= upper);
    });
    if (!byQuantity.length) prices.forEach((p) => (failed[p.id] = 'failedFilterByQuantity'));
    prices = byQuantity;

    // 3. currency (percentage POPs carry no currency and always pass)
    prices = prices.filter((p) => {
        const ok = !p.price?.unit || p.price.unit === currency;
        if (!ok) failed[p.id] = 'failedFilterByCurrency';
        return ok;
    });

    // 4. characteristic: every characteristic the POP is conditioned on must be selected
    prices = prices.filter((p) => {
        const uses = p.prodSpecCharValueUse;
        if (!uses?.length) return true;
        if (!characteristic?.length) {
            failed[p.id] = 'failedFilterByCharacteristic';
            return false;
        }
        for (const use of uses) {
            const values = use.productSpecCharacteristicValue;
            if (!values) continue;
            const selected = characteristic.filter(
                (c) => c.characteristicSpecificationRef?.id === use.characteristicSpecificationRef?.id
            );
            const matches = values.some((pv) =>
                selected.some((uc) => {
                    if (uc.characteristicValueSpecificationRef?.id && pv.characteristicValueSpecificationRef?.id) {
                        return uc.characteristicValueSpecificationRef.id === pv.characteristicValueSpecificationRef.id;
                    }
                    // rebuild addition: also accept a match on the value-specification id itself
                    if (uc.characteristicValueSpecificationRef?.id && uc.characteristicValueSpecificationRef.id === pv.id) {
                        return true;
                    }
                    return (
                        JSON.stringify(uc.value) === JSON.stringify(pv.value) && uc.unitOfMeasure === pv.unitOfMeasure
                    );
                })
            );
            if (!matches) {
                failed[p.id] = 'failedFilterByCharacteristic';
                return false;
            }
        }
        return true;
    });

    // 5. one-time fees are priced separately, per action
    prices = prices.filter((p) => {
        if (p.priceType !== 'oneTimeFee') return true;
        failed[p.id] = 'failedFilterByOneTimeFeePrice';
        return false;
    });

    // 6. at most one OTC and one RC
    const seenMajor = new Set<string>();
    prices = prices.filter((p) => {
        if (!isMajor(p.priceType)) return true;
        if (!seenMajor.has(p.priceType)) {
            seenMajor.add(p.priceType);
            return true;
        }
        failed[p.id] = 'failedFilterMajorPriceUnique';
        return false;
    });

    // 7. alterations must point at a surviving major price
    const majorIds = new Set(prices.filter((p) => isMajor(p.priceType)).map((p) => p.id));
    prices = prices.filter((p) => {
        if (!isAlteration(p.priceType)) return true;
        const ok = p.popRelationship?.some((r) => r.id && majorIds.has(r.id)) ?? false;
        if (!ok) failed[p.id] = 'failedFilterAlterationPrice';
        return ok;
    });

    return { prices, failedReasonById: failed };
}

/**
 * Complex-table "overrides" POPs keep the base price type and point at the base POP.
 * When one survives filtering it replaces the base POP it overrides.
 * (Rebuild addition: the original resolves overrides in productOrderingUtils, which was not ported.)
 */
export function applyOverrides(all: ProductOfferingPrice[], config: ProductConfig): ProductOfferingPrice[] {
    const overrides = all.filter((p) => p.popRelationship?.some((r) => r.relationshipType === 'overrides'));
    if (!overrides.length) return all;
    const replaced = new Set<string>();
    const winners: ProductOfferingPrice[] = [];
    for (const o of overrides) {
        const baseId = o.popRelationship!.find((r) => r.relationshipType === 'overrides')!.id;
        const candidate = { ...o, popRelationship: undefined };
        const survives = filterProductOfferingPrice([candidate], config).prices.length === 1;
        if (survives && !replaced.has(baseId)) {
            replaced.add(baseId);
            winners.push({ ...candidate, id: o.id });
            // alterations that pointed at the base now point at the override
            all = all.map((p) =>
                p.popRelationship?.some((r) => r.id === baseId && r.relationshipType !== 'overrides')
                    ? { ...p, popRelationship: p.popRelationship.map((r) => (r.id === baseId ? { ...r, id: o.id } : r)) }
                    : p
            );
        }
    }
    const overrideIds = new Set(overrides.map((o) => o.id));
    return [...all.filter((p) => !overrideIds.has(p.id) && !replaced.has(p.id)), ...winners];
}

/* ---------- bundle handling ---------- */

/** Drop child POPs a bundle nullifies, then append the bundle's own discounts/markups. */
export function applyBundlePriceForChild(
    childPops: ProductOfferingPrice[],
    bundlePops: ProductOfferingPrice[]
): ProductOfferingPrice[] {
    if (!childPops.length) return childPops;
    let filtered = childPops;
    if (bundlePops.length) {
        const relsByChildPop = new Map<string, string[]>();
        for (const bp of bundlePops) {
            for (const rel of bp.bundledPopRelationship ?? []) {
                const list = relsByChildPop.get(rel.bundledProductOfferingPriceId) ?? [];
                list.push(rel.relationshipType);
                relsByChildPop.set(rel.bundledProductOfferingPriceId, list);
            }
        }
        filtered = childPops.filter((p) => (relsByChildPop.get(p.id) ?? []).every((t) => t !== 'nullify'));
    }
    if (!filtered.length) return filtered;
    const bundleAlterations = bundlePops
        .filter((bp) => isAlteration(bp.priceType))
        .map((bp) => {
            // a bundle alteration applies to the child POPs it is composedOf
            const targets = (bp.bundledPopRelationship ?? []).map((r) => r.bundledProductOfferingPriceId);
            const hit = filtered.filter((p) => targets.includes(p.id));
            return hit.length
                ? {
                      ...bp,
                      popRelationship: hit.map((p) => ({ id: p.id, name: p.name, relationshipType: bp.priceType as 'discount' | 'markup' })),
                  }
                : bp;
        });
    return filtered.concat(bundleAlterations);
}

/* ---------- constructing ProductPrice ---------- */

const termRef = (t?: ProductOfferingTerm): Ref | undefined => (t?.id ? { id: t.id, name: t.name } : undefined);

export function constructSingleProductPrice(pop: ProductOfferingPrice, term?: ProductOfferingTerm): ProductPrice {
    const pp: ProductPrice = {
        '@type': 'ProductPrice',
        description: pop.description,
        productOfferingPrice: { id: pop.id, name: pop.name },
        name: pop.name,
        priceType: pop.priceType,
        price: { '@type': 'Price', dutyFreeAmount: pop.price, taxRate: pop.taxRate },
        isTaxIncluded: pop.isTaxIncluded,
        isRange: pop.isRange,
        lowerValueLimit: pop.lowerValueLimit,
        upperValueLimit: pop.upperValueLimit,
        productOfferingTerm: termRef(term),
    };
    if (pop.priceType === 'recurringCharge') {
        pp.recurringChargePeriod = pop.recurringChargePeriodType;
        pp.chargeType = pop.chargeType;
    } else if (pop.priceType === 'oneTimeCharge') {
        pp.isPaymentPlanAllowed = pop.isPaymentPlanAllowed;
    }
    return pp;
}

export function constructPriceAlteration(
    alteration: ProductOfferingPrice,
    target?: ProductOfferingPrice,
    term?: ProductOfferingTerm
): PriceAlteration {
    const pa: PriceAlteration = {
        '@type': 'PriceAlteration',
        id: alteration.id,
        name: alteration.name,
        priority: alteration.priority,
        isRange: alteration.isRange,
        lowerPercentageLimit: alteration.lowerPercentageLimit,
        upperPercentageLimit: alteration.upperPercentageLimit,
        lowerAmountLimit: alteration.lowerPriceLimit,
        upperAmountLimit: alteration.upperPriceLimit,
        productOfferingPrice: { id: alteration.id, name: alteration.name },
        price: { '@type': 'Price', dutyFreeAmount: alteration.price, percentage: alteration.percentage },
        priceType: alteration.priceType,
        isPercentage: alteration.isPercentage,
        lowerValueLimit: alteration.lowerValueLimit,
        upperValueLimit: alteration.upperValueLimit,
        productOfferingTerm: termRef(term),
    };
    if (target?.priceType === 'recurringCharge') {
        pa.applicationDuration = alteration.applicationDuration ?? alteration.recurringChargePeriodLength;
        pa.recurringChargePeriod = alteration.recurringChargePeriodType;
    }
    return pa;
}

export function constructProductPriceWithAlteration(
    pops: ProductOfferingPrice[],
    productTerm?: ProductTerm[]
): ProductPrice[] {
    if (!pops.length) return [];
    const alterationsByTarget = new Map<string, ProductOfferingPrice[]>();
    for (const p of pops) {
        if (!isAlteration(p.priceType)) continue;
        for (const rel of p.popRelationship ?? []) {
            const list = alterationsByTarget.get(rel.id) ?? [];
            list.push(p);
            alterationsByTarget.set(rel.id, list);
        }
    }
    return pops
        .filter((p) => !isAlteration(p.priceType))
        .map((p) => {
            const result = constructSingleProductPrice(p, getMatchedProductOfferingTerm(p.productOfferingTerm, productTerm));
            result.priceAlteration = (alterationsByTarget.get(p.id) ?? []).map((a) =>
                constructPriceAlteration(a, p, getMatchedProductOfferingTerm(a.productOfferingTerm, productTerm))
            );
            return result;
        });
}

/* ---------- applying alterations ---------- */

function groupByPriority(list: PriceAlteration[], fallback: number): Map<number, PriceAlteration[]> {
    const map = new Map<number, PriceAlteration[]>();
    for (const a of list) {
        const p = a.priority ?? fallback;
        const group = map.get(p) ?? [];
        group.push(a);
        map.set(p, group);
    }
    return map;
}

const alterationAmount = (a: PriceAlteration, base: Dec): Dec =>
    a.isPercentage ? base.mul(Dec.of(a.price.percentage ?? 0).div(100)) : Dec.of(a.price.dutyFreeAmount?.value ?? 0);

/**
 * All markups first (lowest priority number first; alterations sharing a priority are
 * summed against the same running price), then all discounts the same way.
 */
export function calculatePriceAfterAlteration(alterations: PriceAlteration[], price: number): number {
    const apply = (type: 'markup' | 'discount', start: Dec): Dec => {
        const byPriority = groupByPriority(alterations.filter((a) => a.priceType === type), -1);
        let running = start;
        for (const priority of [...byPriority.keys()].sort((a, b) => a - b)) {
            const layer = byPriority.get(priority)!.reduce((sum, a) => sum.plus(alterationAmount(a, running)), Dec.ZERO);
            running = type === 'discount' ? running.minus(layer) : running.plus(layer);
        }
        return running;
    };
    return apply('discount', apply('markup', Dec.of(price))).toDP(2).toNumber();
}

/**
 * Variant used for duty-free amounts: per priority layer, markups then discounts,
 * each computed against the amount at the start of its half-layer.
 */
export function calculateDutyFreeAmount(
    dutyFreeAmount: Money | undefined,
    alterations: PriceAlteration[] = [],
    quantity = 1,
    decimalPlaces = 2
): Money {
    let current = Dec.of(dutyFreeAmount?.value ?? 0);
    let base = current;
    const layers = groupByPriority(alterations, 0);
    for (const priority of [...layers.keys()].sort((a, b) => a - b)) {
        const layer = layers.get(priority)!;
        for (const a of layer.filter((x) => x.priceType === 'markup')) {
            const pct = a.price?.percentage;
            current = pct ? current.plus(base.mul(pct).div(100)) : current.plus(a.price?.dutyFreeAmount?.value ?? 0);
        }
        base = current;
        for (const a of layer.filter((x) => x.priceType === 'discount')) {
            const pct = a.price?.percentage;
            current = pct ? current.minus(base.mul(pct).div(100)) : current.minus(a.price?.dutyFreeAmount?.value ?? 0);
        }
        base = current;
    }
    return { value: current.mul(quantity).toDP(decimalPlaces).toNumber(), unit: dutyFreeAmount?.unit ?? '' };
}

/* ---------- one-time fees ---------- */

const PERIOD_DAYS: Record<RecurringChargePeriod, number> = {
    yearly: 365.25,
    semiAnnually: 365.25 / 2,
    quarterly: 365.25 / 4,
    monthly: 365.25 / 12,
    daily: 1,
};
export const periodMillis = (p: RecurringChargePeriod, length = 1): Dec => Dec.of(PERIOD_DAYS[p]).mul(DAY_MS).mul(length);

/** Early termination: remaining term time / charge period x recurring price. */
export function earlyTerminationPayRestOfTerm(
    product: Product | undefined,
    target: ProductOfferingPrice | undefined,
    action: ItemAction,
    now: Date
): number {
    if (action === 'add' || !target?.recurringChargePeriodType || !target.price) return 0;
    const ends = (product?.productTerm ?? [])
        .map((t) => (t.validFor?.endDateTime ? new Date(t.validFor.endDateTime).getTime() : NaN))
        .filter((t) => !Number.isNaN(t));
    if (!ends.length) return 0;
    const remaining = Dec.of(Math.max(...ends)).minus(now.getTime());
    if (remaining.lte(0)) return 0;
    return remaining.div(periodMillis(target.recurringChargePeriodType)).mul(target.price.value).toDP(2).toNumber();
}

export interface OneTimeFeeResult {
    money: Money;
    productOfferingPriceId?: string;
    name?: string;
    taxRate?: number;
    isTaxIncluded?: boolean;
}

/**
 * Finds the single one-time fee that applies to `action` (and channel, when the fee
 * restricts channels) and computes it. A fee with a pricing algorithm is only
 * charged on modify/delete and only when the product actually carries the price it
 * `appliesTo`.
 */
export function calculateOneTimeFee(
    offering: ProductOffering,
    params: { quantity: number; currency: string; action: ItemAction; channel?: Ref },
    product: Product | undefined,
    now: Date
): OneTimeFeeResult {
    const pops = offering.productOfferingPrice ?? [];
    const zero: OneTimeFeeResult = { money: { value: 0, unit: params.currency } };
    let matched: ProductOfferingPrice | undefined;
    let target: ProductOfferingPrice | undefined;
    for (const pop of pops) {
        if (pop.priceType !== 'oneTimeFee' || pop.price?.unit !== params.currency) continue;
        const actionOk = (pop.allowedAction ?? []).some(
            (a) =>
                a.action === params.action &&
                // the original always requires a channel match; fees authored without channels apply to every channel
                (!a.channel?.length || a.channel.some((c) => c.id === params.channel?.id))
        );
        if (!actionOk) continue;
        const fixed = !pop.pricingLogicAlgorithm?.length;
        if (!fixed && params.action !== 'add') {
            const rel = pop.popRelationship?.find((r) => r.relationshipType === 'appliesTo');
            // the product may carry the price itself or a term/tier-specific price that overrides it
            const carriedPop = pops.find(
                (p) =>
                    p.price?.unit === params.currency &&
                    (p.id === rel?.id || p.popRelationship?.some((r) => r.relationshipType === 'overrides' && r.id === rel?.id)) &&
                    product?.productPrice?.some((pp) => pp.productOfferingPrice?.id === p.id)
            );
            if (!rel || !carriedPop) continue;
            if (carriedPop.priceType !== 'recurringCharge' || !carriedPop.recurringChargePeriodType) {
                throw priceError('INVALID_PRODUCT_OFFERING_PRICE', 'A fee algorithm must apply to a recurring charge');
            }
            target = carriedPop;
        }
        if (matched) {
            throw priceError(
                'INVALID_PRODUCT_OFFERING_PRICE',
                `Multiple oneTimeFee price matched, firstMatchedId: ${matched.id}, secondMatchedId: ${pop.id}`
            );
        }
        matched = pop;
    }
    if (!matched) return zero;

    let value = matched.price?.value ?? 0;
    const algorithm = matched.pricingLogicAlgorithm?.[0];
    if (algorithm) {
        if (algorithm.plaSpecId !== 'earlyTerminationPayRestOfTerm') {
            throw priceError('INVALID_PRICE_ALGORITHM_PLASPECID', `Unknown pricing algorithm ${algorithm.plaSpecId}`);
        }
        value = earlyTerminationPayRestOfTerm(product, target, params.action, now);
    }
    if (matched.appliesOn === 'quantity') value = roundMoney(Dec.of(value).mul(params.quantity));
    return {
        money: { value, unit: matched.price!.unit },
        productOfferingPriceId: matched.id,
        name: matched.name,
        taxRate: matched.taxRate,
        isTaxIncluded: matched.isTaxIncluded,
    };
}

/* ---------- quote vs subscription difference ---------- */

export interface CharacteristicDifference {
    characteristicSpecName: string;
    characteristicSpecId: string;
    originalValue: unknown;
    currentValue: unknown;
}
export interface ItemDifference {
    action: ItemAction;
    quantityDifference?: number;
    characteristicDifference?: CharacteristicDifference[];
}

export function calculateDifference(
    original: Product,
    action: ItemAction,
    currentCharacteristics: Characteristic[],
    currentQuantity: number,
    parentQuantity = 1,
    parentModified = false
): ItemDifference {
    if (action === 'delete') return { action: 'delete', quantityDifference: currentQuantity * parentQuantity };
    const quantityDifference = currentQuantity * parentQuantity - original.quantity;
    const characteristicDifference: CharacteristicDifference[] = [];
    for (const orig of original.productCharacteristic ?? []) {
        const cur = currentCharacteristics.find(
            (c) =>
                c.characteristicSpecificationRef?.id &&
                c.characteristicSpecificationRef.id === orig.characteristicSpecificationRef?.id
        );
        const same = cur && (orig.id !== undefined ? orig.id === cur.id : JSON.stringify(orig.value) === JSON.stringify(cur.value));
        if (same) continue;
        characteristicDifference.push({
            characteristicSpecName: orig.name,
            characteristicSpecId: orig.characteristicSpecificationRef?.id ?? '',
            originalValue: orig.value,
            currentValue: cur?.value,
        });
    }
    if (quantityDifference === 0 && !characteristicDifference.length && !parentModified) return { action: 'noChange' };
    return { action: 'modify', quantityDifference, characteristicDifference };
}

/* ---------- build product prices for a set of items ---------- */

export interface BuildPriceItem {
    id: string;
    offering: ProductOffering;
    config: ProductConfig;
    /** id of the bundle item this item is a child of, if any. */
    parentItemId?: string;
}

export function buildProductPrices(items: BuildPriceItem[]): Map<string, ProductPrice[]> {
    const byId = new Map(items.map((i) => [i.id, i]));
    const out = new Map<string, ProductPrice[]>();
    for (const item of items) {
        let pops = item.offering.productOfferingPrice ?? [];
        if (!pops.length) {
            out.set(item.id, []);
            continue;
        }
        if (item.parentItemId) {
            const parent = byId.get(item.parentItemId);
            if (!parent) throw priceError('INVALID', `Relationship item ${item.parentItemId} not found, id: ${item.id}`);
            pops = applyBundlePriceForChild(pops, parent.offering.productOfferingPrice ?? []);
        }
        pops = applyOverrides(pops, item.config);
        const { prices } = filterProductOfferingPrice(pops, item.config);
        out.set(item.id, constructProductPriceWithAlteration(prices, item.config.productTerm));
    }
    return out;
}

/* ---------- totals ---------- */

/** Unit amount of one ProductPrice after its alterations (range alterations need an explicit value and are skipped). */
export function unitAmount(pp: ProductPrice): number {
    const base = pp.price.dutyFreeAmount?.value ?? pp.price.taxIncludedAmount?.value ?? 0;
    const alterations = (pp.priceAlteration ?? []).filter((a) => !a.isRange);
    const final = alterations.length ? calculatePriceAfterAlteration(alterations, base) : base;
    return Math.max(final, 0);
}

export interface ChargeAmount {
    taxExcluded: number;
    taxIncluded: number;
    tax: number;
    taxRate: number;
    unit: string;
}

/** Total of one ProductPrice for a quantity, split into tax-excluded / tax-included. */
export function chargeAmount(pp: ProductPrice, quantity: number, defaultTaxRate: number, precision = 2): ChargeAmount {
    const amount = roundMoney(Dec.of(unitAmount(pp)).mul(quantity), precision);
    const taxRate = pp.price.taxRate ?? defaultTaxRate;
    const split = splitTax(amount, taxRate, !!pp.isTaxIncluded, precision);
    return { ...split, taxRate, unit: pp.price.dutyFreeAmount?.unit ?? pp.price.taxIncludedAmount?.unit ?? '' };
}

/** Roll product prices up into one total per price type (and recurring period). */
export function totalsFor(prices: ProductPrice[], quantity: number, defaultTaxRate: number, precision = 2): OrderPrice[] {
    const groups = new Map<string, OrderPrice & { _ex: Dec; _in: Dec }>();
    for (const pp of prices) {
        const c = chargeAmount(pp, quantity, defaultTaxRate, precision);
        const k = `${pp.priceType}|${pp.recurringChargePeriod ?? ''}`;
        const g =
            groups.get(k) ??
            ({ priceType: pp.priceType, recurringChargePeriod: pp.recurringChargePeriod, price: {}, _ex: Dec.ZERO, _in: Dec.ZERO } as OrderPrice & {
                _ex: Dec;
                _in: Dec;
            });
        g._ex = g._ex.plus(c.taxExcluded);
        g._in = g._in.plus(c.taxIncluded);
        g.price = {
            dutyFreeAmount: { unit: c.unit, value: g._ex.toDP(precision).toNumber() },
            taxIncludedAmount: { unit: c.unit, value: g._in.toDP(precision).toNumber() },
            taxRate: c.taxRate,
        };
        groups.set(k, g);
    }
    return [...groups.values()].map(({ _ex, _in, ...rest }) => rest);
}

export function sumTotals(lists: OrderPrice[][]): OrderPrice[] {
    const groups = new Map<string, OrderPrice>();
    for (const list of lists) {
        for (const t of list) {
            const k = `${t.priceType}|${t.recurringChargePeriod ?? ''}`;
            const g = groups.get(k);
            if (!g) {
                groups.set(k, structuredClone(t));
                continue;
            }
            for (const f of ['dutyFreeAmount', 'taxIncludedAmount'] as const) {
                if (t.price[f]) {
                    g.price[f] = { unit: t.price[f].unit, value: roundMoney(Dec.of(g.price[f]?.value ?? 0).plus(t.price[f].value)) };
                }
            }
        }
    }
    return [...groups.values()];
}
