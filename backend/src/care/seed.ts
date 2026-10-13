/**
 * Demo data for the Customer Care Suite: two organizations, six users with their accounts and
 * subscribers, wallets, billing transactions with charges, invoices, appointments, agent notes,
 * Salesforce campaign messages, portal roles and a starting audit trail.
 */
import type { Store } from '../common/store.ts';
import type {
    AgentNote,
    Appointment,
    AuditLog,
    BillingTransaction,
    CcsAccount,
    CcsOrganization,
    CcsSubscriber,
    CcsUser,
    EntityType,
    Wallet,
} from './model.ts';
import { DAY, Rng, iso } from './random.ts';

export interface Invoice {
    id: string;
    accountId: string;
    number: string;
    issueDate: string;
    dueDate: string;
    periodStart: string;
    periodEnd: string;
    amount: number;
    amountDue: number;
    currency: string;
    status: 'Paid' | 'Unpaid' | 'Overdue' | 'Partially paid';
    lines: { description: string; amount: number }[];
}
export interface PortalRole {
    id: string;
    userId: string;
    entityType: EntityType;
    entityId: string;
    role: 'admin' | 'member' | 'viewer' | 'billing';
}
export interface SalesforceMessage {
    id: string;
    accountId: string;
    campaignName: string;
    messageSent: string;
    sender: string;
    subject: string;
    message: string;
}

export const CARE_COLLECTIONS = {
    users: 'ccsUser',
    accounts: 'ccsAccount',
    subscribers: 'ccsSubscriber',
    organizations: 'ccsOrganization',
    wallets: 'ccsWallet',
    roles: 'ccsRole',
    notes: 'ccsAgentNote',
    attachments: 'ccsAttachment',
    appointments: 'ccsAppointment',
    transactions: 'ccsBillingTransaction',
    invoices: 'ccsInvoice',
    salesforce: 'ccsSalesforceMessage',
    layouts: 'ccsLayout',
    settings: 'ccsSettings',
    audit: 'ccsAuditLog',
} as const;

interface UserSeed {
    id: string;
    first: string;
    last: string;
    email: string;
    msisdn: string;
    org?: string;
    deletion?: CcsUser['accountDeletion'];
    accounts: { id: string; name: string; currency: string; subs: { id: string; msisdn: string; plan: string; state?: CcsSubscriber['state'] }[] }[];
}

const ORGS: CcsOrganization[] = [
    { id: '799ab1bdeba14ca8b7abd52f06a69d26', name: 'luisgarzontmo015lfFirstOrg', domain: 'lotusflare.com', createdAt: '' },
    { id: '3f0c9a7d2b8e4c51a6e1d47b90c2f8aa', name: 'Globe Business Solutions', domain: 'globe-business.example.com', createdAt: '' },
];

