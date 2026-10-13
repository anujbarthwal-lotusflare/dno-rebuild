/**
 * Customer Care Suite model.
 *
 * The original portal reads these entities from the Lua "user manager" services
 * (`/v3usermanager/...`): an Organization groups Accounts; a User owns Accounts and uses
 * Subscribers; a Subscriber (one phone line) belongs to one Account.
 */

export type EntityType = 'user' | 'account' | 'subscriber' | 'organization';
export type PageKey = 'User' | 'Account' | 'subscriber' | 'organization';

export const PAGE_FOR_ENTITY: Record<EntityType, PageKey> = {
    user: 'User',
    account: 'Account',
    subscriber: 'subscriber',
    organization: 'organization',
};

export type DeletionStatus = 'Received' | 'Approved' | 'Scheduled' | 'Terminating';

export interface AccountDeletion {
    status: DeletionStatus;
    scheduleTime?: string;
    requestedBy: 'Owner' | 'Member' | 'System initiated';
}

export interface CcsUser {
    id: string;
    firstName: string;
    lastName: string;
    middleName?: string;
    email: string;
    emailVerified: boolean;
    msisdn: string;
    verified: boolean;
    birthday?: string;
    nationality?: string;
    documentType?: string;
    documentNumber?: string;
    createdAt: string;
    lastActive: string;
    cardinality: 'single' | 'multiple';
    organizationId?: string;
    flags: Record<string, boolean>;
    tcAcceptedAt?: string;
    accountDeletion?: AccountDeletion;
}

export interface CcsAccount {
    id: string;
    name: string;
    ownerUserId: string;
    organizationId?: string;
    state: 'Active' | 'Suspended' | 'Terminated' | 'Pending';
    currency: string;
    createdAt: string;
    address: string;
    paymentMethod: string;
    billingDay: number;
    taxExempt: boolean;
}

export interface CcsSubscriber {
    id: string;
    accountId: string;
    userId: string;
    msisdn: string;
    imsi: string;
    iccid: string;
    state: 'Active' | 'Suspended' | 'Terminated' | 'Pending activation';
    planName: string;
    createdAt: string;
    activatedAt?: string;
    deviceModel: string;
}

export interface CcsOrganization {
    id: string;
    name: string;
    domain: string;
    createdAt: string;
}

export interface Wallet {
    id: string; // = owning entity id
    entityType: EntityType;
    currency: string;
    amount: number;
    activeEpoch?: string;
    graceEpoch?: string;
}

/** A row of one of the read-mostly history tiles (deliveries, login history, IMEI history...). */
export interface TileRow {
    id: string;
    tile: string;
    entityType: EntityType;
    entityId: string;
    row: Record<string, unknown>;
}

export interface Attachment {
    id: string;
    name: string;
    type: string;
    size: number;
    /** base64 */
    content: string;
}

export interface AgentNote {
    id: string;
    entityType: EntityType;
    entityId: string;
    timestamp: string;
    agentName: string;
    note: string;
    tags: string[];
    attachments: Omit<Attachment, 'content'>[];
}

export interface Appointment {
    id: string;
    subscriberId: string;
    activityType: 'Installation' | 'Repair' | 'Disconnect';
    start: string;
    end: string;
    status: 'Scheduled' | 'Completed' | 'Cancelled';
    agentNote?: string;
    agentNoteTime?: string;
    notifyCustomer: boolean;
}

export interface Charge {
    id: string;
    offerName: string;
    amountWithoutTax: number;
    discount: number;
    taxes: number;
    refundedAmount: number;
}
export interface BillingTransaction {
    id: string;
    accountId: string;
    type: 'Manual Payment' | 'Reserve' | 'Auto Payment' | 'Refund';
    timestamp: string;
    amount: number;
    originalAmount: number;
    currency: string;
    status: 'Succeeded' | 'Failed' | 'Pending' | 'Refunded' | 'Partially refunded';
    transactionType: 'Charge' | 'Refund';
    paymentMethod: string;
    charges: Charge[];
    discounts: { offerName: string; discount: number; pricingRuleName: string; pricingRuleId: string }[];
    refunds: { refundId: string; status: string; refundAmount: number; date: string; reason: string }[];
}

