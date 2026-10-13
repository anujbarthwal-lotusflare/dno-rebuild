/**
 * Tax calculation.
 *
 * Port of the Lua tax service's built-in percentage provider
 * (`services/tax/tax_provider/lf_tax/LFTaxHelper.lua`, `tax/TaxHelper.lua`,
 * `tax/operator_impl/Default.lua`). External providers (Ceretax, ETSI) are not rebuilt.
 */
import { Dec } from '../common/decimal.ts';
import { DomainError } from '../common/errors.ts';

export interface TaxRequest {
    /** Amount to tax. */
    amount: number | string;
    /** Tax rate in percent, e.g. 18 for 18%. */
    value: number | string;
    /** True when `amount` already contains the tax. */
    tax_inclusive?: boolean;
    calculation_type?: 'PERCENTAGE';
}

export interface TaxResult {
    gross_amount: string;
    service_amount: string;
    total_tax_amount: string;
    sales_tax: string;
    state_and_local_sales_tax: string;
}

const taxError = (code: string, message: string): DomainError => new DomainError(`TAX-${code}`, message, 400);

export function validateTaxRequest(requestId: string, req: TaxRequest): void {
    if ((req.calculation_type ?? 'PERCENTAGE') !== 'PERCENTAGE') {
        throw taxError('INVALID_REQUEST', `Only PERCENTAGE calculation_type is supported (request ${requestId})`);
    }
    for (const field of ['value', 'amount'] as const) {
        if (req[field] === undefined || req[field] === null || req[field] === '') {
            throw taxError('INVALID_REQUEST', `Tax request ${requestId} is missing required field ${field}`);
        }
    }
}

/**
 * Inclusive: net = amount / (1 + rate), rounded; tax = amount - net.
 * Exclusive: tax = amount * rate, rounded; gross = amount + tax.
 */
export function calculateTax(req: TaxRequest, precision = 2): TaxResult {
    const amount = Dec.of(req.amount);
    const ratePercent = Dec.of(req.value).div(100);
    let service: Dec;
    let tax: Dec;
    let gross: Dec;
    if (req.tax_inclusive) {
        service = amount.div(Dec.of(1).plus(ratePercent)).toDP(precision);
        tax = amount.minus(service);
        gross = amount;
    } else {
        service = amount;
        tax = amount.mul(ratePercent).toDP(precision);
        gross = amount.plus(tax);
    }
    const result: TaxResult = {
        gross_amount: gross.toString(),
        service_amount: service.toString(),
        total_tax_amount: tax.toString(),
        sales_tax: '0',
        state_and_local_sales_tax: '0',
    };
    assertTaxNotAboveAmount(req.amount, result.total_tax_amount, !!req.tax_inclusive, precision);
    return result;
}

/** TaxHelper.validate_tax_amount: for inclusive prices the tax can never exceed the item price. */
export function assertTaxNotAboveAmount(
    amount: number | string,
    taxAmount: number | string,
    taxInclusive: boolean,
    precision: number
): void {
    if (!taxInclusive) return;
    const a = Dec.of(amount).toDP(precision).abs();
    const t = Dec.of(taxAmount).toDP(precision).abs();
    if (t.gt(a)) throw taxError('TAX_AMOUNT_EXCEEDS_ITEM_PRICE', 'Tax amount exceeds item price');
}

export interface BulkTaxResponse {
    tax_items: Record<string, TaxResult>;
    tax_total: TaxResult;
}

/** Bulk variant: per-request results plus quantized totals (LFTaxHelper.transform_tax_response). */
export function calculateTaxBulk(requests: Record<string, TaxRequest>, precision = 2): BulkTaxResponse {
    const keys: (keyof TaxResult)[] = [
        'gross_amount',
        'service_amount',
        'total_tax_amount',
        'sales_tax',
        'state_and_local_sales_tax',
    ];
    const totals: Record<string, Dec> = Object.fromEntries(keys.map((k) => [k, Dec.ZERO]));
    const tax_items: Record<string, TaxResult> = {};
    for (const [requestId, req] of Object.entries(requests)) {
        validateTaxRequest(requestId, req);
        const r = calculateTax(req, precision);
        const item = {} as TaxResult;
        for (const k of keys) {
            totals[k] = totals[k]!.plus(r[k]);
            item[k] = Dec.of(r[k]).toFixed(precision);
        }
        tax_items[requestId] = item;
    }
    const tax_total = {} as TaxResult;
    for (const k of keys) tax_total[k] = totals[k]!.toFixed(precision);
    return { tax_items, tax_total };
}

/** Convenience used by pricing and billing: split an amount into tax-excluded / tax-included numbers. */
export function splitTax(
    amount: number,
    ratePercent: number,
    taxInclusive: boolean,
    precision = 2
): { taxExcluded: number; taxIncluded: number; tax: number } {
    const r = calculateTax({ amount, value: ratePercent, tax_inclusive: taxInclusive }, precision);
    return {
        taxExcluded: Dec.of(r.service_amount).toNumber(),
        taxIncluded: Dec.of(r.gross_amount).toNumber(),
        tax: Dec.of(r.total_tax_amount).toNumber(),
    };
}