const USERS: UserSeed[] = [
    {
        id: '4beb805a417f4f908d907003a409e5d7',
        first: 'Yan',
        last: 'Li',
        email: 'yan.li@example.com',
        msisdn: '27710000101',
        accounts: [
            {
                id: '94caf1984e6e41a88ea7cce35bee9a24',
                name: 'Yan Li - Home',
                currency: 'ZAR',
                subs: [
                    { id: '39668fc4472cbf3505e9e1433cea', msisdn: '27710000101', plan: 'Fibre 300 + Mobile 15GB' },
                    { id: '8d1f4c2b9a7e46d0b3c5e8f1a2d4c6b8', msisdn: '27710000102', plan: 'Mobile 15GB' },
                ],
            },
        ],
    },
    {
        id: 'fba61ae22de7479b9106cf1a5c3e2d90',
        first: 'Luis',
        last: 'Garzon',
        email: 'luis.garzon+tmo_015_lf@lotusflare.com',
        msisdn: '15550100015',
        org: '799ab1bdeba14ca8b7abd52f06a69d26',
        accounts: [
            {
                id: '99b81ab636494140b21dead6dfc70b82',
                name: 'LotusFlare Test Org - Billing',
                currency: 'USD',
                subs: [
                    { id: 'c4a7e2f19b3d48a6a1e5d7c9b2f4e6a8', msisdn: '15550100016', plan: 'Business Unlimited' },
                    { id: 'e7b2d9c4a1f64e8bb3a5c7d9e1f2a4b6', msisdn: '15550100017', plan: 'Business Unlimited', state: 'Suspended' },
                ],
            },
        ],
    },
    {
        id: '5d2e8f1a3b4c4d6e8f0a1b2c3d4e5f60',
        first: 'Asha',
        last: 'Verma',
        email: 'asha.verma@example.com',
        msisdn: '919810000001',
        deletion: { status: 'Scheduled', scheduleTime: '', requestedBy: 'Owner' },
        accounts: [
            {
                id: 'a1b2c3d4e5f64788990aabbccddeeff0',
                name: 'Asha Verma - Postpaid',
                currency: 'USD',
                subs: [{ id: 'b2c3d4e5f6a74899a0b1c2d3e4f5a6b7', msisdn: '919810000001', plan: 'Unlimited Talk 10GB' }],
            },
            {
                id: 'c3d4e5f6a7b84900b1c2d3e4f5a6b7c8',
                name: 'Asha Verma - Family',
                currency: 'USD',
                subs: [
                    { id: 'd4e5f6a7b8c94a11c2d3e4f5a6b7c8d9', msisdn: '919810000002', plan: 'Family Share 50GB' },
                    { id: 'e5f6a7b8c9d04b22d3e4f5a6b7c8d9e0', msisdn: '919810000003', plan: 'Family Share 50GB', state: 'Pending activation' },
                ],
            },
        ],
    },
    {
        id: '6e3f9a2b4c5d4e7f9a1b2c3d4e5f6a71',
        first: 'Michelle',
        last: 'Bautista',
        email: 'michelle.bautista@globe-business.example.com',
        msisdn: '639170000323',
        org: '3f0c9a7d2b8e4c51a6e1d47b90c2f8aa',
        accounts: [
            {
                id: 'f6a7b8c9d0e14c33e4f5a6b7c8d9e0f1',
                name: 'Globe Business - Corporate',
                currency: 'USD',
                subs: [{ id: 'a7b8c9d0e1f24d44f5a6b7c8d9e0f1a2', msisdn: '639170000324', plan: 'Corporate 100GB' }],
            },
        ],
    },
    {
        id: '7f4a0b3c5d6e4f80ab2c3d4e5f6a7b82',
        first: 'Adrian',
        last: 'Tan',
        email: 'adrian.tan@globe-business.example.com',
        msisdn: '6591000112',
        org: '3f0c9a7d2b8e4c51a6e1d47b90c2f8aa',
        deletion: { status: 'Terminating', scheduleTime: '', requestedBy: 'System initiated' },
        accounts: [
            {
                id: 'b8c9d0e1f2a34e55a6b7c8d9e0f1a2b3',
                name: 'Adrian Tan - Mobile',
                currency: 'USD',
                subs: [{ id: 'c9d0e1f2a3b44f66b7c8d9e0f1a2b3c4', msisdn: '6591000112', plan: 'Mobile 15GB', state: 'Terminated' }],
            },
        ],
    },
    {
        id: '8a5b1c4d6e7f4091bc3d4e5f6a7b8c93',
        first: 'Priya',
        last: 'Nair',
        email: 'priya.nair@example.com',
        msisdn: '447700900123',
        accounts: [
            {
                id: 'd0e1f2a3b4c54077c8d9e0f1a2b3c4d5',
                name: 'Priya Nair - Prepaid',
                currency: 'USD',
                subs: [{ id: 'e1f2a3b4c5d64188d9e0f1a2b3c4d5e6', msisdn: '447700900123', plan: '15GB Prepaid' }],
            },
        ],
    },
];

