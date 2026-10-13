/**
 * Customer Care Suite back-end: user manager search, the four overview pages and their tiles,
 * agent actions (wallet top-up and deduction, refunds, agent notes, appointments, support
 * actions), page layouts (agent and operator default) and agent preferences.
 *
 * Every agent action is written to the audit log, which feeds the Audit Logs tile.
 */
import type { Collection, Store } from '../common/store.ts';
import type { Clock } from '../common/runtime.ts';
import { DomainError, invalid, notFound } from '../common/errors.ts';
import { DETAILS_SECTION_NAME, withDetails } from './model.ts';
import type {
    AgentNote,
    Appointment,
    Attachment,
    AuditLog,
    BillingTransaction,
    CcsAccount,
    CcsOrganization,
    CcsSubscriber,
    CcsUser,
    EntityType,
    LayoutSection,
    PageKey,
    PageLayout,
    SearchOperator,
    SearchOption,
    TileLayoutItem,
    UserSettings,
    MenuArrangement,
    CustomMenuEntry,
    Wallet,
} from './model.ts';
import { CARE_COLLECTIONS, seedCare } from './seed.ts';
import type { Invoice, PortalRole, SalesforceMessage } from './seed.ts';
import { DEFAULT_LAYOUTS, TILES, TILE_BY_KEY, TILE_SIZES } from './tiles.ts';
import type { DefaultTile } from './tiles.ts';
import { generateKeyValue, generateRows } from './tileData.ts';
import type { TileContext } from './tileData.ts';
import { renderPdf } from './pdf.ts';
import { Rng } from './random.ts';
import { LayoutService } from './layouts.ts';
import type { LayoutFileOptions } from './layouts.ts';

export const AGENT_NAME = 'Portal Agent';
const ENTITY_TYPES: EntityType[] = ['user', 'account', 'subscriber', 'organization'];
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const ATTACHMENT_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

export const SEARCH_OPTIONS: { key: SearchOption; label: string; placeholder: string; operators: SearchOperator[] }[] = [
    { key: 'accountId', label: 'Account ID', placeholder: 'Enter Account ID', operators: ['match'] },
    { key: 'email', label: 'E-mail', placeholder: 'Enter E-mail', operators: ['match', 'startsWith'] },
    { key: 'imsi', label: 'IMSI', placeholder: 'Enter IMSI', operators: ['match'] },
    { key: 'subscriberId', label: 'Subscriber ID', placeholder: 'Enter Subscriber ID', operators: ['match'] },
    { key: 'msisdn', label: 'MSISDN', placeholder: 'Enter MSISDN', operators: ['match', 'startsWith'] },
    { key: 'userId', label: 'User ID', placeholder: 'Enter User ID', operators: ['match'] },
    { key: 'organizationId', label: 'Organization ID', placeholder: 'Enter Organization ID', operators: ['match'] },
];

export const NOTE_TAGS = ['Interaction', 'Billing', 'Complaint', 'Technical', 'Sales', 'Retention', 'Escalation'];

export const SUPPORT_ACTIONS: Record<EntityType, { key: string; label: string; description: string }[]> = {
    user: [
        { key: 'resendWelcome', label: 'Resend welcome e-mail', description: 'Sends the welcome e-mail with the sign-in link again.' },
        { key: 'resetPassword', label: 'Send password reset', description: 'Sends a password reset link to the e-mail on file.' },
        { key: 'clientStorage', label: 'Clear client storage', description: 'Signs the user out of the app on every device and clears cached data.' },
    ],
    account: [
        { key: 'retryPayment', label: 'Retry failed payment', description: 'Retries the latest failed payment with the default payment method.' },
        { key: 'resendInvoice', label: 'Resend latest invoice', description: 'E-mails the latest invoice PDF to the account owner.' },
        { key: 'networkCoverage', label: 'Check network coverage', description: 'Checks coverage at the service address.' },
    ],
    subscriber: [
        { key: 'viewSubscriberServices', label: 'View subscriber services', description: 'Lists the services provisioned on the network for this line.' },
        { key: 'networkCoverage', label: 'Check network coverage', description: 'Checks coverage at the service address.' },
        { key: 'cancelDeviceLocation', label: 'Cancel device location', description: 'Cancels pending device-location requests for this line.' },
        { key: 'resetNetworkRegistration', label: 'Reset network registration', description: 'Detaches the SIM from the network so it registers again.' },
        { key: 'terminateBlankSubscriber', label: 'Terminate blank subscriber', description: 'Terminates a subscriber that never completed activation.' },
    ],
    organization: [],
};

export interface SearchResult {
    entityType: EntityType;
    id: string;
    name: string;
    email?: string;
    msisdn?: string;
    state?: string;
    userId?: string;
    accountId?: string;
}

export interface NewNote {
    tags: string[];
    note: string;
    attachments?: { name: string; type: string; content: string }[];
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const fullName = (u: CcsUser): string => `${u.firstName} ${u.lastName}`;

export class CareService {
    readonly users: Collection<CcsUser>;
    readonly accounts: Collection<CcsAccount>;
    readonly subscribers: Collection<CcsSubscriber>;
    readonly organizations: Collection<CcsOrganization>;
    readonly wallets: Collection<Wallet>;
    readonly roles: Collection<PortalRole>;
    readonly notes: Collection<AgentNote>;
    readonly attachments: Collection<Attachment>;
    readonly appointments: Collection<Appointment>;
    readonly transactions: Collection<BillingTransaction>;
    readonly invoices: Collection<Invoice>;
    readonly salesforce: Collection<SalesforceMessage>;
    readonly layouts: Collection<PageLayout>;
    readonly settings: Collection<UserSettings>;
    readonly audit: Collection<AuditLog>;
    private readonly store: Store;
    private readonly clock: Clock;

    readonly layoutVersions: LayoutService;

    constructor(store: Store, clock: Clock, options: { layoutFiles?: LayoutFileOptions } = {}) {
        this.store = store;
        this.clock = clock;
        this.layoutVersions = new LayoutService({ store, clock, defaults: buildDefaultLayout, validate: validateSections, author: AGENT_NAME, files: options.layoutFiles });
        const C = CARE_COLLECTIONS;
        this.users = store.collection(C.users, 'User');
        this.accounts = store.collection(C.accounts, 'Account');
        this.subscribers = store.collection(C.subscribers, 'Subscriber');
        this.organizations = store.collection(C.organizations, 'Organization');
        this.wallets = store.collection(C.wallets, 'Wallet');
        this.roles = store.collection(C.roles, 'Role');
        this.notes = store.collection(C.notes, 'Agent note');
        this.attachments = store.collection(C.attachments, 'Attachment');
        this.appointments = store.collection(C.appointments, 'Appointment');
        this.transactions = store.collection(C.transactions, 'Billing transaction');
        this.invoices = store.collection(C.invoices, 'Invoice');
        this.salesforce = store.collection(C.salesforce, 'Salesforce message');
        this.layouts = store.collection(C.layouts, 'Layout');
        this.settings = store.collection(C.settings, 'Settings');
        this.audit = store.collection(C.audit, 'Audit log');
    }

