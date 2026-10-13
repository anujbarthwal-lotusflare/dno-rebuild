/** Deterministic pseudo-random helpers, so demo data and generated tile rows are stable. */

export function hashString(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

export class Rng {
    private state: number;
    constructor(seed: number | string) {
        this.state = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
    }
    /** mulberry32 */
    next(): number {
        this.state = (this.state + 0x6d2b79f5) >>> 0;
        let t = this.state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    int(min: number, max: number): number {
        return min + Math.floor(this.next() * (max - min + 1));
    }
    pick<T>(items: readonly T[]): T {
        return items[Math.floor(this.next() * items.length)]!;
    }
    chance(p: number): boolean {
        return this.next() < p;
    }
    hex(len = 32): string {
        let s = '';
        while (s.length < len) s += Math.floor(this.next() * 16).toString(16);
        return s;
    }
    uuid(): string {
        const h = this.hex(32);
        return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    }
    digits(len: number): string {
        let s = '';
        for (let i = 0; i < len; i++) s += String(this.int(0, 9));
        return s;
    }
    money(min: number, max: number): number {
        return Math.round((min + this.next() * (max - min)) * 100) / 100;
    }
}

export const DAY = 86_400_000;
export const iso = (ms: number): string => new Date(ms).toISOString();
