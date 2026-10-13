import { invalid } from '../../backend/src/common/errors.ts';

/** Require a JSON object body. */
export function obj<T>(body: unknown): T {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) throw invalid('A JSON object body is required');
    return body as T;
}
/** Optional JSON object body. */
export const opt = <T>(body: unknown): T => (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as T;

export function asOf(body: unknown, now: Date): Date {
    const raw = opt<{ asOf?: string }>(body).asOf;
    if (!raw) return now;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) throw invalid('asOf is not a valid date');
    return d;
}