    /** Loads the demo data the first time the suite starts on a database. Returns true when it did. */
    async ensureSeeded(): Promise<boolean> {
        if ((await this.users.list()).length > 0) return false;
        await seedCare(this.store, this.clock.now());
        return true;
    }

    /* ---------------- catalog and options ---------------- */

    tileCatalog() {
        return { tiles: TILES, sizes: TILE_SIZES };
    }
    searchOptions() {
        return { options: SEARCH_OPTIONS, operators: [{ key: 'match', label: 'Equal to' }, { key: 'startsWith', label: 'Starts with' }] };
    }
    noteTags() {
        return NOTE_TAGS;
    }

    /* ---------------- search ---------------- */

    async search(input: { option?: string; operator?: string; value?: string }): Promise<{ entityType: EntityType; results: SearchResult[] }> {
        const option = SEARCH_OPTIONS.find((o) => o.key === input.option);
        if (!option) throw invalid(`Unknown search parameter "${input.option}"`);
        const operator = (input.operator ?? 'match') as SearchOperator;
        if (!option.operators.includes(operator)) throw invalid(`${option.label} cannot be searched with "${operator}"`);
        const raw = (input.value ?? '').trim();
        if (!raw) throw invalid(`${option.label} is required`);
        const value = option.key === 'email' ? raw.toLowerCase() : option.key === 'msisdn' ? raw.replace(/[^\d]/g, '') : raw;
        if (option.key === 'msisdn' && !value) throw invalid('MSISDN must contain digits');
        if (option.key === 'email' && operator === 'match' && !/^[^\s@]+@[^\s@]+$/.test(value)) throw invalid('Enter a valid e-mail address');
        const hit = (field: string | undefined): boolean => {
            if (!field) return false;
            const f = option.key === 'email' ? field.toLowerCase() : field;
            return operator === 'startsWith' ? f.startsWith(value) : f === value;
        };

        let entityType: EntityType;
        let results: SearchResult[];
        switch (option.key) {
            case 'userId':
            case 'email': {
                entityType = 'user';
                const users = await this.users.list((u) => hit(option.key === 'userId' ? u.id : u.email));
                results = users.map((u) => this.userResult(u));
                break;
            }
            case 'msisdn': {
                // MSISDN finds the subscriber line; the original opens the subscriber's user when the line has one
                entityType = 'subscriber';
                const subs = await this.subscribers.list((s) => hit(s.msisdn));
                results = await Promise.all(subs.map((s) => this.subscriberResult(s)));
                break;
            }
            case 'subscriberId':
            case 'imsi': {
                entityType = 'subscriber';
                const subs = await this.subscribers.list((s) => hit(option.key === 'imsi' ? s.imsi : s.id));
                results = await Promise.all(subs.map((s) => this.subscriberResult(s)));
                break;
            }
            case 'accountId': {
                entityType = 'account';
                const accounts = await this.accounts.list((a) => hit(a.id));
                results = accounts.map((a) => ({ entityType: 'account', id: a.id, name: a.name, state: a.state, userId: a.ownerUserId }));
                break;
            }
            case 'organizationId': {
                entityType = 'organization';
                const orgs = await this.organizations.list((o) => hit(o.id));
                results = orgs.map((o) => ({ entityType: 'organization', id: o.id, name: o.name }));
                break;
            }
            default:
                throw invalid('Unsupported search parameter');
        }
        if (results.length === 0) {
            const what = entityType === 'user' ? 'User' : entityType === 'account' ? 'Account' : entityType === 'organization' ? 'Organization' : 'Subscriber';
            throw new DomainError('CARE-NOT_FOUND', `${what} not found for ${option.label} "${raw}"`, 404);
        }
        return { entityType, results };
    }

    private userResult(u: CcsUser): SearchResult {
        return { entityType: 'user', id: u.id, name: fullName(u), email: u.email, msisdn: u.msisdn, state: u.accountDeletion?.status ?? 'Active', userId: u.id };
    }
    private async subscriberResult(s: CcsSubscriber): Promise<SearchResult> {
        const u = await this.users.get(s.userId);
        return { entityType: 'subscriber', id: s.id, name: u ? fullName(u) : s.msisdn, email: u?.email, msisdn: s.msisdn, state: s.state, userId: s.userId, accountId: s.accountId };
    }

    /* ---------------- entities ---------------- */

    async getUser(id: string) {
        const user = await this.users.require(id);
        const accounts = await this.accounts.list((a) => a.ownerUserId === id);
        const subscribers = await this.subscribers.list((s) => s.userId === id);
        const organization = user.organizationId ? await this.organizations.get(user.organizationId) : undefined;
        return { user, accounts, subscribers, organization };
    }
    async getAccount(id: string) {
        const account = await this.accounts.require(id);
        const owner = await this.users.get(account.ownerUserId);
        const subscribers = await this.subscribers.list((s) => s.accountId === id);
        const organization = account.organizationId ? await this.organizations.get(account.organizationId) : undefined;
        return { account, owner, subscribers, organization };
    }
    async getSubscriber(id: string) {
        const subscriber = await this.subscribers.require(id);
        const account = await this.accounts.get(subscriber.accountId);
        const user = await this.users.get(subscriber.userId);
        return { subscriber, account, user };
    }
    async getOrganization(id: string) {
        const organization = await this.organizations.require(id);
        const accounts = await this.accounts.list((a) => a.organizationId === id);
        const users = await this.users.list((u) => u.organizationId === id);
        return { organization, accounts, users };
    }

    async patchUser(id: string, patch: Partial<Pick<CcsUser, 'firstName' | 'lastName' | 'middleName' | 'email' | 'msisdn' | 'birthday' | 'nationality'>>) {
        const user = await this.users.require(id);
        const next = { ...user };
        for (const k of ['firstName', 'lastName', 'middleName', 'email', 'msisdn', 'birthday', 'nationality'] as const) {
            const v = patch[k];
            if (v === undefined) continue;
            if (typeof v !== 'string') throw invalid(`${k} must be text`);
            next[k] = v.trim();
        }
        if (!next.firstName || !next.lastName) throw invalid('First and last name are required');
        if (next.email && !/^[^\s@]+@[^\s@]+$/.test(next.email)) throw invalid('Enter a valid e-mail address');
        if (next.email !== user.email) next.emailVerified = false;
        await this.users.replace(next);
        await this.log('user', id, 'Edit user', 'PATCH', `/v3usermanager/updateuser`);
        return next;
    }
    async patchAccount(id: string, patch: Partial<Pick<CcsAccount, 'name' | 'address' | 'billingDay' | 'paymentMethod' | 'taxExempt'>>) {
        const account = await this.accounts.require(id);
        const next = { ...account };
        if (patch.name !== undefined) next.name = String(patch.name).trim();
        if (patch.address !== undefined) next.address = String(patch.address).trim();
        if (patch.paymentMethod !== undefined) next.paymentMethod = String(patch.paymentMethod).trim();
        if (patch.taxExempt !== undefined) next.taxExempt = Boolean(patch.taxExempt);
        if (patch.billingDay !== undefined) {
            const d = Number(patch.billingDay);
            if (!Number.isInteger(d) || d < 1 || d > 28) throw invalid('Billing day must be between 1 and 28');
            next.billingDay = d;
        }
        if (!next.name) throw invalid('Account name is required');
        await this.accounts.replace(next);
        await this.log('account', id, 'Edit account', 'PATCH', '/v3usermanager/updateaccount');
        return next;
    }
    async patchSubscriber(id: string, patch: Partial<Pick<CcsSubscriber, 'state' | 'planName' | 'deviceModel'>>) {
        const sub = await this.subscribers.require(id);
        const next = { ...sub };
        if (patch.state !== undefined) {
            const allowed: Record<CcsSubscriber['state'], CcsSubscriber['state'][]> = {
                'Pending activation': ['Active', 'Terminated'],
                Active: ['Suspended', 'Terminated'],
                Suspended: ['Active', 'Terminated'],
                Terminated: [],
            };
            if (patch.state !== sub.state && !allowed[sub.state].includes(patch.state)) throw invalid(`A subscriber cannot go from ${sub.state} to ${patch.state}`);
            next.state = patch.state;
            if (patch.state === 'Active' && !next.activatedAt) next.activatedAt = this.clock.now().toISOString();
        }
        if (patch.planName !== undefined) next.planName = String(patch.planName).trim() || sub.planName;
        if (patch.deviceModel !== undefined) next.deviceModel = String(patch.deviceModel).trim() || sub.deviceModel;
        await this.subscribers.replace(next);
        await this.log('subscriber', id, 'Edit subscriber', 'PATCH', '/v3usermanager/updatesubscriber');
        return next;
    }

