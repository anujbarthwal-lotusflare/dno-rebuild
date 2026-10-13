import { settings } from './settings.ts';

const pad = (n: number): string => String(n).padStart(2, '0');

function partsIn(iso: string, timeZone: string) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return undefined;
    const f = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
        weekday: 'long',
    });
    const get = (t: string) => f.formatToParts(d).find((p) => p.type === t)?.value ?? '';
    return { y: get('year'), m: get('month'), d: get('day'), h: Number(get('hour')), min: get('minute'), s: get('second'), weekday: get('weekday') };
}

function safeZone(): string {
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: settings.timezone });
        return settings.timezone;
    } catch {
        return 'UTC';
    }
}

/** Date in the agent's format, e.g. 31-12-2020. */
export function fmtDate(iso: unknown): string {
    if (typeof iso !== 'string' || !iso) return '';
    const p = partsIn(iso, safeZone());
    if (!p) return String(iso);
    if (settings.dateFormat === 'MM-DD-YYYY') return `${p.m}-${p.d}-${p.y}`;
    if (settings.dateFormat === 'YYYY-MM-DD') return `${p.y}-${p.m}-${p.d}`;
    return `${p.d}-${p.m}-${p.y}`;
}

/** Time in the agent's format: 13:00 or 1:00 PM. */
export function fmtTime(iso: unknown, seconds = false): string {
    if (typeof iso !== 'string' || !iso) return '';
    const p = partsIn(iso, safeZone());
    if (!p) return '';
    const sec = seconds ? `:${p.s}` : '';
    if (settings.timeFormat === '12') {
        const h = p.h % 12 || 12;
        return `${h}:${p.min}${sec} ${p.h < 12 ? 'AM' : 'PM'}`;
    }
    return `${pad(p.h)}:${p.min}${sec}`;
}

export function fmtDateTime(iso: unknown, seconds = false): string {
    if (typeof iso !== 'string' || !iso) return '';
    const d = fmtDate(iso);
    return d ? `${d} ${fmtTime(iso, seconds)}` : '';
}

export function weekday(iso: string): string {
    return partsIn(iso, safeZone())?.weekday ?? '';
}

/** "2026-07-20" in the agent's time zone, for date inputs. */
export function isoDay(iso: string): string {
    const p = partsIn(iso, safeZone());
    return p ? `${p.y}-${p.m}-${p.d}` : '';
}

const SYMBOL: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', INR: '₹' };

/** $28.85 for USD, ZAR 0.00 for currencies without a symbol (as the Wallet tile shows them). */
export function fmtMoney(value: unknown, currency = 'USD'): string {
    if (value && typeof value === 'object') {
        const v = value as { value?: number; currency?: string; unit?: string };
        return fmtMoney(v.value, v.currency ?? v.unit ?? currency);
    }
    const n = Number(value);
    if (!Number.isFinite(n)) return '';
    const amount = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const sign = n < 0 ? '-' : '';
    const sym = SYMBOL[currency];
    return sym ? `${sign}${sym}${amount}` : `${currency} ${sign}${amount}`;
}

export function fmtNumber(n: unknown, digits = 2): string {
    const v = Number(n);
    return Number.isFinite(v) ? v.toFixed(digits) : '';
}

export function titleCase(s: string): string {
    return s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

/** "HH:MM" (24h) in the agent's time zone, for time pickers. */
export function localHM(iso: string): string {
    const p = partsIn(iso, safeZone());
    return p ? `${pad(p.h)}:${p.min}` : '';
}

/** Convert a wall-clock date + time in the agent's time zone to a UTC instant. */
export function zonedToUtc(date: string, time: string): Date {
    const [y, m, d] = date.split('-').map(Number);
    const [h, mi] = time.split(':').map(Number);
    const guess = Date.UTC(y!, m! - 1, d!, h!, mi!);
    // offset of the zone at that moment: format the guess in the zone and compare
    const p = partsIn(new Date(guess).toISOString(), safeZone())!;
    const asZone = Date.UTC(Number(p.y), Number(p.m) - 1, Number(p.d), p.h, Number(p.min));
    return new Date(guess - (asZone - guess));
}
