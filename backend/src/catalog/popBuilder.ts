/**
 * Builds ProductOfferingPrices (POPs) from the price tables authored on an offering.
 *
 * Port of ts-polaris
 * `apps/productCatalogManagement/.../ProductOfferingPriceService.buildPOPs`:
 *   pass 1: base tables (simple and bundle) -> base POPs, indexed by priceType|currency
 *   pass 2: complex tables -> override / discount / markup POPs that reference a base POP,
 *           one per (row, column, price type, currency), plus one per range
 * Names and descriptions are generated exactly as the original does.
 */
import { randomUUID } from 'node:crypto';
import type {
    BasePriceItem,
    BundleBasePriceItem,
    BundleBasePriceTable,
    BundledPopRelationship,
    CharacteristicSpecification,
    CharacteristicValueEntry,
    ComplexPriceItem,
    ComplexPriceTable,
    PopRelationshipType,
    PriceItemRange,
    PriceTableHeaderItem,
    PriceTableRelationship,
    PriceType,
    ProdSpecCharValueUse,
    ProductOffering,
    ProductOfferingPrice,
    ProductOfferingTerm,
    QuantityTier,
    SimpleBasePriceTable,
} from '../common/model.ts';

const PREFIX: Partial<Record<PriceType, string>> = {
    oneTimeCharge: 'OTC',
    recurringCharge: 'RC',
    oneTimeFee: 'OTF',
};

interface BasePop {
    pop: ProductOfferingPrice;
    indexKey: string;
}
type BundledPopsMap = Record<string, Record<string, ProductOfferingPrice[]>>;

const key = (parts: unknown[]): string => parts.join('|');
const sanitize = (v: unknown): string => String(v ?? '').replace(/[\r\n\x00-\x1f]/g, '');

/** Looks up bundled child offerings; injected so the builder stays pure. */
export type OfferingLookup = (ids: string[]) => Promise<ProductOffering[]>;

export async function buildPOPs(
    offering: ProductOffering,
    lookup: OfferingLookup,
    now: Date = new Date()
): Promise<ProductOfferingPrice[]> {
    const pops: ProductOfferingPrice[] = [];
    const tables = offering.productOfferingPriceTable ?? [];
    if (!tables.length) return pops;
    const lastUpdate = now.toISOString();
    const baseByKey: Record<string, ProductOfferingPrice> = {};

    for (const table of tables) {
        let built: BasePop[] = [];
        if (table['@type'] === 'SimpleProductOfferingBasePriceTable') {
            built = fromSimpleBase(table, lastUpdate);
        } else if (table['@type'] === 'BundleProductOfferingBasePriceTable') {
            built = await fromBundleBase(table, lastUpdate, offering, lookup);
        }
        for (const { pop, indexKey } of built) {
            pops.push(pop);
            baseByKey[indexKey] = pop;
        }
    }
    for (const table of tables) {
        if (table['@type'] === 'SimpleProductOfferingComplexPriceTable') {
            pops.push(...fromComplex(table, lastUpdate, baseByKey, offering.prodSpecCharValueUse ?? []));
        } else if (table['@type'] === 'BundleProductOfferingComplexPriceTable') {
            pops.push(...fromComplex(table, lastUpdate, baseByKey, offering.productOfferingCharacteristic ?? []));
        }
    }
    return pops;
}

/* ---------- simple base ---------- */

function suffixes(
    item: { priceType: PriceType; action?: string },
    period?: string
): { action: string; period: string } {
    if (item.priceType === 'recurringCharge') return { action: '', period: ` ${period}` };
    if (item.priceType === 'oneTimeFee') return { action: ` ${item.action}`, period: '' };
    return { action: '', period: '' };
}