    /** Entity, its parents and children, as the Associated Entities tile shows them. */
    async associatedEntities(entityType: EntityType, id: string) {
        const rows: { level: string; entityType: EntityType; id: string; name: string; msisdn: string; state: string }[] = [];
        const addUser = (u: CcsUser) => rows.push({ level: 'User', entityType: 'user', id: u.id, name: fullName(u), msisdn: u.msisdn, state: u.accountDeletion ? `Deletion ${u.accountDeletion.status.toLowerCase()}` : 'Active' });
        const addAccount = (a: CcsAccount) => rows.push({ level: 'Account', entityType: 'account', id: a.id, name: a.name, msisdn: '', state: a.state });
        const addSub = (s: CcsSubscriber) => rows.push({ level: 'Subscriber', entityType: 'subscriber', id: s.id, name: s.planName, msisdn: s.msisdn, state: s.state });
        let organization: CcsOrganization | undefined;
        if (entityType === 'organization') {
            organization = await this.organizations.require(id);
            // an organization groups accounts; users only hold roles on it (see Access List)
            for (const a of await this.accounts.list((x) => x.organizationId === id)) {
                addAccount(a);
                for (const s of await this.subscribers.list((x) => x.accountId === a.id)) addSub(s);
            }
            return { organization, rows: [] as typeof rows, accounts: rows };
        }
        if (entityType === 'user') {
            await this.users.require(id);
            for (const a of await this.accounts.list((x) => x.ownerUserId === id)) {
                addAccount(a);
                for (const s of await this.subscribers.list((x) => x.accountId === a.id)) addSub(s);
            }
        } else if (entityType === 'account') {
            const a = await this.accounts.require(id);
            const owner = await this.users.get(a.ownerUserId);
            if (owner) addUser(owner);
            for (const s of await this.subscribers.list((x) => x.accountId === id)) addSub(s);
            if (a.organizationId) organization = await this.organizations.get(a.organizationId);
        } else {
            const s = await this.subscribers.require(id);
            const owner = await this.users.get(s.userId);
            if (owner) addUser(owner);
            const a = await this.accounts.get(s.accountId);
            if (a) addAccount(a);
        }
        return { organization, rows };
    }

    /** Options for the associated-entity picker of the Wallet and Current Benefits tiles. */
    async entityPicker(entityType: EntityType, id: string, include: EntityType[] = ['user', 'account', 'subscriber']) {
        const out: { entityType: EntityType; id: string; label: string }[] = [];
        const push = (t: EntityType, eid: string, label: string) => {
            if (include.includes(t)) out.push({ entityType: t, id: eid, label });
        };
        if (entityType === 'user') {
            push('user', id, id);
            for (const a of await this.accounts.list((x) => x.ownerUserId === id)) {
                push('account', a.id, a.id);
                for (const s of await this.subscribers.list((x) => x.accountId === a.id)) push('subscriber', s.id, `${s.id} (${s.msisdn})`);
            }
        } else if (entityType === 'account') {
            push('account', id, id);
            for (const s of await this.subscribers.list((x) => x.accountId === id)) push('subscriber', s.id, `${s.id} (${s.msisdn})`);
        } else if (entityType === 'subscriber') {
            push('subscriber', id, id);
        }
        return out;
    }

    /* ---------------- wallet ---------------- */

    async getWallet(entityType: EntityType, id: string): Promise<Wallet> {
        await this.requireEntity(entityType, id);
        const w = await this.wallets.get(id);
        if (w) return w;
        return this.wallets.insert({ id, entityType, currency: await this.currencyOf(entityType, id), amount: 0 });
    }

    async topUp(entityType: EntityType, id: string, body: { amount?: unknown; voucherCode?: unknown }): Promise<Wallet> {
        const amount = Number(body.amount);
        if (!Number.isFinite(amount) || amount <= 0) throw invalid('Top Up Amount must be greater than 0');
        if (amount > 100_000) throw invalid('Top Up Amount is above the 100000 limit');
        const voucher = typeof body.voucherCode === 'string' ? body.voucherCode.trim() : '';
        if (voucher && !/^[A-Za-z0-9-]{4,32}$/.test(voucher)) throw invalid('Voucher Code is not valid');
        const w = await this.getWallet(entityType, id);
        const now = this.clock.now().getTime();
        const next: Wallet = {
            ...w,
            amount: round2(w.amount + amount),
            activeEpoch: new Date(Math.max(now, Date.parse(w.activeEpoch ?? '') || 0) + 30 * 86_400_000).toISOString(),
            graceEpoch: new Date(Math.max(now, Date.parse(w.activeEpoch ?? '') || 0) + 60 * 86_400_000).toISOString(),
        };
        await this.wallets.replace(next);
        await this.log(entityType, id, `Wallet top-up ${w.currency} ${amount.toFixed(2)}${voucher ? ` (voucher ${voucher})` : ''}`, 'POST', '/v3wallet/topup');
        return next;
    }

    async deduct(entityType: EntityType, id: string, body: { amount?: unknown }): Promise<Wallet> {
        const amount = Number(body.amount);
        if (!Number.isFinite(amount) || amount <= 0) throw invalid('Deduct Amount must be greater than 0');
        const w = await this.getWallet(entityType, id);
        if (amount > w.amount) throw invalid(`Deduct Amount cannot be greater than the balance (${w.currency} ${w.amount.toFixed(2)})`);
        const next = { ...w, amount: round2(w.amount - amount) };
        await this.wallets.replace(next);
        await this.log(entityType, id, `Wallet deduction ${w.currency} ${amount.toFixed(2)}`, 'POST', '/v3wallet/deduct');
        return next;
    }