export interface TileLayoutItem {
    i: string;
    x: number;
    y: number;
    w: number;
    h: number;
    componentKey: string;
    /** Title shown instead of the tile's catalog name (set in page edit mode). */
    title?: string;
}
export interface LayoutSection {
    sectionName: string;
    isInitiallyCollapsed: boolean;
    layout: TileLayoutItem[];
    /** 'details': the entity details block (no tiles), placed like any other section. */
    kind?: 'details';
}

export const DETAILS_SECTION_NAME = 'Details';
/** Layouts saved before the details block could move have it implicitly at the top. */
export function withDetails(sections: LayoutSection[]): LayoutSection[] {
    if (sections.some((s) => s.kind === 'details')) return sections;
    return [{ sectionName: DETAILS_SECTION_NAME, isInitiallyCollapsed: false, layout: [], kind: 'details' }, ...sections];
}
export interface PageLayout {
    id: string; // `${scope}:${page}`
    page: PageKey;
    scope: 'user' | 'operator';
    sections: LayoutSection[];
    updatedAt: string;
    /** Version this head points at (absent for layouts saved before versioning). */
    version?: number;
}

export type LayoutScope = 'user' | 'operator';

/** What changed between two layouts, shown in the commit dialog and the history. */
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

/** An immutable, numbered snapshot of a page layout (like a commit). */
export interface LayoutVersion {
    id: string; // `${scope}:${page}:${version}`
    page: PageKey;
    scope: LayoutScope;
    version: number;
    message: string;
    author: string;
    createdAt: string;
    sections: LayoutSection[];
    /** Version the change was made on top of (the previous head of this scope). */
    parentVersion?: number;
    /** Set when the version was created by restoring an older one. */
    restoredFrom?: { scope: LayoutScope; version: number };
    summary: LayoutChangeSummary;
}

/** Work in progress in page edit mode, saved automatically (like a working copy). */
export interface LayoutDraft {
    id: string; // `draft:${page}`
    page: PageKey;
    sections: LayoutSection[];
    /** The head the draft started from. */
    base: { scope: LayoutScope | 'default'; version?: number };
    updatedAt: string;
}

export interface UserSettings {
    id: string; // always 'me'
    timezone: string;
    dateFormat: 'DD-MM-YYYY' | 'MM-DD-YYYY' | 'YYYY-MM-DD';
    timeFormat: '12' | '24';
    userSearchParam: SearchOption;
    /** The agent's sidebar arrangement; entries not mentioned keep their default place. */
    menu?: MenuArrangement;
}

/** Sidebar order: top-level entries by name, sub-entries by link per group, hidden names/links. */
export interface MenuArrangement {
    /** Top-level keys: a built-in entry's name, or a custom entry's id. */
    order: string[];
    /** Group key -> sub-entry keys: a built-in sub-entry's link, or a custom entry's id. */
    groups: Record<string, string[]>;
    hidden: string[];
    /** Entries the agent added. */
    custom?: CustomMenuEntry[];
    /** Built-in entries the agent deleted (keys as above). */
    deleted?: string[];
    /** Top-level keys of the bottom area, in order (default: Settings, Support, My Account, tenant). */
    footer?: string[];
    /** New names and icons for built-in entries, by key. */
    renames?: Record<string, string>;
    icons?: Record<string, string>;
    /** The environment label at the bottom of the sidebar. */
    env?: { label?: string; hidden?: boolean };
}
export interface CustomMenuEntry {
    id: string; // c-...
    kind: 'menu' | 'sub';
    name: string;
    /** Portal route (/...) or web address (https://...); a menu without a link is a group. */
    link?: string;
    icon?: string;
}

export type SearchOption = 'userId' | 'email' | 'msisdn' | 'subscriberId' | 'accountId' | 'imsi' | 'organizationId';
export type SearchOperator = 'match' | 'startsWith';

export interface AuditLog {
    id: string;
    entityType: EntityType;
    entityId: string;
    timestamp: string;
    agent: string;
    service: string;
    method: string;
    path: string;
    status: number;
    action: string;
}

export interface Quote {
    id: string;
    customerId: string;
    subscriptionId?: string;
    name: string;
    state: 'inProgress' | 'pending' | 'approved' | 'accepted' | 'cancelled' | 'rejected';
    quoteDate: string;
    validUntil: string;
    totalAmount: number;
    currency: string;
    description?: string;
}