function fromSimpleBase(table: SimpleBasePriceTable, lastUpdate: string): BasePop[] {
    const result: BasePop[] = [];
    const cfg = table.tableConfig;
    for (const item of table.tableData ?? []) {
        if (!item.price) continue; // rows without a price are skipped
        const prefix = PREFIX[item.priceType];
        if (!prefix) throw new Error(`Invalid price type: ${sanitize(item.priceType)}`);
        const { action, period } = suffixes(item, cfg.recurringChargePeriodType);
        const pop: ProductOfferingPrice = {
            id: randomUUID(),
            lastUpdate,
            '@type': 'ProductOfferingPrice',
            name: `${prefix}${action} ${item.price.value} ${item.price.unit}${period}`,
            description: period
                ? `${item.priceType},${period}, currency ${item.price.unit}`
                : `${item.priceType}${action}, currency ${item.price.unit}`,
            isBundle: false,
            isPercentage: false,
            isRange: false,
            lifecycleStatus: 'active',
            price: item.price,
            priceType: item.priceType,
            version: '1',
            isTaxIncluded: cfg.isTaxIncluded,
            taxRate: cfg.taxRate,
        };
        applyTypeSpecifics(pop, item, cfg.recurringChargePeriodType);
        result.push({ pop, indexKey: key([item.priceType, item.price.unit ?? '']) });
    }
    return result;
}

function applyTypeSpecifics(
    pop: ProductOfferingPrice,
    item: BasePriceItem | BundleBasePriceItem,
    period: ProductOfferingPrice['recurringChargePeriodType']
): void {
    if (item.priceType === 'recurringCharge') {
        pop.recurringChargePeriodType = period;
    } else if (item.priceType === 'oneTimeFee' && item.action) {
        pop.allowedAction = [{ action: item.action }];
    }
}

/* ---------- bundle base ---------- */

function resolvePriceType(itemPriceType: PriceType, rel: PriceTableRelationship): PriceType {
    // overrides keep OTC/RC/OTF; otherwise the POP itself is a discount or a markup
    if (rel === 'overrides') return itemPriceType;
    if (rel === 'discount') return 'discount';
    if (rel === 'markup') return 'markup';
    throw new Error(`Unsupported price relationship type: ${sanitize(rel)}`);
}

async function fromBundleBase(
    table: BundleBasePriceTable,
    lastUpdate: string,
    offering: ProductOffering,
    lookup: OfferingLookup
): Promise<BasePop[]> {
    const result: BasePop[] = [];
    const cfg = table.tableConfig;
    const isPercentage = cfg.bundlePriceAdjustmentType === 'percentage';
    const isBundle = cfg.bundlePriceRelationshipType !== 'overrides';

    const childIds: string[] = [];
    for (const group of offering.bundledGroupProductOffering ?? []) {
        for (const o of group.bundledProductOffering) childIds.push(o.id);
    }
    for (const o of offering.bundledProductOffering ?? []) childIds.push(o.id);
    const childMap = groupChildBasePops(await lookup(childIds));

    for (const item of table.tableData ?? []) {
        const [available, relationships] = checkBundledRelationships(cfg, item, childMap, childIds);
        if (!available) continue;
        const prefix = PREFIX[item.priceType];
        if (!prefix) throw new Error(`Invalid price type: ${sanitize(item.priceType)}`);
        const { action, period } = suffixes(item, cfg.recurringChargePeriodType);
        const relSuffix = isBundle ? ` ${cfg.bundlePriceRelationshipType}` : '';
        const description = [
            period ? `${item.priceType},${period}` : `${item.priceType}${action}`,
            `${cfg.bundlePriceRelationshipType}`,
            ...(cfg.bundlePriceAdjustmentType ? [`${cfg.bundlePriceAdjustmentType}`] : []),
            `currency ${item.currency}`,
        ].join(', ');
        const pop: ProductOfferingPrice = {
            id: randomUUID(),
            lastUpdate,
            '@type': 'ProductOfferingPrice',
            name: `${prefix}${action}${relSuffix} ${item.alterationAmount}${isPercentage ? '%' : ''} ${item.currency}${period}`,
            description,
            isBundle,
            isPercentage,
            isRange: false,
            lifecycleStatus: 'active',
            price: isPercentage ? undefined : { unit: item.currency, value: item.alterationAmount },
            priceType: resolvePriceType(item.priceType, cfg.bundlePriceRelationshipType),
            version: '1',
            isTaxIncluded: cfg.isTaxIncluded,
            percentage: isPercentage ? item.alterationAmount : undefined,
            priceAlterationType: [isPercentage ? 'percentage' : 'fixed'],
            bundledPopRelationship: isBundle ? relationships : undefined,
        };
        applyTypeSpecifics(pop, item, cfg.recurringChargePeriodType);
        result.push({ pop, indexKey: key([item.priceType, item.currency]) });
    }
    return result;
}

