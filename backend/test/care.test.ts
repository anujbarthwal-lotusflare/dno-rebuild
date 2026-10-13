import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.ts';
import { FixedClock } from '../src/common/runtime.ts';
import { seed } from '../src/seed.ts';
import { buildRouter } from '../src/api.ts';
import { createHttpServer } from '../src/http.ts';
import { buildDefaultLayout, validateSections } from '../src/care/service.ts';
import { TILES } from '../src/care/tiles.ts';

const YAN = '4beb805a417f4f908d907003a409e5d7';
const YAN_ACCOUNT = '94caf1984e6e41a88ea7cce35bee9a24';
const YAN_SUB = '39668fc4472cbf3505e9e1433cea';
const ORG = '799ab1bdeba14ca8b7abd52f06a69d26';
const ASHA_ACCOUNT = 'a1b2c3d4e5f64788990aabbccddeeff0';

async function fresh() {
    const clock = new FixedClock('2026-07-20T09:30:00Z');
    const app = createApp({ clock });
    await seed(app);
    await app.care.ensureSeeded();
    await app.customer360.ensureSeeded();
    return { app, clock };
}

test('search: each parameter, operators and not-found', async () => {
    const { app } = await fresh();
    const byAccount = await app.care.search({ option: 'accountId', operator: 'match', value: YAN_ACCOUNT });
    assert.equal(byAccount.entityType, 'account');
    assert.equal(byAccount.results[0]!.id, YAN_ACCOUNT);

    const bySub = await app.care.search({ option: 'subscriberId', operator: 'match', value: YAN_SUB });
    assert.equal(bySub.results[0]!.userId, YAN);

    const byEmail = await app.care.search({ option: 'email', operator: 'match', value: 'YAN.LI@example.com' });
    assert.equal(byEmail.results[0]!.id, YAN);

    const starts = await app.care.search({ option: 'msisdn', operator: 'startsWith', value: '+91 98100' });
    assert.equal(starts.results.length, 3);

    await assert.rejects(app.care.search({ option: 'accountId', operator: 'startsWith', value: 'a' }), /cannot be searched/);
    await assert.rejects(app.care.search({ option: 'userId', operator: 'match', value: 'nope' }), /User not found/);
    await assert.rejects(app.care.search({ option: 'email', operator: 'match', value: '' }), /required/);
});

test('associated entities follow the user > account > subscriber hierarchy', async () => {
    const { app } = await fresh();
    const forUser = await app.care.associatedEntities('user', YAN);
    assert.deepEqual(forUser.rows.map((r) => r.level), ['Account', 'Subscriber', 'Subscriber']);
    const forSub = await app.care.associatedEntities('subscriber', YAN_SUB);
    assert.deepEqual(forSub.rows.map((r) => [r.level, r.id]), [['User', YAN], ['Account', YAN_ACCOUNT]]);
    const forOrg = await app.care.associatedEntities('organization', ORG);
    assert.equal(forOrg.organization!.name, 'luisgarzontmo015lfFirstOrg');
});

test('wallet: top-up extends validity, deduct cannot exceed the balance', async () => {
    const { app } = await fresh();
    const before = await app.care.getWallet('account', YAN_ACCOUNT);
    assert.equal(before.amount, 0);
    assert.equal(before.currency, 'ZAR');
    const after = await app.care.topUp('account', YAN_ACCOUNT, { amount: 50, voucherCode: 'SPRING-2026' });
    assert.equal(after.amount, 50);
    assert.equal(after.activeEpoch, '2026-08-19T09:30:00.000Z');
    await assert.rejects(app.care.deduct('account', YAN_ACCOUNT, { amount: 60 }), /cannot be greater than the balance/);
    assert.equal((await app.care.deduct('account', YAN_ACCOUNT, { amount: 20.5 })).amount, 29.5);
    await assert.rejects(app.care.topUp('account', YAN_ACCOUNT, { amount: 0 }), /greater than 0/);
    const audit = await app.care.tileData('auditLogs', 'account', YAN_ACCOUNT);
    assert.match(String(audit.rows![0]!.action), /Wallet deduction ZAR 20.50/);
});

