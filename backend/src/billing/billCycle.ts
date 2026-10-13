/**
 * Bill cycle date maths.
 *
 * Port of ts-polaris `apps/billCalculation/.../helpers/createBillCycle.ts`
 * (CycleSchedule, findEndDate, calculateCycleEndDate, prepareBillCyclePayload).
 * All dates are UTC. A cycle ends one second before the next cycle boundary.
 */
import { DomainError } from '../common/errors.ts';
import { addDays } from '../common/runtime.ts';
import type { BillCycle, BillingAccount, BillingCycleSpecification } from '../common/model.ts';

const badRequest = (message: string): DomainError => new DomainError('BD-000002', message, 400);

/** Largest allowed day offset per frequency (monthly is capped at 29 because of February). */
const DAY_OFFSET_CAP: Record<BillingCycleSpecification['frequency'], number> = {
    monthly: 29,
    quarterly: 90,
    semiAnnually: 180,
    annually: 365,
};

/** Every cycle boundary in `startYear` and the year after, in chronological order. */
export function cycleBoundaries(
    frequency: BillingCycleSpecification['frequency'],
    offsetDays: number,
    startYear: number
): Date[] {
    if (offsetDays < 0) throw badRequest('Invalid request: Day offset cannot be negative');
    const cap = DAY_OFFSET_CAP[frequency];
    if (cap === undefined) throw badRequest('Unknown frequency: ' + frequency);
    if (offsetDays >= cap) throw badRequest('Day offset is greater than the maximum allowed for the frequency');

    const offsetDayOfMonth = offsetDays % 30;
    const offsetMonth = Math.floor(offsetDays / 30);
    let day: number;
    let months: number[];
    switch (frequency) {
        case 'monthly':
            day = offsetDays + 1;
            months = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
            break;
        case 'quarterly':
            day = offsetDayOfMonth + 1;
            months = [offsetMonth, offsetMonth + 3, offsetMonth + 6, offsetMonth + 9];
            break;
        case 'semiAnnually':
            day = offsetDayOfMonth + 1;
            months = [offsetMonth, offsetMonth + 6];
            break;
        case 'annually':
            day = offsetDayOfMonth + 1;
            months = [offsetMonth];
            break;
    }
    const out: Date[] = [];
    for (const year of [startYear, startYear + 1]) {
        for (const month of months) out.push(new Date(Date.UTC(year, month, day, 0, 0, 0)));
    }
    return out;
}

function findEndDate(frequency: BillingCycleSpecification['frequency'], offsetDays: number, start: Date): Date {
    const threshold = start.toISOString();
    for (const boundary of cycleBoundaries(frequency, offsetDays, start.getUTCFullYear())) {
        if (boundary.toISOString() > threshold) return new Date(boundary.getTime() - 1000);
    }
    throw new DomainError(
        'BD-000025',
        'No bill cycle found for the search criteria. Please create a bill cycle or disable the scheduled task',
        400
    );
}

const ISO_DATE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(.\d{3})?(Z|([+-]\d{2}(:\d{2})))$/;

/**
 * End of the cycle that contains `billCycleStartDateTime`. If that cycle is already
 * over, the end of the cycle that contains `now` is returned instead.
 */
export function calculateCycleEndDate(
    billCycleStartDateTime: string,
    spec: BillingCycleSpecification,
    now: Date
): string {
    if (!ISO_DATE.test(billCycleStartDateTime)) throw badRequest('billCycleStartDateTime is not a valid ISO date');
    const startDay = spec.billingCycleStartDay ?? 1;
    let end = findEndDate(spec.frequency, startDay - 1, new Date(Date.parse(billCycleStartDateTime)));
    if (end < now) end = findEndDate(spec.frequency, startDay - 1, now);
    return end.toISOString();
}

const capitalize = (s: string): string => s[0]!.toUpperCase() + s.slice(1);

export function prepareBillCycle(
    spec: BillingCycleSpecification,
    account: BillingAccount,
    endDateTime: string,
    startDateTime: string
): Omit<BillCycle, 'id'> {
    const end = new Date(Date.parse(endDateTime));
    const start = new Date(Date.parse(startDateTime));
    const period = { startDateTime: start.toISOString(), endDateTime: end.toISOString() };
    return {
        '@type': 'BillCycle',
        name: capitalize(spec.frequency) + ' Bill Cycle for ' + account.name,
        billingDate: addDays(end, spec.billingDateShift).toISOString(),
        billingPeriod: period,
        billingAccount: { id: account.id, name: account.name },
        BillCycleSpecification: { id: spec.id, name: spec.name },
        validFor: { ...period },
        paymentDueDate: addDays(end, spec.paymentDueDateOffset).toISOString(),
        mailingDate: addDays(end, spec.mailingDateOffset).toISOString(),
        creditDate: addDays(end, spec.creditDateOffset).toISOString(),
        chargeDate: addDays(end, spec.chargeDateOffset).toISOString(),
    };
}
