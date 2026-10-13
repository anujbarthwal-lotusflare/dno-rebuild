/**
 * Static asset paths and product naming. A self-contained build (the in-browser demo) maps the
 * paths to embedded data and can set a neutral name; the normal build uses the files in /public.
 */
const g = globalThis as { __DNO_ASSETS?: Record<string, string>; __DNO_BRAND?: Partial<Brand> };

export const asset = (path: string): string => g.__DNO_ASSETS?.[path] ?? path;

export interface Brand {
    /** Company name in running text. */
    name: string;
    /** Tenant shown at the bottom of the sidebar. */
    tenant: string;
    /** Alt text of the sidebar logo. */
    logoAlt: string;
}
export const brand: Brand = { name: 'LotusFlare', tenant: 'LotusFlareTelecom', logoAlt: 'LotusFlare', ...g.__DNO_BRAND };