test('refund: selected charges, reason required, no double refund', async () => {
    const { app } = await fresh();
    const tx = (await app.care.listTransactions(ASHA_ACCOUNT)).find((t) => t.status === 'Succeeded' && t.type !== 'Reserve' && t.charges.length > 1)!;
    await assert.rejects(app.care.refund(tx.id, { chargeIds: [tx.charges[1]!.id] }), /reason is required/);
    await assert.rejects(app.care.refund(tx.id, { chargeIds: [], reason: 'x' }), /at least one charge/);
    const partly = await app.care.refund(tx.id, { chargeIds: [tx.charges[1]!.id], reason: 'Fee charged twice' });
    assert.equal(partly.status, 'Partially refunded');
    assert.equal(partly.refunds[0]!.refundAmount, tx.charges[1]!.amountWithoutTax + tx.charges[1]!.taxes);
    await assert.rejects(app.care.refund(tx.id, { chargeIds: [tx.charges[1]!.id], reason: 'again' }), /already been refunded/);
    const full = await app.care.refund(tx.id, { chargeIds: [tx.charges[0]!.id], reason: 'Goodwill' });
    assert.equal(full.status, 'Refunded');
    await assert.rejects(app.care.refund(tx.id, { chargeIds: [tx.charges[0]!.id], reason: 'x' }), /cannot be refunded/);
});

test('agent notes: tags and text required, attachments typed and stored', async () => {
    const { app } = await fresh();
    await assert.rejects(app.care.createNote('organization', ORG, { tags: [], note: 'x' }), /note tag/);
    await assert.rejects(app.care.createNote('organization', ORG, { tags: ['Interaction'], note: '  ' }), /required/);
    await assert.rejects(app.care.createNote('organization', ORG, { tags: ['Interaction'], note: 'x', attachments: [{ name: 'a.exe', type: 'application/x-msdownload', content: 'AA==' }] }), /only PDF/);
    const note = await app.care.createNote('organization', ORG, {
        tags: ['Interaction'],
        note: 'This is Agent Notes',
        attachments: [{ name: 'id.png', type: 'image/png', content: Buffer.from('png-bytes').toString('base64') }],
    });
    assert.equal(note.attachments[0]!.size, 9);
    const stored = await app.care.getAttachment(note.attachments[0]!.id);
    assert.equal(Buffer.from(stored.content, 'base64').toString(), 'png-bytes');
    assert.equal((await app.care.listNotes('organization', ORG))[0]!.note, 'This is Agent Notes');
});

test('appointments: reschedule keeps the slot length and must be in the future', async () => {
    const { app } = await fresh();
    const [appt] = await app.care.listAppointments(YAN_SUB);
    assert.ok(appt);
    await assert.rejects(app.care.updateAppointment(appt.id, { changeTime: true, date: '2026-07-01', startTime: '10:00' }), /future/);
    const moved = await app.care.updateAppointment(appt.id, { changeTime: true, date: '2026-07-30', startTime: '14:00', agentNote: 'Call first', notifyCustomer: true });
    assert.equal(moved.start, '2026-07-30T14:00:00.000Z');
    assert.equal(Date.parse(moved.end) - Date.parse(moved.start), Date.parse(appt.end) - Date.parse(appt.start));
    assert.equal(moved.agentNote, 'Call first');
});

