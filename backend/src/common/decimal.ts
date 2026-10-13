/**
 * Exact decimal arithmetic on BigInt (fixed scale of 20 fractional digits).
 *
 * The original platform uses decimal.js (TypeScript) and ldecNumber (Lua) for all
 * money maths, always rounding with ROUND_HALF_EVEN. This is a dependency-free
 * replacement with the same rounding behaviour.
 */
const SCALE = 20;
const ONE = 10n ** BigInt(SCALE);

export type DecLike = Dec | number | string | bigint;

/** Integer division rounding half-to-even (banker's rounding). */
function divRoundHalfEven(n: bigint, d: bigint): bigint {
    if (d === 0n) throw new RangeError('Division by zero');
    if (d < 0n) {
        n = -n;
        d = -d;
    }
    const neg = n < 0n;
    const a = neg ? -n : n;
    let q = a / d;
    const r = a % d;
    const twice = r * 2n;
    if (twice > d || (twice === d && q % 2n === 1n)) q += 1n;
    return neg ? -q : q;
}

function parse(input: string): bigint {
    let s = input.trim();
    if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) {
        throw new RangeError(`Invalid decimal: "${input}"`);
    }
    let exp = 0;
    const eIdx = s.toLowerCase().indexOf('e');
    if (eIdx >= 0) {
        exp = Number(s.slice(eIdx + 1));
        s = s.slice(0, eIdx);
    }
    let neg = false;
    if (s[0] === '+' || s[0] === '-') {
        neg = s[0] === '-';
        s = s.slice(1);
    }
    const [intPart = '', fracPart = ''] = s.split('.');
    const digits = BigInt((intPart + fracPart) || '0');
    const shift = SCALE - fracPart.length + exp;
    const v = shift >= 0 ? digits * 10n ** BigInt(shift) : divRoundHalfEven(digits, 10n ** BigInt(-shift));
    return neg ? -v : v;
}

export class Dec {
    private readonly v: bigint;

    private constructor(v: bigint) {
        this.v = v;
    }

    static readonly ZERO = new Dec(0n);

    static of(x: DecLike): Dec {
        if (x instanceof Dec) return x;
        if (typeof x === 'bigint') return new Dec(x * ONE);
        if (typeof x === 'number') {
            if (!Number.isFinite(x)) throw new RangeError(`Invalid decimal: ${x}`);
            return new Dec(parse(String(x)));
        }
        return new Dec(parse(x));
    }

    plus(o: DecLike): Dec {
        return new Dec(this.v + Dec.of(o).v);
    }
    minus(o: DecLike): Dec {
        return new Dec(this.v - Dec.of(o).v);
    }
    mul(o: DecLike): Dec {
        return new Dec(divRoundHalfEven(this.v * Dec.of(o).v, ONE));
    }
    div(o: DecLike): Dec {
        return new Dec(divRoundHalfEven(this.v * ONE, Dec.of(o).v));
    }
    neg(): Dec {
        return new Dec(-this.v);
    }
    abs(): Dec {
        return new Dec(this.v < 0n ? -this.v : this.v);
    }
    cmp(o: DecLike): number {
        const w = Dec.of(o).v;
        return this.v === w ? 0 : this.v < w ? -1 : 1;
    }
    eq(o: DecLike): boolean {
        return this.cmp(o) === 0;
    }
    gt(o: DecLike): boolean {
        return this.cmp(o) > 0;
    }
    gte(o: DecLike): boolean {
        return this.cmp(o) >= 0;
    }
    lt(o: DecLike): boolean {
        return this.cmp(o) < 0;
    }
    lte(o: DecLike): boolean {
        return this.cmp(o) <= 0;
    }
    isZero(): boolean {
        return this.v === 0n;
    }

    static max(a: DecLike, b: DecLike): Dec {
        const x = Dec.of(a);
        const y = Dec.of(b);
        return x.gte(y) ? x : y;
    }
    static min(a: DecLike, b: DecLike): Dec {
        const x = Dec.of(a);
        const y = Dec.of(b);
        return x.lte(y) ? x : y;
    }

    /** Round to `dp` decimal places, half-to-even. */
    toDP(dp = 2): Dec {
        if (dp >= SCALE) return this;
        const unit = 10n ** BigInt(SCALE - dp);
        return new Dec(divRoundHalfEven(this.v, unit) * unit);
    }

    toNumber(): number {
        return Number(this.toString());
    }

    /** Shortest exact representation (no trailing zeros). */
    toString(): string {
        const neg = this.v < 0n;
        const a = neg ? -this.v : this.v;
        const int = a / ONE;
        const frac = (a % ONE).toString().padStart(SCALE, '0').replace(/0+$/, '');
        return `${neg ? '-' : ''}${int}${frac ? '.' + frac : ''}`;
    }

    /** Fixed number of decimals, half-to-even (like ldecNumber quantize). */
    toFixed(dp = 2): string {
        const r = this.toDP(dp);
        const neg = r.v < 0n;
        const a = neg ? -r.v : r.v;
        const int = a / ONE;
        const frac = (a % ONE).toString().padStart(SCALE, '0').slice(0, dp);
        return `${neg ? '-' : ''}${int}${dp > 0 ? '.' + frac : ''}`;
    }
}

/** Round a monetary value to 2 decimals (half-even) and return a JS number. */
export function roundMoney(x: DecLike, dp = 2): number {
    return Dec.of(x).toDP(dp).toNumber();
}
