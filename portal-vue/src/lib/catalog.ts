import { api } from './api.ts';
import type { TileDefinition } from './types.ts';

export interface TileCatalog {
    tiles: TileDefinition[];
    byKey: Map<string, TileDefinition>;
    sizes: Record<string, { w: number; h: number }>;
}

let cached: Promise<TileCatalog> | undefined;

/** The tile catalog (names, sizes, pages, columns) comes from the API, loaded once. */
export function loadCatalog(): Promise<TileCatalog> {
    cached ??= api<{ tiles: TileDefinition[]; sizes: Record<string, { w: number; h: number }> }>('/care/tileCatalog').then((c) => ({
        tiles: c.tiles,
        sizes: c.sizes,
        byKey: new Map(c.tiles.map((t) => [t.key, t])),
    }));
    cached.catch(() => (cached = undefined));
    return cached;
}