    /** Current Benefits: the most recently granted benefit that is still available. */
    async currentBenefit(entityType: EntityType, id: string) {
        await this.requireEntity(entityType, id);
        const rows = generateRows('promotionAndRetention', await this.tileContext(entityType, id)) ?? [];
        const active = rows.filter((r) => r.status === 'Active' && Number(r.remainingUses) > 0).sort((a, b) => String(b.grantedAt).localeCompare(String(a.grantedAt)));
        const b = active[0];
        if (!b) return { discount: '', remainingUses: '', benefitType: '', benefitId: '' };
        return { discount: b.discount, remainingUses: b.remainingUses, benefitType: b.benefitType, benefitId: new Rng(`benefit:${id}`).hex(16) };
    }

    /* ---------------- billing ---------------- */

    async billingSummary(accountId: string) {
        const account = await this.accounts.require(accountId);
        const invoices = (await this.invoices.list((i) => i.accountId === accountId)).sort((a, b) => b.issueDate.localeCompare(a.issueDate));
        const unpaid = invoices.filter((i) => i.amountDue > 0);
        const amountDue = round2(unpaid.reduce((s, i) => s + i.amountDue, 0));
        const transactions = (await this.transactions.list((t) => t.accountId === accountId)).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        const wallet = await this.wallets.get(accountId);
        return {
            accountId,
            currency: account.currency,
            amountDue,
            latestUnpaidInvoiceId: unpaid[0]?.id,
            latestInvoiceId: invoices[0]?.id,
            remainingBalance: wallet?.amount ?? 0,
            transactions,
        };
    }

    async listInvoices(accountId: string) {
        await this.accounts.require(accountId);
        return (await this.invoices.list((i) => i.accountId === accountId)).sort((a, b) => b.issueDate.localeCompare(a.issueDate));
    }

    async invoicePdf(invoiceId: string): Promise<{ filename: string; pdf: Buffer }> {
        const inv = await this.invoices.require(invoiceId);
        const account = await this.accounts.get(inv.accountId);
        const owner = account ? await this.users.get(account.ownerUserId) : undefined;
        const d = (s: string) => s.slice(0, 10);
        const m = (n: number) => `${inv.currency} ${n.toFixed(2)}`;
        const pdf = renderPdf([
            { text: 'LotusFlare', size: 20, bold: true },
            { text: `Invoice ${inv.number}`, size: 14, bold: true, gap: 12 },
            { text: `Issue date: ${d(inv.issueDate)}`, gap: 6 },
            { text: `Due date: ${d(inv.dueDate)}` },
            { text: `Billing period: ${d(inv.periodStart)} to ${d(inv.periodEnd)}` },
            { text: `Account: ${account?.name ?? inv.accountId}`, gap: 10 },
            { text: `Account ID: ${inv.accountId}` },
            { text: `Customer: ${owner ? fullName(owner) : ''}` },
            { text: account?.address ?? '' },
            { text: 'Description', bold: true, right: 'Amount', gap: 16 },
            ...inv.lines.map((l) => ({ text: l.description, right: m(l.amount) })),
            { text: 'Total', bold: true, right: m(inv.amount), gap: 8 },
            { text: 'Amount due', bold: true, right: m(inv.amountDue) },
            { text: `Status: ${inv.status}`, gap: 16 },
        ]);
        return { filename: `${inv.number}.pdf`, pdf };
    }

    async listTransactions(accountId: string) {
        await this.accounts.require(accountId);
        return (await this.transactions.list((t) => t.accountId === accountId)).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    }

    /** Refund selected charges of a transaction (Billing Transaction V2 charges sidebar). */
    async refund(transactionId: string, body: { chargeIds?: unknown; reason?: unknown }): Promise<BillingTransaction> {
        const tx = await this.transactions.require(transactionId);
        if (tx.status !== 'Succeeded' && tx.status !== 'Partially refunded') throw invalid(`A ${tx.status.toLowerCase()} transaction cannot be refunded`);
        if (tx.type === 'Reserve' || tx.type === 'Refund') throw invalid(`A ${tx.type.toLowerCase()} transaction cannot be refunded`);
        const ids = Array.isArray(body.chargeIds) ? body.chargeIds.map(String) : [];
        if (ids.length === 0) throw invalid('Select at least one charge to refund');
        const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
        if (!reason) throw invalid('Refund reason is required');
        let total = 0;
        const charges = tx.charges.map((c) => {
            if (!ids.includes(c.id)) return c;
            const refundable = round2(c.amountWithoutTax - c.discount + c.taxes - c.refundedAmount);
            if (refundable <= 0) throw invalid(`${c.offerName} has already been refunded`);
            total += refundable;
            return { ...c, refundedAmount: round2(c.refundedAmount + refundable) };
        });
        if (ids.some((id) => !tx.charges.some((c) => c.id === id))) throw invalid('Unknown charge selected');
        const fullyRefunded = charges.every((c) => round2(c.amountWithoutTax - c.discount + c.taxes - c.refundedAmount) <= 0);
        const refundId = new Rng(`${transactionId}:${tx.refunds.length}`).uuid();
        const next: BillingTransaction = {
            ...tx,
            charges,
            status: fullyRefunded ? 'Refunded' : 'Partially refunded',
            refunds: [...tx.refunds, { refundId, status: 'Succeeded', refundAmount: round2(total), date: this.clock.now().toISOString(), reason }],
        };
        await this.transactions.replace(next);
        await this.log('account', tx.accountId, `Refund ${tx.currency} ${total.toFixed(2)}: ${reason}`, 'POST', '/v4billing/refund');
        return next;
    }

    async salesforceMessages(accountId: string) {
        await this.accounts.require(accountId);
        return (await this.salesforce.list((m) => m.accountId === accountId)).sort((a, b) => b.messageSent.localeCompare(a.messageSent));
    }

    /* ---------------- generic tile data ---------------- */

