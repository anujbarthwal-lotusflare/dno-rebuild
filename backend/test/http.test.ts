import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.ts';
import { buildRouter } from '../src/api.ts';
import { createHttpServer } from '../src/http.ts';
import { SqliteStore } from '../src/common/store.ts';
import { seed } from '../src/seed.ts';

test('HTTP API and portal, on the SQLite store', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dno-'));
    const dbPath = join(dir, 'test.sqlite');
    const store = await SqliteStore.open(dbPath);
    const app = createApp({ store });
    const ids = await seed(app);
    const server = createHttpServer(buildRouter(app), { portalDir: resolve(import.meta.dirname, '..', '..', 'portal') });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const call = async (path: string, method = 'GET', body?: unknown) => {
        const res = await fetch(base + path, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
        const text = await res.text();
        return { status: res.status, type: res.headers.get('content-type') ?? '', text, json: text && res.headers.get('content-type')?.includes('json') ? JSON.parse(text) : undefined };
    };
    try {
        assert.equal((await call('/api/health')).json.status, 'ok');
        assert.equal((await call('/api/catalog/productOffering')).json.length, 3);

        // full flow over HTTP
        const order = await call('/api/ordering/productOrder', 'POST', {
            relatedParty: [{ role: 'customer', partyOrPartyRole: { id: ids.individualId, '@referredType': 'Individual' } }],
            billingAccount: { id: ids.postpaidAccountId },
            productOrderItem: [{ action: 'add', productOffering: { id: ids.planId } }],
        });
        assert.equal(order.status, 201);
        assert.equal(order.json.state, 'completed');
        const bill = await call(`/api/billing/billingAccount/${ids.postpaidAccountId}/calculateBill`, 'POST', { approve: true });
        assert.equal(bill.status, 201);
        assert.equal(bill.json.taxIncludedAmount.value, 705.64);
        const pay = await call('/api/payment/payment', 'POST', { account: { id: ids.postpaidAccountId }, totalAmount: { unit: 'INR', value: 705.64 } });
        assert.equal(pay.json.matchingStatus, 'matchedFully');
        assert.equal((await call(`/api/billing/customerBill/${bill.json.id}`)).json.state, 'settled');
        assert.equal((await call('/api/tax/calculate', 'POST', { amount: 100, value: 18 })).json.gross_amount, '118');

        // errors are TMF-shaped with the right status
        const missing = await call('/api/party/individual/nope');
        assert.equal(missing.status, 404);
        assert.equal(missing.json.code, 'COMMON-NOT_FOUND');
        assert.equal((await call('/api/party/individual', 'POST', { givenName: 'x' })).status, 400);
        assert.equal((await call('/api/nothing/here')).status, 404);
        assert.equal((await call('/api/health', 'POST', {})).status, 405);
        const badJson = await fetch(base + '/api/party/individual', { method: 'POST', body: '{nope' });
        assert.equal(badJson.status, 400);
        const again = await call(`/api/billing/billingAccount/${ids.postpaidAccountId}/calculateBill`, 'POST', {});
        assert.equal(again.status, 409);
        assert.equal(again.json.code, 'BC-NOTHING_TO_BILL');
        assert.equal((await call(`/api/billing/billingAccount/${ids.postpaidAccountId}/editBalance`, 'POST', { transactionType: 'paymentTransaction', amount: { unit: 'INR', value: 1 } })).status, 400);

        // portal: html, css, and TypeScript served as runnable JavaScript
        const index = await call('/');
        assert.match(index.type, /text\/html/);
        const js = await call('/src/ui.ts');
        assert.match(js.type, /javascript/);
        assert.ok(!/:\s*HTMLElement\s*\{/.test(js.text), 'types should be stripped');
        assert.ok(js.text.includes('export function h('));
        assert.equal((await call('/../package.json')).status, 404);
        assert.equal((await call('/%2e%2e/package.json')).status, 404);
        assert.equal((await call('/tsconfig.json')).status, 200);
    } finally {
        await new Promise((r) => server.close(r));
        store.close();
    }

    // data survives a restart
    const reopened = await SqliteStore.open(dbPath);
    const app2 = createApp({ store: reopened });
    assert.equal((await app2.ordering.list()).length, 1);
    assert.equal((await app2.billing.listBills())[0]!.state, 'settled');
    reopened.close();
    rmSync(dir, { recursive: true, force: true });
});