test('layouts: default, user copy, operator default and validation', async () => {
    const { app } = await fresh();
    const def = await app.care.getLayout('subscriber');
    assert.equal(def.source, 'default');
    assert.equal(def.sections[0]!.kind, 'details');
    assert.equal(def.sections[1]!.sectionName, 'Tiles');
    const custom = [{ sectionName: 'Mine', isInitiallyCollapsed: false, layout: [{ i: 'a', x: 0, y: 0, w: 12, h: 4, componentKey: 'subscriberWarnings' }] }];
    assert.equal((await app.care.saveLayout('subscriber', 'user', { sections: custom })).source, 'user');
    assert.equal((await app.care.saveLayout('subscriber', 'operator', { sections: def.sections })).source, 'operator');
    assert.throws(() => validateSections('organization', custom), /cannot be placed on this page/);
    assert.throws(() => validateSections('subscriber', [{ sectionName: 'x', layout: [{ x: 6, y: 0, w: 12, h: 2, componentKey: 'wallet' }] }]), /does not fit/);
    // the details block: implicit at the top, can move, only once
    const moved = validateSections('subscriber', [...custom, { sectionName: 'Details', isInitiallyCollapsed: false, layout: [], kind: 'details' }]);
    assert.deepEqual(moved.map((x) => x.kind ?? x.sectionName), ['Mine', 'details']);
    assert.equal(validateSections('subscriber', custom)[0]!.kind, 'details');
    const twice = { sectionName: 'Details', isInitiallyCollapsed: false, layout: [], kind: 'details' };
    assert.throws(() => validateSections('subscriber', [twice, twice]), /only be placed once/);
    // every default layout is valid for its page
    for (const page of ['User', 'Account', 'subscriber', 'organization'] as const) assert.doesNotThrow(() => validateSections(page, buildDefaultLayout(page)));
});

test('every table tile returns rows for an entity on its page', async () => {
    const { app } = await fresh();
    const ids = { User: ['user', YAN], Account: ['account', YAN_ACCOUNT], subscriber: ['subscriber', YAN_SUB], organization: ['organization', ORG] } as const;
    for (const tile of TILES.filter((t) => t.kind === 'table' || t.kind === 'keyValue')) {
        for (const page of tile.pages) {
            const [type, id] = ids[page];
            const data = await app.care.tileData(tile.key, type, id);
            assert.ok(Array.isArray(data.rows) || Array.isArray(data.items), `${tile.key} on ${page}`);
        }
    }
});

test('customer 360: business portfolio, status change, purchase, payment', async () => {
    const { app } = await fresh();
    const aws = (await app.customer360.list('business')).find((c) => c.name === 'AWS Cloud Pte Ltd')!;
    const header = await app.customer360.header('business', aws.id);
    assert.equal(header.type, 'Company');
    assert.equal(header.segment, 'Small and Medium Companies');
    const portfolio = await app.customer360.portfolio('business', aws.id);
    assert.equal(portfolio.length, 1);
    assert.equal(portfolio[0]!.children.length, 2);
    assert.deepEqual(portfolio[0]!.children.map((p) => p.quantity).sort(), [1, 2]);

    const suspended = await app.customer360.modifyStatus('subscription', portfolio[0]!.id, 'suspended');
    assert.equal((suspended as { state: string }).state, 'suspended');
    await app.customer360.modifyStatus('subscription', portfolio[0]!.id, 'active');

    const offering = (await app.customer360.offerings()).find((o) => o.name === 'Handset X1')!;
    const order = await app.customer360.purchase('business', aws.id, { offeringId: offering.id, quantity: 1 });
    assert.equal(order.state, 'completed');
    assert.equal((await app.customer360.orders('business', aws.id)).length, 2);

    const [account] = await app.customer360.accounts('business', aws.id);
    const payment = await app.customer360.createPayment('business', aws.id, { accountId: account!.id, amount: 100 });
    assert.equal(payment.totalAmount.value, 100);
    await assert.rejects(app.customer360.listQuotes('residential', aws.id), /business customers/);
    const quote = await app.customer360.createQuote('business', aws.id, { subscriptionId: portfolio[0]!.id, name: 'Add 5 seats' });
    assert.equal((await app.customer360.setQuoteState(quote.id, 'pending')).state, 'pending');
    await assert.rejects(app.customer360.setQuoteState(quote.id, 'accepted'), /cannot go from pending/);
});

