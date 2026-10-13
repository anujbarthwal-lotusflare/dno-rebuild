export interface SelectOption {
    value: string;
    label: string;
    disabled?: boolean;
}

export type EntityType = 'user' | 'account' | 'subscriber' | 'organization';
export type PageKey = 'User' | 'Account' | 'subscriber' | 'organization';

export const PAGE_FOR_ENTITY: Record<EntityType, PageKey> = { user: 'User', account: 'Account', subscriber: 'subscriber', organization: 'organization' };

export type ColumnType = 'text' | 'date' | 'status' | 'money' | 'method' | 'code' | 'mono' | 'link:user' | 'link:account' | 'link:subscriber' | 'link:organization' | 'tags' | 'boolean';

export interface Column {
    key: string;
    label: string;
    type?: ColumnType;
    /** Custom display text (used for search, filter and sort as well). */
    format?: (row: Record<string, unknown>) => string;
    width?: string;
    sortable?: boolean;
}

export interface TileDefinition {
    key: string;
    name: string;
    size: string;
    pages: PageKey[];
    kind: string;
    columns?: { key: string; label: string; type?: ColumnType }[];
}

export interface TileLayoutItem {
    i: string;
    x: number;
    y: number;
    w: number;
    h: number;
    componentKey: string;
    /** Custom title set in page edit mode (falls back to the tile's name). */
    title?: string;
}
export interface LayoutSection {
    sectionName: string;
    isInitiallyCollapsed: boolean;
    layout: TileLayoutItem[];
    /** 'details': the entity details block, placed like any other section. */
    kind?: 'details';
}

/** Layouts saved before the details block could move have it implicitly at the top. */
export function withDetails(sections: LayoutSection[]): LayoutSection[] {
    if (sections.some((s) => s.kind === 'details')) return sections;
    return [{ sectionName: 'Details', isInitiallyCollapsed: false, layout: [], kind: 'details' }, ...sections];
}

export interface RowAction {
    label: string;
    icon?: string;
    disabled?: boolean;
    onClick: () => void;
}

export interface SidePanelCard {
    title: string;
    items: { label: string; value: unknown; tag?: boolean }[];
}

export type LayoutScope = 'user' | 'operator';

export interface LayoutChangeSummary {
    tilesAdded: string[];
    tilesRemoved: string[];
    tilesMoved: string[];
    tilesResized: string[];
    tilesRenamed: string[];
    sectionsAdded: string[];
    sectionsRemoved: string[];
    sectionsChanged: string[];
}

export interface LayoutInfo {
    page: PageKey;
    sections: LayoutSection[];
    source: 'user' | 'operator' | 'default';
    version?: number;
    updatedAt?: string;
    hasUserLayout: boolean;
    hasOperatorDefault: boolean;
    userVersion?: number;
    operatorVersion?: number;
    draft?: { updatedAt: string; base: { scope: string; version?: number }; sections: LayoutSection[] };
}

export interface LayoutVersionBrief {
    id: string;
    page: PageKey;
    scope: LayoutScope;
    version: number;
    message: string;
    author: string;
    createdAt: string;
    parentVersion?: number;
    restoredFrom?: { scope: LayoutScope; version: number };
    summary: LayoutChangeSummary;
    sectionCount: number;
    tileCount: number;
    isHead: boolean;
}