/** Child base POPs (those without a popRelationship) grouped by isTaxIncluded|currency, then offering id. */
function groupChildBasePops(children: ProductOffering[]): BundledPopsMap {
    const map: BundledPopsMap = {};
    for (const child of children) {
        for (const pop of child.productOfferingPrice ?? []) {
            if (pop.popRelationship?.length) continue;
            const k = key([pop.isTaxIncluded, pop.price?.unit]);
            ((map[k] ??= {})[child.id] ??= []).push(pop);
        }
    }
    return map;
}

/**
 * Business rules (unchanged from the original):
 *  1. conflict on isTaxIncluded -> not available
 *  2. conflict on recurringChargePeriod -> not available
 *  3. a bundled offering has no POP in this currency -> not available
 *  4. a bundled offering lacks this priceType and the relationship is not override -> not available
 *  5. a bundled offering lacks this OTF action and the relationship is not override -> not available
 */
function checkBundledRelationships(
    cfg: BundleBasePriceTable['tableConfig'],
    item: BundleBasePriceItem,
    childMap: BundledPopsMap,
    childIds: string[]
): [boolean, BundledPopRelationship[]] {
    const isOverride = cfg.bundlePriceRelationshipType === 'overrides';
    const period = cfg.recurringChargePeriodType;
    const { priceType, action } = item;
    const byOffering = childMap[key([cfg.isTaxIncluded, item.currency])];
    if (!byOffering) return [false, []];
    if (new Set(Object.keys(byOffering)).size !== new Set(childIds).size) return [false, []];

    const hasAction = (pop: ProductOfferingPrice): boolean =>
        !!pop.allowedAction?.some((a) => a.action === action);
    const relationships: BundledPopRelationship[] = [];
    for (const pops of Object.values(byOffering)) {
        if (
            period &&
            priceType === 'recurringCharge' &&
            pops.some((p) => p.priceType === priceType && p.recurringChargePeriodType !== period)
        ) {
            return [false, []];
        }
        if (pops.every((p) => p.priceType !== priceType) && !isOverride) return [false, []];
        if (action && !pops.some(hasAction) && !isOverride) return [false, []];
        const match = pops.find(
            (p) =>
                p.priceType === priceType &&
                (priceType !== 'recurringCharge' || p.recurringChargePeriodType === period) &&
                (!action || hasAction(p))
        );
        if (!match) continue; // possible for overrides
        relationships.push({
            id: randomUUID(),
            '@type': 'BundledProductOfferingPriceRelationship',
            bundledProductOfferingPriceId: match.id,
            name: match.name,
            relationshipType: 'composedOf',
        });
    }
    return [true, relationships];
}

/* ---------- complex ---------- */

function specValueUseMap(source: (ProdSpecCharValueUse | CharacteristicSpecification)[]): Map<string, ProdSpecCharValueUse> {
    const map = new Map<string, ProdSpecCharValueUse>();
    for (const entry of source) {
        if (entry['@type'] === 'CharacteristicSpecification') {
            const spec = entry as CharacteristicSpecification;
            map.set(spec.id, {
                '@type': 'ProductSpecificationCharacteristicValueUse',
                name: spec.name,
                characteristicSpecificationRef: { id: spec.id, name: spec.name },
                productSpecCharacteristicValue: spec.characteristicValueSpecification,
            });
        } else {
            const use = entry as ProdSpecCharValueUse;
            const id = use.characteristicSpecificationRef?.id;
            if (id) map.set(id, use);
        }
    }
    return map;
}