test('HTTP: search, invoice PDF and attachment download', async () => {
    const { app } = await fresh();
    const server = createHttpServer(buildRouter(app));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
    try {
        const res = await fetch(base + '/care/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ option: 'accountId', operator: 'match', value: YAN_ACCOUNT }) });
        assert.equal(res.status, 200);
        assert.equal((await res.json()).entityType, 'account');

        const miss = await fetch(base + '/care/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ option: 'userId', operator: 'match', value: 'x' }) });
        assert.equal(miss.status, 404);

        const summary = await (await fetch(`${base}/care/account/${ASHA_ACCOUNT}/billingSummary`)).json();
        assert.ok(summary.amountDue > 0);
        const pdf = await fetch(`${base}/care/invoice/${summary.latestUnpaidInvoiceId}/pdf`);
        assert.equal(pdf.headers.get('content-type'), 'application/pdf');
        assert.match(Buffer.from(await pdf.arrayBuffer()).subarray(0, 8).toString(), /^%PDF-1\.4/);

        const layout = await (await fetch(`${base}/care/layout/organization`)).json();
        assert.equal(layout.sections[1].layout[0].w, 6);
    } finally {
        server.close();
    }
});

test('layout versioning: draft, commit with summary, history, restore, files and git', async () => {
    const { mkdtempSync, readFileSync, existsSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { execFileSync } = await import('node:child_process');
    const dir = mkdtempSync(join(tmpdir(), 'layouts-'));
    execFileSync('git', ['init', '-q', dir]);
    execFileSync('git', ['-C', dir, 'config', 'user.email', 'test@example.com']);
    execFileSync('git', ['-C', dir, 'config', 'user.name', 'Test']);
    const clock = new FixedClock('2026-07-20T09:30:00Z');
    const app = createApp({ clock, layoutFiles: { dir, gitCommit: true } });
    await seed(app);
    await app.care.ensureSeeded();
    const L = app.care.layoutVersions;

    const start = await L.get('subscriber');
    assert.equal(start.source, 'default');
    assert.equal(start.draft, undefined);

    // working copy: rename a tile, drop another, keep it as a draft
    const edited = structuredClone(start.sections);
    edited[1]!.layout[0]!.title = 'Warnings';
    const dropped = edited[1]!.layout.pop()!;
    const draft = await L.saveDraft('subscriber', { sections: edited });
    assert.deepEqual(draft.summary.tilesRenamed, ['Warnings']);
    assert.equal(draft.summary.tilesRemoved.length, 1);
    assert.equal((await L.get('subscriber')).draft?.base.scope, 'default');

    // commit v1 to my layout; the draft is cleared
    const v1 = await L.commit('subscriber', 'user', { sections: edited, message: 'Rename warnings, drop plan tile' });
    assert.equal(v1.version.version, 1);
    assert.equal(v1.layout.source, 'user');
    assert.equal(v1.layout.version, 1);
    assert.equal(v1.layout.draft, undefined);
    await assert.rejects(L.commit('subscriber', 'user', { sections: edited }), /Nothing changed/);

    // v2 adds the tile back at the end
    const withTile = structuredClone(edited);
    withTile[1]!.layout.push({ ...dropped, i: 'planAndPurchase-new', y: 50 });
    const v2 = await L.commit('subscriber', 'user', { sections: withTile, message: 'Plan tile back' });
    assert.equal(v2.version.version, 2);
    assert.equal(v2.version.parentVersion, 1);
    assert.equal(v2.version.summary.tilesAdded.length, 1);

    // history newest first, head marked
    const history = await L.list('subscriber', 'user');
    assert.deepEqual(history.map((h) => [h.version, h.isHead]), [[2, true], [1, false]]);

    // restore v1 -> v3 with v1's content
    const v3 = await L.restore('subscriber', 'user', 1, {});
    assert.equal(v3.version.version, 3);
    assert.deepEqual(v3.version.restoredFrom, { scope: 'user', version: 1 });
    assert.equal((await L.getVersion('subscriber', 'user', 3)).sections[1]!.layout.length, edited[1]!.layout.length);

    // promote to operator default
    const op = await L.restore('subscriber', 'user', 3, { targetScope: 'operator', message: 'Roll out' });
    assert.equal(op.version.scope, 'operator');
    assert.equal(op.layout.source, 'operator');

    // files on disk and git commits
    const current = JSON.parse(readFileSync(join(dir, 'subscriber', 'user', 'current.json'), 'utf8'));
    assert.equal(current.version, 3);
    assert.ok(existsSync(join(dir, 'subscriber', 'operator', 'v1.json')));
    const logLines = execFileSync('git', ['-C', dir, 'log', '--format=%s']).toString().trim().split('\n');
    assert.equal(logLines.length, 4);
    assert.match(logLines[0]!, /layout subscriber\/operator v1: Roll out/);

    // a bad tile is refused, titles are trimmed
    await assert.rejects(L.saveDraft('organization', { sections: [{ sectionName: 'x', layout: [{ i: 'a', x: 0, y: 0, w: 3, h: 2, componentKey: 'wallet' }] }] }), /cannot be placed/);
});

test('menu arrangement: save, read back, validate, reset', async () => {
    const { app } = await fresh();
    assert.deepEqual(await app.care.getMenu(), { order: [], groups: {}, hidden: [], custom: [], deleted: [], renames: {}, icons: {}, env: {} });
    const saved = await app.care.saveMenu({ order: ['Customer Care', 'Home', 'Home'], groups: { Customers: ['/customer-care/message-history'] }, hidden: ['Promotions'] });
    assert.deepEqual(saved.order, ['Customer Care', 'Home']);
    assert.deepEqual((await app.care.getMenu()).groups.Customers, ['/customer-care/message-history']);
    assert.equal((await app.care.getSettings()).timezone, 'Asia/Kolkata', 'other settings kept');
    await assert.rejects(app.care.saveMenu({ order: 'Home' }), /list of names/);
    await assert.rejects(app.care.saveMenu({ groups: [] }), /map a menu group/);
    // custom entries and deleted built-ins
    const withCustom = await app.care.saveMenu({
        order: ['c-tools', 'Home'],
        groups: { 'c-tools': ['c-wiki'] },
        hidden: [],
        deleted: ['Promotions', '/module/offers'],
        custom: [
            { id: 'c-tools', kind: 'menu', name: 'Tools', icon: 'consistency/sidebar-home' },
            { id: 'c-wiki', kind: 'sub', name: 'Team wiki', link: 'https://wiki.example.com/care' },
        ],
    });
    assert.equal(withCustom.custom!.length, 2);
    assert.deepEqual(withCustom.deleted, ['Promotions', '/module/offers']);
    await assert.rejects(app.care.saveMenu({ custom: [{ id: 'c-x', kind: 'sub', name: 'Bad', link: 'javascript:alert(1)' }] }), /portal page/);
    await assert.rejects(app.care.saveMenu({ custom: [{ id: 'c-x', kind: 'sub', name: 'No link' }] }), /needs a link/);
    await assert.rejects(app.care.saveMenu({ custom: [{ id: 'x', kind: 'menu', name: 'Bad id' }] }), /unique id/);
    await assert.rejects(app.care.saveMenu({ custom: [{ id: 'c-a', kind: 'menu', name: '' }] }), /1 to 40/);
    await assert.rejects(app.care.saveMenu({ custom: [{ id: 'c-a', kind: 'sub', name: 'x', link: '//evil.com' }] }), /portal page/);
    // bottom area, renames, icons, environment label
    const full = await app.care.saveMenu({ order: ['Home'], footer: ['My Account', 'Settings'], renames: { Home: 'Start', tenant: 'Acme Mobile' }, icons: { Home: 'consistency/sidebar-segments' }, env: { label: ' Production ', hidden: false } });
    assert.deepEqual(full.footer, ['My Account', 'Settings']);
    assert.equal(full.renames!.tenant, 'Acme Mobile');
    assert.deepEqual(full.env, { label: 'Production' });
    await assert.rejects(app.care.saveMenu({ renames: { Home: '' } }), /1 to 40/);
    await assert.rejects(app.care.saveMenu({ icons: { Home: '../x"' } }), /unknown icon/);
    await assert.rejects(app.care.saveMenu({ env: { label: 'x'.repeat(31) } }), /at most 30/);
    assert.deepEqual(await app.care.resetMenu(), { order: [], groups: {}, hidden: [], custom: [], deleted: [], renames: {}, icons: {}, env: {} });
    assert.equal((await app.care.getSettings()).menu, undefined);
});