const CAMPAIGNS = [
    ['Spring Upgrade Offer', 'Upgrade to 5G and get 3 months free', 'Your 5G upgrade is ready'],
    ['Bill Reminder', 'Your bill is due in 5 days', 'Payment reminder'],
    ['Loyalty Rewards', 'You earned 500 loyalty points this month', 'Thanks for staying with us'],
    ['Roaming Pack', 'Travelling soon? Add a roaming pack before you go', 'Stay connected abroad'],
];

const NOTE_TEXTS = [
    'Customer called about a duplicate charge on the last invoice. Raised a refund request for the recovery fee.',
    'Explained the fair-usage policy and the 15GB allowance. Customer satisfied.',
    'Installation appointment confirmed by phone. Customer asked for a call 30 minutes before arrival.',
    'Verified identity with document number and last payment amount before changing the plan.',
];

export async function seedCare(store: Store, now: Date): Promise<void> {
    const rng = new Rng('dno-care-seed');
    const t = now.getTime();
    const col = <T extends { id: string }>(name: string) => store.collection<T>(name);

    const orgs = col<CcsOrganization>(CARE_COLLECTIONS.organizations);
    for (const o of ORGS) await orgs.insert({ ...o, createdAt: iso(t - rng.int(300, 700) * DAY) });

    const users = col<CcsUser>(CARE_COLLECTIONS.users);
    const accounts = col<CcsAccount>(CARE_COLLECTIONS.accounts);
    const subscribers = col<CcsSubscriber>(CARE_COLLECTIONS.subscribers);
    const wallets = col<Wallet>(CARE_COLLECTIONS.wallets);
    const roles = col<PortalRole>(CARE_COLLECTIONS.roles);
    const transactions = col<BillingTransaction>(CARE_COLLECTIONS.transactions);
    const invoices = col<Invoice>(CARE_COLLECTIONS.invoices);
    const appointments = col<Appointment>(CARE_COLLECTIONS.appointments);
    const notes = col<AgentNote>(CARE_COLLECTIONS.notes);
    const salesforce = col<SalesforceMessage>(CARE_COLLECTIONS.salesforce);
    const audit = col<AuditLog>(CARE_COLLECTIONS.audit);

    const wallet = (entityType: EntityType, id: string, currency: string, amount: number) =>
        wallets.insert({
            id,
            entityType,
            currency,
            amount,
            activeEpoch: amount > 0 ? iso(t + rng.int(10, 40) * DAY) : undefined,
            graceEpoch: amount > 0 ? iso(t + rng.int(41, 70) * DAY) : undefined,
        });

    let invoiceNo = 1000;
    for (const u of USERS) {
        const created = t - rng.int(200, 900) * DAY;
        await users.insert({
            id: u.id,
            firstName: u.first,
            lastName: u.last,
            email: u.email,
            emailVerified: rng.chance(0.8),
            msisdn: u.msisdn,
            verified: rng.chance(0.7),
            birthday: `19${rng.int(70, 99)}-0${rng.int(1, 9)}-1${rng.int(0, 9)}`,
            nationality: rng.pick(['ZA', 'US', 'IN', 'PH', 'SG', 'GB']),
            documentType: 'Passport',
            documentNumber: rng.pick(['P', 'X', 'K']) + rng.digits(8),
            createdAt: iso(created),
            lastActive: iso(t - rng.int(0, 20) * DAY - rng.int(0, 86_000) * 1000),
            cardinality: u.accounts.length > 1 ? 'multiple' : 'single',
            organizationId: u.org,
            flags: { isLocallyTied: rng.chance(0.3), isFraud: false, isBlocked: false, marketingOptIn: rng.chance(0.6) },
            tcAcceptedAt: iso(created + DAY),
            accountDeletion: u.deletion ? { ...u.deletion, scheduleTime: u.deletion.status === 'Scheduled' ? iso(t + 14 * DAY) : iso(t - DAY) } : undefined,
        });
        await wallet('user', u.id, u.accounts[0]!.currency, 0);
        if (u.org) await roles.insert({ id: rng.hex(), userId: u.id, entityType: 'organization', entityId: u.org, role: u.first === 'Luis' || u.first === 'Michelle' ? 'admin' : 'member' });

        for (const a of u.accounts) {
            const aCreated = created + rng.int(1, 30) * DAY;
            await accounts.insert({
                id: a.id,
                name: a.name,
                ownerUserId: u.id,
                organizationId: u.org,
                state: a.subs.every((s) => s.state === 'Terminated') ? 'Terminated' : 'Active',
                currency: a.currency,
                createdAt: iso(aCreated),
                address: rng.pick(['11 North Buona Vista Drive, #09-01, Singapore 138589', '221B Baker Street, London NW1 6XE', '7 Loop Street, Cape Town 8001', '1600 Amphitheatre Pkwy, Mountain View, CA 94043']),
                paymentMethod: rng.pick(['Visa **** 4242', 'Mastercard **** 5454', 'Direct debit']),
                billingDay: rng.int(1, 28),
                taxExempt: false,
            });
            await wallet('account', a.id, a.currency, a.currency === 'ZAR' ? 0 : rng.money(5, 120));
            await roles.insert({ id: rng.hex(), userId: u.id, entityType: 'account', entityId: a.id, role: 'admin' });

            // billing transactions with their charges (Billing Transaction V2 + refund sidebar)
            for (let k = 0; k < 4; k++) {
                const ts = t - (k * 30 + rng.int(0, 5)) * DAY - rng.int(0, 40_000) * 1000;
                const base = rng.pick([25, 30, 45, 60]);
                const fee = rng.pick([1.63, 2.1, 0]);
                const tax = Math.round(base * 0.0888 * 100) / 100;
                const charges = [
                    { id: rng.hex(), offerName: rng.pick(['15GB', '30GB', 'Unlimited', 'Fibre 300']), amountWithoutTax: base, discount: 0, taxes: tax, refundedAmount: 0 },
                    ...(fee ? [{ id: rng.hex(), offerName: 'Recovery fee', amountWithoutTax: fee, discount: 0, taxes: 0, refundedAmount: 0 }] : []),
                ];
                const total = Math.round((base + fee + tax) * 100) / 100;
                const type = k === 3 ? 'Reserve' : rng.pick(['Manual Payment', 'Auto Payment'] as const);
                await transactions.insert({
                    id: rng.uuid(),
                    accountId: a.id,
                    type,
                    timestamp: iso(ts),
                    amount: total,
                    originalAmount: Math.round((base + fee) * 100) / 100,
                    currency: a.currency,
                    status: k === 2 && rng.chance(0.5) ? 'Failed' : 'Succeeded',
                    transactionType: 'Charge',
                    paymentMethod: rng.pick(['Visa **** 4242', 'Mastercard **** 5454']),
                    charges,
                    discounts: k === 0 ? [{ offerName: charges[0]!.offerName, discount: 5, pricingRuleName: 'Loyalty 5 off', pricingRuleId: rng.hex(12) }] : [],
                    refunds: [],
                });
            }
            // invoices (latest one unpaid)
            for (let k = 0; k < 4; k++) {
                const issue = t - k * 30 * DAY - 3 * DAY;
                const lines = [
                    { description: a.subs[0]!.plan + ' - monthly charge', amount: rng.pick([25, 30, 45, 60]) },
                    { description: 'Taxes and fees', amount: rng.money(2, 6) },
                ];
                const amount = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
                const unpaid = k === 0 && a.currency !== 'ZAR';
                invoiceNo += 1;
                await invoices.insert({
                    id: rng.hex(),
                    accountId: a.id,
                    number: `INV-${invoiceNo}`,
                    issueDate: iso(issue),
                    dueDate: iso(issue + 15 * DAY),
                    periodStart: iso(issue - 30 * DAY),
                    periodEnd: iso(issue - DAY),
                    amount,
                    amountDue: unpaid ? amount : 0,
                    currency: a.currency,
                    status: unpaid ? 'Unpaid' : 'Paid',
                    lines,
                });
            }
            for (const [k, [campaign, msg, subject]] of CAMPAIGNS.entries()) {
                if (a.currency === 'ZAR' && k > 0) break;
                await salesforce.insert({
                    id: rng.hex(),
                    accountId: a.id,
                    campaignName: campaign!,
                    messageSent: iso(t - (k * 9 + 2) * DAY),
                    sender: 'marketing@lotusflare.example.com',
                    subject: subject!,
                    message: msg!,
                });
            }

            for (const s of a.subs) {
                const sCreated = aCreated + rng.int(0, 5) * DAY;
                await subscribers.insert({
                    id: s.id,
                    accountId: a.id,
                    userId: u.id,
                    msisdn: s.msisdn,
                    imsi: '65501' + rng.digits(10),
                    iccid: '8927' + rng.digits(15),
                    state: s.state ?? 'Active',
                    planName: s.plan,
                    createdAt: iso(sCreated),
                    activatedAt: s.state === 'Pending activation' ? undefined : iso(sCreated + DAY),
                    deviceModel: rng.pick(['iPhone 15 Pro', 'Galaxy S24', 'Pixel 9', 'Nokia FastMile 5G Gateway']),
                });
                await wallet('subscriber', s.id, a.currency, a.currency === 'ZAR' ? 0 : rng.money(0, 40));
                await roles.insert({ id: rng.hex(), userId: u.id, entityType: 'subscriber', entityId: s.id, role: 'member' });
                if (s.state !== 'Terminated' && (rng.chance(0.85) || s.id === '39668fc4472cbf3505e9e1433cea')) {
                    const day = t + rng.int(1, 10) * DAY;
                    const start = new Date(day);
                    start.setUTCHours(rng.pick([8, 10, 13, 15]), 0, 0, 0);
                    await appointments.insert({
                        id: rng.hex(16).toUpperCase(),
                        subscriberId: s.id,
                        activityType: s.id === '39668fc4472cbf3505e9e1433cea' ? 'Installation' : rng.pick(['Installation', 'Repair'] as const),
                        start: start.toISOString(),
                        end: new Date(start.getTime() + 2 * 3600_000).toISOString(),
                        status: 'Scheduled',
                        agentNote: rng.chance(0.6) ? 'Gate code 4411. Customer prefers a call before arrival.' : undefined,
                        agentNoteTime: iso(t - DAY),
                        notifyCustomer: true,
                    });
                }
            }
        }
    }
    // the org's second admin and a viewer, so the Access List has more than one row
    await roles.insert({ id: rng.hex(), userId: '6e3f9a2b4c5d4e7f9a1b2c3d4e5f6a71', entityType: 'account', entityId: '99b81ab636494140b21dead6dfc70b82', role: 'viewer' });

    // a few agent notes
    const notable: [EntityType, string][] = [
        ['subscriber', '39668fc4472cbf3505e9e1433cea'],
        ['account', '94caf1984e6e41a88ea7cce35bee9a24'],
        ['user', '5d2e8f1a3b4c4d6e8f0a1b2c3d4e5f60'],
    ];
    for (const [k, [entityType, entityId]] of notable.entries()) {
        await notes.insert({
            id: rng.hex(),
            entityType,
            entityId,
            timestamp: iso(t - (k + 1) * 2 * DAY),
            agentName: rng.pick(['Yan Li', 'Maria Lopez', 'Daniel Kim']),
            note: NOTE_TEXTS[k]!,
            tags: [rng.pick(['Interaction', 'Billing', 'Complaint', 'Technical'])],
            attachments: [],
        });
    }

    for (let k = 0; k < 6; k++) {
        await audit.insert({
            id: rng.hex(),
            entityType: 'user',
            entityId: USERS[0]!.id,
            timestamp: iso(t - k * 3600_000 * 5),
            agent: 'Yan Li',
            service: 'User Management (v3)',
            method: 'POST',
            path: '/v3usermanager/fetchserviceinfo',
            status: 200,
            action: 'View profile',
        });
    }
}