function fromComplex(
    table: ComplexPriceTable,
    lastUpdate: string,
    baseByKey: Record<string, ProductOfferingPrice>,
    charSource: (ProdSpecCharValueUse | CharacteristicSpecification)[]
): ProductOfferingPrice[] {
    const result: ProductOfferingPrice[] = [];
    const cfg = table.tableConfig;
    const useMap = specValueUseMap(charSource);
    const relationshipType: PopRelationshipType = cfg.priceRelationshipType;
    if (!['overrides', 'discount', 'markup'].includes(relationshipType)) {
        throw new Error(`Unsupported priceRelationshipType for POP: ${sanitize(relationshipType)}`);
    }
    const isPercentage = cfg.priceAdjustmentType === 'percentage';

    for (const item of table.tableData ?? []) {
        const base = baseByKey[key([item.priceType, item.currency])];
        if (!base) continue; // no base price for this (priceType, currency): the row cannot be priced
        const preset: ProductOfferingPrice = {
            lastUpdate,
            id: randomUUID(),
            '@type': 'ProductOfferingPrice',
            isBundle: false,
            isRange: false,
            lifecycleStatus: 'active',
            priceType: resolvePriceType(item.priceType, cfg.priceRelationshipType),
            version: '1',
            isTaxIncluded: base.isTaxIncluded,
            taxRate: base.taxRate,
            applicationDuration: item.duration,
            recurringChargePeriodType: item.priceType === 'recurringCharge' ? base.recurringChargePeriodType : undefined,
            popRelationship: [
                { id: base.id, name: base.name, '@type': 'ProductOfferingPriceRelationship', relationshipType },
            ],
        };
        for (const { headers, index } of [
            { headers: cfg.tableRows, index: item.rowIndex },
            { headers: cfg.tableColumns, index: item.colIndex },
        ]) {
            if (index < 0) continue;
            for (const headerItem of headers?.[index]?.priceTableHeaderItems ?? []) {
                applyCondition(preset, headerItem, useMap);
            }
        }

        const built: ProductOfferingPrice[] = [];
        if (item.alterationAmount !== null && item.alterationAmount !== undefined) {
            built.push({
                ...preset,
                ...(isPercentage
                    ? { isPercentage: true, percentage: item.alterationAmount }
                    : { isPercentage: false, price: { unit: item.currency, value: item.alterationAmount } }),
            });
        }
        for (const range of item.ranges ?? []) {
            built.push({ ...preset, id: randomUUID(), ...rangeFields(range, item, isPercentage) });
        }

        const conditions = built.length ? describeConditions(built[0]!) : '';
        for (const pop of built) {
            pop.name = complexName(item, pop, conditions, relationshipType);
            pop.description = complexDescription(item, pop, conditions, relationshipType);
            pop.priceAlterationType = [
                pop.isPercentage ? (pop.isRange ? 'percentageRange' : 'percentage') : pop.isRange ? 'amountRange' : 'fixed',
            ];
        }
        result.push(...built);
    }
    return result;
}

function rangeFields(range: PriceItemRange, item: ComplexPriceItem, isPercentage: boolean): Partial<ProductOfferingPrice> {
    return isPercentage
        ? {
              isPercentage,
              isRange: true,
              rangeIntervalType: 'closedBottom',
              lowerPercentageLimit: range.lowerValue,
              upperPercentageLimit: range.upperValue,
          }
        : {
              isPercentage,
              isRange: true,
              rangeIntervalType: 'closedBottom',
              lowerValueLimit: range.lowerValue,
              upperValueLimit: range.upperValue,
              lowerPriceLimit: { unit: item.currency, value: range.lowerValue },
              upperPriceLimit: { unit: item.currency, value: range.upperValue },
          };
}