    async tileData(tileKey: string, entityType: EntityType, id: string): Promise<{ rows?: Record<string, unknown>[]; items?: { label: string; value: string }[]; data?: unknown }> {
        const def = TILE_BY_KEY.get(tileKey);
        if (!def) throw notFound('Tile', tileKey);
        await this.requireEntity(entityType, id);
        const ctx = await this.tileContext(entityType, id);
        switch (tileKey) {
            case 'accessList':
                return { rows: await this.accessList(entityType, id) };
            case 'organizationAccounts':
                return { rows: (await this.accounts.list((a) => a.organizationId === id)).map((a) => ({ accountId: a.id, accountName: a.name, status: a.state })) };
            case 'associatedRoles': {
                const roles = await this.roles.list((r) => r.entityType === 'organization' && r.entityId === id);
                const rows = [];
                for (const r of roles) {
                    const u = await this.users.get(r.userId);
                    rows.push({ id: r.userId, type: 'User', role: r.role, email: u?.email ?? '' });
                }
                for (const a of await this.accounts.list((x) => x.organizationId === id)) rows.push({ id: a.id, type: 'Account', role: 'member', email: '' });
                return { rows };
            }
            case 'subscriberWarnings': {
                const subs = entityType === 'subscriber' ? [ctx.subscriber!] : [];
                const rows: Record<string, unknown>[] = [];
                const now = this.clock.now().toISOString();
                for (const sub of subs) {
                    const install = (await this.appointments.list((a) => a.subscriberId === sub.id && a.activityType === 'Installation' && a.status === 'Scheduled' && a.end >= now))[0];
                    if (sub.state === 'Active' && install) rows.push({ category: 'Subscriber Activation', warning: 'Installation is pending for activated subscriber, please advise' });
                    if (sub.state === 'Pending activation') rows.push({ category: 'Subscriber Activation', warning: 'Subscriber activation has not completed' });
                    if (sub.state === 'Suspended') rows.push({ category: 'Service', warning: 'Subscriber is suspended; services are barred' });
                    const wallet = await this.wallets.get(sub.id);
                    if (wallet && wallet.amount <= 0 && sub.state === 'Active') rows.push({ category: 'Balance', warning: 'Wallet balance is zero; usage outside the plan will be blocked' });
                }
                return { rows };
            }
            case 'auditLogs':
                return { rows: (await this.audit.list((l) => l.entityType === entityType && l.entityId === id)).sort((a, b) => b.timestamp.localeCompare(a.timestamp)) as unknown as Record<string, unknown>[] };
            case 'billingTransaction':
            case 'latestTransaction': {
                const accountIds = entityType === 'account' ? [id] : (await this.accounts.list((a) => a.ownerUserId === id)).map((a) => a.id);
                const txs = (await this.transactions.list((t) => accountIds.includes(t.accountId))).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
                return { rows: txs.map((t) => ({ transactionId: t.id, type: t.type, timestamp: t.timestamp, amount: { value: t.amount, currency: t.currency }, status: t.status })) };
            }
            case 'subscriptions': {
                const subs = entityType === 'subscriber' ? [ctx.subscriber!] : await this.subscribers.list((s) => s.accountId === id);
                const generated = generateRows('subscriptions', ctx) ?? [];
                const own = subs.map((s) => ({
                    subscriptionId: new Rng(`subscription:${s.id}`).uuid(),
                    plan: s.planName,
                    startDate: s.activatedAt ?? s.createdAt,
                    endDate: s.state === 'Terminated' ? s.activatedAt ?? '' : new Date(Date.parse(s.activatedAt ?? s.createdAt) + 365 * 86_400_000).toISOString(),
                    renewal: 'Auto renew',
                    status: s.state === 'Active' ? 'Active' : s.state,
                }));
                return { rows: [...own, ...generated.slice(1)] };
            }
            default: {
                const items = generateKeyValue(tileKey, ctx);
                if (items) return { items };
                const rows = generateRows(tileKey, ctx);
                if (rows) return { rows };
                return { rows: [] };
            }
        }
    }

    private async accessList(entityType: EntityType, id: string) {
        const roles = await this.roles.list((r) => r.entityType === entityType && r.entityId === id);
        const rows = [];
        for (const r of roles) {
            const u = await this.users.get(r.userId);
            rows.push({ userId: r.userId, email: u?.email ?? '', role: r.role });
        }
        return rows;
    }

    /** Latest order for "Latest Order Details V2", from the generated order history of the user's first account. */
    async latestOrder(userId: string) {
        const accounts = await this.accounts.list((a) => a.ownerUserId === userId);
        const first = accounts[0];
        if (!first) return undefined;
        const rows = generateRows('orderDetailsV2', await this.tileContext('account', first.id)) ?? [];
        return rows.sort((a, b) => String(b.orderDate).localeCompare(String(a.orderDate)))[0];
    }

    /** Plan And Purchase: current plan of the line (or the account's lines) plus purchase history. */
    async planAndPurchase(entityType: EntityType, id: string) {
        const subs = entityType === 'subscriber' ? [await this.subscribers.require(id)] : await this.subscribers.list((s) => s.accountId === id);
        const ctx = await this.tileContext(entityType, id);
        const rng = new Rng(`plan:${id}`);
        const plans = subs.map((s) => ({
            subscriberId: s.id,
            msisdn: s.msisdn,
            planName: s.planName,
            price: { value: rng.pick([25, 30, 45, 60]), currency: ctx.currency },
            renewsOn: new Date(ctx.now + rng.int(1, 28) * 86_400_000).toISOString(),
            allowances: [
                { name: 'Data', used: rng.int(1, 14), total: s.planName.includes('Unlimited') ? 'Unlimited' : String(rng.pick([15, 30, 50])), unit: 'GB' },
                { name: 'Voice', used: rng.int(10, 500), total: 'Unlimited', unit: 'min' },
                { name: 'SMS', used: rng.int(0, 100), total: 'Unlimited', unit: '' },
            ],
            state: s.state,
        }));
        const purchases = Array.from({ length: rng.int(2, 5) }, () => ({
            purchaseId: rng.uuid(),
            item: rng.pick(['Extra 5GB', 'Roaming pack 7 days', 'Plan renewal', 'International minutes 100']),
            amount: { value: rng.money(3, 40), currency: ctx.currency },
            purchasedAt: new Date(ctx.now - rng.int(1, 120) * 86_400_000).toISOString(),
            status: rng.pick(['Completed', 'Completed', 'Refunded']),
        })).sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt));
        return { plans, purchases };
    }

    /** Balances and Wallet: wallet plus the usage buckets of the line(s). */
    async balances(entityType: EntityType, id: string) {
        const wallet = await this.getWallet(entityType, id);
        const rng = new Rng(`balances:${id}`);
        const buckets = [
            { name: 'Data', remaining: rng.int(1, 14), total: 15, unit: 'GB' },
            { name: 'Voice', remaining: rng.int(50, 500), total: 500, unit: 'min' },
            { name: 'SMS', remaining: rng.int(10, 100), total: 100, unit: 'SMS' },
            { name: 'Roaming data', remaining: rng.int(0, 2), total: 2, unit: 'GB' },
        ].map((b) => ({ ...b, expiresAt: new Date(this.clock.now().getTime() + rng.int(3, 28) * 86_400_000).toISOString() }));
        const credit = entityType === 'account' || entityType === 'subscriber' ? round2(rng.money(0, 50)) : 0;
        return { wallet, creditBalance: { value: credit, currency: wallet.currency }, buckets };
    }

    /** Broadband facts label (FCC style) for the line or the account's first line. */
    async broadbandFacts(entityType: EntityType, id: string) {
        const ctx = await this.tileContext(entityType, id);
        const rng = new Rng(`bb:${id}`);
        return {
            provider: 'LotusFlare',
            planName: ctx.planName ?? 'Fibre 300',
            serviceType: (ctx.planName ?? '').includes('Fibre') ? 'Fixed Broadband Consumer Disclosure' : 'Mobile Broadband Consumer Disclosure',
            monthlyPrice: { value: rng.pick([45, 55, 65]), currency: ctx.currency },
            introductoryRate: rng.chance(0.5) ? 'This monthly price is an introductory rate for 12 months.' : 'This monthly price is not an introductory rate.',
            contractLength: rng.pick(['No contract', '12 months', '24 months']),
            oneTimeFees: [
                { name: 'Activation fee', value: rng.pick([0, 25, 49]) },
                { name: 'Early termination fee', value: rng.pick([0, 100]) },
            ],
            monthlyFees: [{ name: 'Equipment rental', value: rng.pick([0, 5, 10]) }],
            discounts: 'Autopay discount of 5.00 per month available.',
            speeds: { download: rng.pick([150, 300, 1000]), upload: rng.pick([20, 50, 100]), latency: rng.int(8, 30) },
            dataIncluded: (ctx.planName ?? '').includes('15GB') ? '15 GB' : 'Unlimited',
            labelId: 'F' + rng.digits(10),
        };
    }

    /* ---------------- agent notes ---------------- */

    async listNotes(entityType: EntityType, id: string) {
        await this.requireEntity(entityType, id);
        return (await this.notes.list((n) => n.entityType === entityType && n.entityId === id)).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    }

    async createNote(entityType: EntityType, id: string, body: NewNote): Promise<AgentNote> {
        await this.requireEntity(entityType, id);
        const tags = Array.isArray(body.tags) ? body.tags.map(String).filter(Boolean) : [];
        if (tags.length === 0) throw invalid('Select at least one note tag');
        const unknownTag = tags.find((t) => !NOTE_TAGS.includes(t));
        if (unknownTag) throw invalid(`Unknown note tag "${unknownTag}"`);
        const text = typeof body.note === 'string' ? body.note.trim() : '';
        if (!text) throw invalid('Agent notes are required');
        if (text.length > 5000) throw invalid('Agent notes are limited to 5000 characters');
        const files = Array.isArray(body.attachments) ? body.attachments : [];
        const saved: AgentNote['attachments'] = [];
        for (const f of files) {
            if (!f || typeof f.content !== 'string' || typeof f.name !== 'string') throw invalid('Attachment is not valid');
            const size = Buffer.from(f.content, 'base64').length;
            if (size > MAX_ATTACHMENT_BYTES) throw invalid(`${f.name} is larger than 5 MB`);
            const type = typeof f.type === 'string' ? f.type : '';
            if (!ATTACHMENT_TYPES.includes(type)) throw invalid(`${f.name}: only PDF, PNG, JPG, DOC and DOCX files are allowed`);
            const a = await this.attachments.insert({ name: f.name, type, size, content: f.content });
            saved.push({ id: a.id, name: a.name, type: a.type, size: a.size });
        }
        const note = await this.notes.insert({
            entityType,
            entityId: id,
            timestamp: this.clock.now().toISOString(),
            agentName: AGENT_NAME,
            note: text,
            tags,
            attachments: saved,
        });
        await this.log(entityType, id, `Agent note added (${tags.join(', ')})`, 'POST', '/v1notes/note');
        return note;
    }

    async getAttachment(attachmentId: string): Promise<Attachment> {
        return this.attachments.require(attachmentId);
    }

    /* ---------------- appointments ---------------- */

    async listAppointments(subscriberId: string) {
        await this.subscribers.require(subscriberId);
        const now = this.clock.now().toISOString();
        return (await this.appointments.list((a) => a.subscriberId === subscriberId && a.status === 'Scheduled' && a.end >= now)).sort((a, b) => a.start.localeCompare(b.start));
    }

    async updateAppointment(id: string, body: { changeTime?: unknown; date?: unknown; startTime?: unknown; agentNote?: unknown; notifyCustomer?: unknown }) {
        const appt = await this.appointments.require(id);
        if (appt.status !== 'Scheduled') throw invalid('Only scheduled appointments can be edited');
        const next = { ...appt };
        if (body.changeTime) {
            const date = String(body.date ?? '');
            const time = String(body.startTime ?? '');
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw invalid('Appointment date is required');
            if (!/^\d{2}:\d{2}$/.test(time)) throw invalid('Appointment time is required');
            const start = new Date(`${date}T${time}:00.000Z`);
            if (Number.isNaN(start.getTime())) throw invalid('Appointment date is not valid');
            if (start.getTime() < this.clock.now().getTime()) throw invalid('The new time slot must be in the future');
            const length = Date.parse(appt.end) - Date.parse(appt.start);
            next.start = start.toISOString();
            next.end = new Date(start.getTime() + length).toISOString();
        }
        if (typeof body.agentNote === 'string' && body.agentNote.trim()) {
            next.agentNote = body.agentNote.trim();
            next.agentNoteTime = this.clock.now().toISOString();
        }
        next.notifyCustomer = Boolean(body.notifyCustomer);
        await this.appointments.replace(next);
        await this.log('subscriber', appt.subscriberId, `${appt.activityType} appointment edited${body.changeTime ? ` to ${next.start}` : ''}`, 'PATCH', '/v1fieldservice/appointment');
        return next;
    }

    /* ---------------- support actions ---------------- */

    supportActions(entityType: EntityType) {
        return SUPPORT_ACTIONS[entityType];
    }

    async runSupportAction(entityType: EntityType, id: string, action: string) {
        await this.requireEntity(entityType, id);
        const def = SUPPORT_ACTIONS[entityType].find((a) => a.key === action);
        if (!def) throw invalid(`Unknown support action "${action}"`);
        let message = `${def.label}: done.`;
        let details: { label: string; value: string }[] | undefined;
        if (action === 'terminateBlankSubscriber') {
            const s = await this.subscribers.require(id);
            if (s.state !== 'Pending activation') throw invalid('Only a subscriber that never completed activation can be terminated this way');
            await this.subscribers.replace({ ...s, state: 'Terminated' });
            message = 'Subscriber terminated.';
        } else if (action === 'viewSubscriberServices') {
            const s = await this.subscribers.require(id);
            details = [
                { label: 'MSISDN', value: s.msisdn },
                { label: 'IMSI', value: s.imsi },
                { label: 'ICCID', value: s.iccid },
                { label: 'Voice', value: s.state === 'Active' ? 'Provisioned' : 'Barred' },
                { label: 'Data', value: s.state === 'Active' ? 'Provisioned' : 'Barred' },
                { label: 'SMS', value: s.state === 'Active' ? 'Provisioned' : 'Barred' },
                { label: 'VoLTE', value: 'Provisioned' },
            ];
            message = 'Services provisioned on the network.';
        } else if (action === 'networkCoverage') {
            details = [
                { label: '5G', value: 'Good' },
                { label: '4G', value: 'Excellent' },
                { label: 'Fibre', value: 'Available' },
            ];
            message = 'Coverage at the service address.';
        } else if (action === 'retryPayment') {
            const failed = (await this.transactions.list((t) => t.accountId === id && t.status === 'Failed')).sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
            if (!failed) throw invalid('There is no failed payment to retry');
            await this.transactions.replace({ ...failed, status: 'Succeeded' });
            message = `Payment ${failed.id} retried successfully.`;
        }
        await this.log(entityType, id, `Support action: ${def.label}`, 'POST', `/v1support/${action}`);
        return { message, details };
    }

    /* ---------------- layouts (versioned, see layouts.ts) ---------------- */

    getLayout(page: string) {
        return this.layoutVersions.get(page);
    }
    /** Commit straight to a scope (kept for API clients that predate versioning). */
    async saveLayout(page: string, scope: string, body: { sections?: unknown; message?: unknown }) {
        return (await this.layoutVersions.commit(page, scope, { ...body, message: body.message ?? 'Saved' })).layout;
    }
    resetLayout(page: string) {
        return this.layoutVersions.resetUser(page);
    }

    /* ---------------- settings ---------------- */

    async getSettings(): Promise<UserSettings> {
        return (await this.settings.get('me')) ?? { id: 'me', timezone: 'Asia/Kolkata', dateFormat: 'DD-MM-YYYY', timeFormat: '24', userSearchParam: 'accountId' };
    }

    async getMenu(): Promise<MenuArrangement> {
        return { custom: [], deleted: [], renames: {}, icons: {}, env: {}, ...((await this.getSettings()).menu ?? { order: [], groups: {}, hidden: [] }) };
    }

    /** Save the sidebar arrangement (drag and drop in the menu editor). */
    async saveMenu(body: unknown): Promise<MenuArrangement> {
        const b = (body ?? {}) as Record<string, unknown>;
        const names = (v: unknown, label: string, max = 200): string[] => {
            if (v === undefined) return [];
            if (!Array.isArray(v) || v.length > max || v.some((x) => typeof x !== 'string' || !x || x.length > 200)) throw invalid(`${label} must be a list of names`);
            return [...new Set(v as string[])];
        };
        const groupsRaw = b.groups ?? {};
        if (typeof groupsRaw !== 'object' || Array.isArray(groupsRaw) || Object.keys(groupsRaw).length > 100) throw invalid('groups must map a menu group to its entries');
        const groups: Record<string, string[]> = {};
        for (const [k, v] of Object.entries(groupsRaw as Record<string, unknown>)) groups[k] = names(v, `Group ${k}`);
        const customRaw = b.custom ?? [];
        if (!Array.isArray(customRaw) || customRaw.length > 100) throw invalid('custom must be a list of at most 100 entries');
        const ids = new Set<string>();
        const custom: CustomMenuEntry[] = customRaw.map((raw, i) => {
            const c = (raw ?? {}) as Record<string, unknown>;
            const id = String(c.id ?? '');
            if (!/^c-[a-z0-9-]{1,40}$/.test(id) || ids.has(id)) throw invalid(`Custom entry ${i + 1} needs a unique id`);
            ids.add(id);
            if (c.kind !== 'menu' && c.kind !== 'sub') throw invalid(`Custom entry ${i + 1}: kind must be menu or sub`);
            const name = typeof c.name === 'string' ? c.name.trim() : '';
            if (!name || name.length > 40) throw invalid(`Custom entry ${i + 1}: the name must be 1 to 40 characters`);
            const entry: CustomMenuEntry = { id, kind: c.kind, name };
            if (c.link !== undefined && c.link !== null && c.link !== '') {
                const link = String(c.link).trim();
                if (link.length > 500 || !(/^\/(?!\/)[^\s]*$/.test(link) || /^https:\/\/[^\s]+$/.test(link))) throw invalid(`"${name}": the link must be a portal page (/...) or a web address (https://...)`);
                entry.link = link;
            } else if (c.kind === 'sub') throw invalid(`"${name}": a sub-menu needs a link`);
            if (c.icon !== undefined && c.icon !== null && c.icon !== '') {
                if (typeof c.icon !== 'string' || !/^[A-Za-z0-9/_-]{1,80}$/.test(c.icon)) throw invalid(`"${name}": unknown icon`);
                entry.icon = c.icon;
            }
            return entry;
        });
        const record = (v: unknown, label: string, check: (x: string) => boolean, what: string): Record<string, string> => {
            if (v === undefined || v === null) return {};
            if (typeof v !== 'object' || Array.isArray(v) || Object.keys(v).length > 300) throw invalid(`${label} must map menu entries to values`);
            const out: Record<string, string> = {};
            for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
                if (typeof x !== 'string' || !check(x.trim())) throw invalid(`${label}: ${what}`);
                out[k] = x.trim();
            }
            return out;
        };
        const renames = record(b.renames, 'renames', (x) => x.length >= 1 && x.length <= 40, 'a name must be 1 to 40 characters');
        const icons = record(b.icons, 'icons', (x) => /^[A-Za-z0-9/_-]{1,80}$/.test(x), 'unknown icon');
        const envRaw = (b.env ?? {}) as Record<string, unknown>;
        if (typeof envRaw !== 'object' || Array.isArray(envRaw)) throw invalid('env must be an object');
        const env: { label?: string; hidden?: boolean } = {};
        if (envRaw.label !== undefined && envRaw.label !== null && envRaw.label !== '') {
            const label = String(envRaw.label).trim();
            if (label.length > 30) throw invalid('The environment label can be at most 30 characters');
            if (label) env.label = label;
        }
        if (envRaw.hidden) env.hidden = true;
        const menu: MenuArrangement = {
            order: names(b.order, 'order'),
            groups,
            hidden: names(b.hidden, 'hidden'),
            custom,
            deleted: names(b.deleted, 'deleted'),
            ...(b.footer !== undefined ? { footer: names(b.footer, 'footer') } : {}),
            renames,
            icons,
            env,
        };
        const current = await this.getSettings();
        const next: UserSettings = { ...current, menu };
        if (await this.settings.get('me')) await this.settings.replace(next);
        else await this.settings.insert(next);
        return menu;
    }

    async resetMenu(): Promise<MenuArrangement> {
        const current = await this.getSettings();
        if (current.menu) {
            const { menu: _drop, ...rest } = current;
            await this.settings.replace(rest as UserSettings);
        }
        return { order: [], groups: {}, hidden: [], custom: [], deleted: [], renames: {}, icons: {}, env: {} };
    }

    async saveSettings(body: Partial<UserSettings>): Promise<UserSettings> {
        const current = await this.getSettings();
        const next: UserSettings = { ...current };
        if (body.timezone !== undefined) {
            try {
                new Intl.DateTimeFormat('en-US', { timeZone: String(body.timezone) });
            } catch {
                throw invalid(`Unknown time zone "${body.timezone}"`);
            }
            next.timezone = String(body.timezone);
        }
        if (body.dateFormat !== undefined) {
            if (!['DD-MM-YYYY', 'MM-DD-YYYY', 'YYYY-MM-DD'].includes(body.dateFormat)) throw invalid('Unknown date format');
            next.dateFormat = body.dateFormat;
        }
        if (body.timeFormat !== undefined) {
            if (!['12', '24'].includes(String(body.timeFormat))) throw invalid('Time format must be 12 or 24');
            next.timeFormat = String(body.timeFormat) as UserSettings['timeFormat'];
        }
        if (body.userSearchParam !== undefined) {
            if (!SEARCH_OPTIONS.some((o) => o.key === body.userSearchParam)) throw invalid('Unknown search parameter');
            next.userSearchParam = body.userSearchParam;
        }
        if (await this.settings.get('me')) await this.settings.replace(next);
        else await this.settings.insert(next);
        return next;
    }

    /* ---------------- message and external log history pages ---------------- */

    async messageHistory(filter: { userId?: string }) {
        const users = filter.userId ? [await this.users.require(filter.userId)] : await this.users.list();
        const rows: Record<string, unknown>[] = [];
        for (const u of users) {
            for (const r of generateRows('messageHistory', await this.tileContext('user', u.id)) ?? []) rows.push({ ...r, userId: u.id, recipient: u.email });
        }
        return rows.sort((a, b) => String(b.sentAt).localeCompare(String(a.sentAt)));
    }

    async externalLogHistory(filter: { entityType?: string; entityId?: string }) {
        const rows: Record<string, unknown>[] = [];
        const add = async (t: EntityType, id: string) => {
            const key = t === 'user' ? 'externalLogHistoryUser' : t === 'account' ? 'externalLogHistoryAccount' : 'externalLogHistorySubscriber';
            for (const r of generateRows(key, await this.tileContext(t, id)) ?? []) rows.push({ ...r, entityType: t, entityId: id });
        };
        if (filter.entityType && filter.entityId) {
            const t = this.entityType(filter.entityType);
            await this.requireEntity(t, filter.entityId);
            await add(t, filter.entityId);
        } else {
            for (const u of await this.users.list()) await add('user', u.id);
        }
        return rows.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
    }

    /* ---------------- helpers ---------------- */

    entityType(raw: string): EntityType {
        const t = ENTITY_TYPES.find((x) => x === raw);
        if (!t) throw invalid(`Unknown entity type "${raw}"`);
        return t;
    }

    async requireEntity(entityType: EntityType, id: string): Promise<void> {
        const c = entityType === 'user' ? this.users : entityType === 'account' ? this.accounts : entityType === 'subscriber' ? this.subscribers : this.organizations;
        await (c as Collection<{ id: string }>).require(id);
    }

    private async currencyOf(entityType: EntityType, id: string): Promise<string> {
        if (entityType === 'account') return (await this.accounts.get(id))?.currency ?? 'USD';
        if (entityType === 'subscriber') {
            const s = await this.subscribers.get(id);
            return (s && (await this.accounts.get(s.accountId))?.currency) ?? 'USD';
        }
        if (entityType === 'user') return (await this.accounts.list((a) => a.ownerUserId === id))[0]?.currency ?? 'USD';
        return 'USD';
    }

    async tileContext(entityType: EntityType, id: string): Promise<TileContext> {
        const ctx: TileContext = { entityType, entityId: id, now: this.clock.now().getTime(), currency: await this.currencyOf(entityType, id) };
        if (entityType === 'user') {
            ctx.user = await this.users.get(id);
            ctx.msisdn = ctx.user?.msisdn;
            const sub = (await this.subscribers.list((s) => s.userId === id))[0];
            ctx.planName = sub?.planName;
        } else if (entityType === 'account') {
            ctx.account = await this.accounts.get(id);
            const sub = (await this.subscribers.list((s) => s.accountId === id))[0];
            ctx.subscriber = sub;
            ctx.msisdn = sub?.msisdn;
            ctx.planName = sub?.planName;
        } else if (entityType === 'subscriber') {
            ctx.subscriber = await this.subscribers.get(id);
            ctx.msisdn = ctx.subscriber?.msisdn;
            ctx.planName = ctx.subscriber?.planName;
        }
        return ctx;
    }

    private lastLogAt = 0;

    async log(entityType: EntityType, entityId: string, action: string, method: string, path: string, status = 200): Promise<void> {
        // strictly increasing so the newest entry sorts first even when the clock stands still
        this.lastLogAt = Math.max(this.clock.now().getTime(), this.lastLogAt + 1);
        await this.audit.insert({
            entityType,
            entityId,
            timestamp: new Date(this.lastLogAt).toISOString(),
            agent: AGENT_NAME,
            service: 'Customer Care Suite',
            method,
            path,
            status,
            action,
        });
    }
}