function applyCondition(
    preset: ProductOfferingPrice,
    condition: PriceTableHeaderItem,
    useMap: Map<string, ProdSpecCharValueUse>
): void {
    const values = condition.categoryValues;
    switch (condition.categoryName) {
        case 'Characteristic': {
            if (!values?.length) break;
            const first = values[0] as CharacteristicValueEntry;
            const specId = first.characteristicSpecificationRef?.id ?? '';
            const related = useMap.get(specId);
            if (!related) {
                throw new Error(
                    `Related ProductSpecificationCharacteristicValueUse not found for characteristic specification: ${sanitize(specId)}`
                );
            }
            const wanted = new Set(values.map((v) => (v as CharacteristicValueEntry).characteristicValueSpecificationId));
            const matched = related.productSpecCharacteristicValue?.filter((v) => wanted.has(v.id));
            if (!matched?.length) {
                throw new Error(
                    `Characteristic value specification not found for characteristic specification ${sanitize(specId)}. ` +
                        `Requested characteristic value specification IDs: ${sanitize([...wanted].join(', '))}`
                );
            }
            (preset.prodSpecCharValueUse ??= []).push({
                ...related,
                id: randomUUID(),
                productSpecCharacteristicValue: [...matched],
            });
            break;
        }
        case 'Terms':
            preset.productOfferingTerm ??= [];
            for (const term of values ?? []) preset.productOfferingTerm.push(term as ProductOfferingTerm);
            break;
        case 'QuantityTiers': {
            const tier = values?.[0] as QuantityTier | undefined;
            if (tier) {
                preset.lowerOrderQuantity = tier.lowerValue;
                const upper = tier.upperValue ?? -1;
                if (upper !== -1) preset.upperOrderQuantity = upper;
            }
            break;
        }
        default:
            throw new Error(`Unsupported category instance type: ${sanitize(condition.categoryName)}`);
    }
}

function describeConditions(pop: ProductOfferingPrice): string {
    const parts: string[] = [];
    if (pop.lowerOrderQuantity !== null && pop.lowerOrderQuantity !== undefined) {
        parts.push(`QuantityTiers(${pop.lowerOrderQuantity}-${pop.upperOrderQuantity ?? '*'})`);
    }
    if (pop.productOfferingTerm?.length) {
        parts.push(`Terms(${pop.productOfferingTerm.map((t) => `${t.duration?.amount} ${t.duration?.units}`).join(', ')})`);
    }
    for (const use of pop.prodSpecCharValueUse ?? []) {
        parts.push(`${use.name}(${(use.productSpecCharacteristicValue ?? []).map((v) => v.value).join(', ')})`);
    }
    return parts.join(' ');
}

function complexName(
    item: ComplexPriceItem,
    pop: ProductOfferingPrice,
    conditions: string,
    rel: PopRelationshipType
): string {
    let priceType = PREFIX[item.priceType];
    if (rel === 'discount' || rel === 'markup') {
        priceType = `${priceType} ${rel.charAt(0).toUpperCase()}${rel.slice(1)}`;
    }
    const value = pop.isPercentage
        ? pop.isRange
            ? `${pop.lowerPercentageLimit}%-${pop.upperPercentageLimit}%`
            : `${pop.percentage}%`
        : pop.isRange
          ? `${pop.lowerValueLimit}-${pop.upperValueLimit}`
          : `${pop.price?.value}`;
    return [priceType, value, item.currency, pop.recurringChargePeriodType, conditions].filter(Boolean).join(' ');
}

function complexDescription(
    item: ComplexPriceItem,
    pop: ProductOfferingPrice,
    conditions: string,
    rel: PopRelationshipType
): string {
    const priceType = rel === 'discount' || rel === 'markup' ? rel : item.priceType;
    return [priceType, pop.recurringChargePeriodType, `currency ${item.currency}`, conditions ? `match ${conditions}` : '']
        .filter(Boolean)
        .join(', ');
}