/** Pack tiles into a 12-column grid, left to right, top to bottom. */
export function buildDefaultLayout(page: PageKey): LayoutSection[] {
    return withDetails(DEFAULT_LAYOUTS[page].map((s) => {
        const layout: TileLayoutItem[] = [];
        let x = 0;
        let y = 0;
        let rowH = 0;
        s.tiles.forEach((t: DefaultTile, i) => {
            const key = typeof t === 'string' ? t : t.key;
            const def = TILE_BY_KEY.get(key)!;
            const size = typeof t === 'string' ? TILE_SIZES[def.size] : { w: t.w, h: t.h };
            if (x + size.w > 12) {
                x = 0;
                y += rowH;
                rowH = 0;
            }
            layout.push({ i: `${key}-${i}`, x, y, w: size.w, h: size.h, componentKey: key });
            x += size.w;
            rowH = Math.max(rowH, size.h);
        });
        return { sectionName: s.sectionName, isInitiallyCollapsed: Boolean(s.isInitiallyCollapsed), layout };
    }));
}

/** Imported or saved layouts are checked: known tiles allowed on this page, inside the 12-column grid. */
export function validateSections(page: PageKey, raw: unknown): LayoutSection[] {
    if (!Array.isArray(raw)) throw invalid('Layout must contain a list of sections');
    if (raw.length > 31) throw invalid('A page can have at most 30 sections');
    let details = 0;
    const out = raw.map((s, si): LayoutSection => {
        if (!s || typeof s !== 'object') throw invalid(`Section ${si + 1} is not valid`);
        const sec = s as Record<string, unknown>;
        if (sec.kind === 'details') {
            if (++details > 1) throw invalid('The details block can only be placed once');
            return { sectionName: DETAILS_SECTION_NAME, isInitiallyCollapsed: false, layout: [], kind: 'details' };
        }
        if (sec.kind !== undefined && sec.kind !== null) throw invalid(`Section ${si + 1} has an unknown kind`);
        const name = typeof sec.sectionName === 'string' ? sec.sectionName.trim() : '';
        if (!name) throw invalid(`Section ${si + 1} needs a name`);
        if (!Array.isArray(sec.layout)) throw invalid(`Section "${name}" has no tile list`);
        const seen = new Set<string>();
        const layout = sec.layout.map((it, ti) => {
            const item = it as Record<string, unknown>;
            const key = String(item?.componentKey ?? '');
            const def = TILE_BY_KEY.get(key);
            if (!def) throw invalid(`Section "${name}": unknown tile "${key}"`);
            if (!def.pages.includes(page)) throw invalid(`Section "${name}": the ${def.name} tile cannot be placed on this page`);
            const n = (v: unknown, min: number, max: number, label: string) => {
                const x = Number(v);
                if (!Number.isInteger(x) || x < min || x > max) throw invalid(`Section "${name}", tile ${def.name}: ${label} is out of range`);
                return x;
            };
            const w = n(item.w, 1, 12, 'width');
            const x = n(item.x, 0, 11, 'x');
            if (x + w > 12) throw invalid(`Section "${name}", tile ${def.name}: does not fit in 12 columns`);
            const i = typeof item.i === 'string' && item.i ? item.i : `${key}-${ti}`;
            if (seen.has(i)) throw invalid(`Section "${name}": duplicate tile id "${i}"`);
            seen.add(i);
            let title: string | undefined;
            if (item.title !== undefined && item.title !== null && item.title !== '') {
                if (typeof item.title !== 'string') throw invalid(`Section "${name}", tile ${def.name}: title must be text`);
                title = item.title.trim().slice(0, 60) || undefined;
            }
            return { i, x, y: n(item.y, 0, 1000, 'y'), w, h: n(item.h, 1, 20, 'height'), componentKey: key, ...(title ? { title } : {}) };
        });
        return { sectionName: name, isInitiallyCollapsed: Boolean(sec.isInitiallyCollapsed), layout };
    });
    return withDetails(out);
}
