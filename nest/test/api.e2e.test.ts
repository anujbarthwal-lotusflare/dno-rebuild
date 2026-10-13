import 'reflect-metadata';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.ts';

process.env.DNO_DB = ':memory:';
process.env.DNO_LAYOUT_DIR = 'off';

let app: INestApplication;
let http: ReturnType<typeof request>;

before(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    http = request(app.getHttpServer());
});
after(async () => {
    await app.close();
});

test('health and seeded catalog', async () => {
    const health = await http.get('/api/health').expect(200);
    assert.equal(health.body.status, 'ok');
    const offerings = await http.get('/api/catalog/productOffering').expect(200);
    assert.equal(offerings.body.length, 3);
});

test('order -> bill -> payment over the NestJS API', async () => {
    const individuals = (await http.get('/api/party/individual')).body;
    const accounts = (await http.get('/api/billing/billingAccount')).body;
    const offerings = (await http.get('/api/catalog/productOffering')).body;
    const account = accounts.find((a: { ratingType: string }) => a.ratingType === 'postpaid');
    const plan = offerings.find((o: { name: string }) => o.name === 'Unlimited Talk 10GB');
    const orderBody = {
        relatedParty: [{ role: 'customer', partyOrPartyRole: { id: individuals[0].id, '@referredType': 'Individual' } }],
        billingAccount: { id: account.id },
        productOrderItem: [{ action: 'add', productOffering: { id: plan.id } }],
    };

    const preview = await http.post('/api/ordering/productOrder/preview').send(orderBody).expect(200);
    assert.equal(preview.body.upfrontAmount, 705.64);

    const order = await http.post('/api/ordering/productOrder').send(orderBody).expect(201);
    assert.equal(order.body.state, 'completed');

    const products = await http.get(`/api/inventory/product?billingAccountId=${account.id}`).expect(200);
    assert.deepEqual(products.body.map((p: { status: string }) => p.status), ['active']);

    const bill = await http.post(`/api/billing/billingAccount/${account.id}/calculateBill`).send({ approve: true }).expect(201);
    assert.equal(bill.body.taxIncludedAmount.value, 705.64);
    assert.equal(bill.body.state, 'validated');

    const payment = await http.post('/api/payment/payment').send({ account: { id: account.id }, totalAmount: { unit: 'INR', value: 705.64 } }).expect(201);
    assert.equal(payment.body.matchingStatus, 'matchedFully');
    assert.equal((await http.get(`/api/billing/customerBill/${bill.body.id}`)).body.state, 'settled');

    const sagas = await http.get('/api/sagaExecution').expect(200);
    assert.equal(sagas.body[0].status, 'succeeded');
});

test('errors keep the TMF shape and status codes', async () => {
    const missing = await http.get('/api/party/individual/nope').expect(404);
    assert.equal(missing.body.code, 'COMMON-NOT_FOUND');
    assert.equal(missing.body['@type'], 'Error');

    const invalid = await http.post('/api/party/individual').send({ givenName: 'x' }).expect(400);
    assert.equal(invalid.body.code, 'COMMON-INVALID_REQUEST');

    const noRoute = await http.get('/api/nothing/here').expect(404);
    assert.equal(noRoute.body.code, 'COMMON-NOT_FOUND');

    await http.post('/api/party/individual').set('content-type', 'application/json').send('{nope').expect(400);

    const accounts = (await http.get('/api/billing/billingAccount')).body;
    const nothing = await http.post(`/api/billing/billingAccount/${accounts[0].id}/calculateBill`).send({}).expect(409);
    assert.equal(nothing.body.code, 'BC-NOTHING_TO_BILL');

    await http.post(`/api/billing/billingAccount/${accounts[0].id}/editBalance`).send({ transactionType: 'paymentTransaction', amount: { unit: 'INR', value: 1 } }).expect(400);
    assert.equal((await http.post('/api/tax/calculate').send({ amount: 100, value: 18 }).expect(200)).body.gross_amount, '118');
});

test('customer care suite over the NestJS API', async () => {
    const found = await http.post('/api/care/search').send({ option: 'accountId', operator: 'match', value: '94caf1984e6e41a88ea7cce35bee9a24' }).expect(200);
    assert.equal(found.body.entityType, 'account');
    await http.post('/api/care/search').send({ option: 'userId', operator: 'match', value: 'nobody' }).expect(404);

    const topUp = await http.post('/api/care/account/94caf1984e6e41a88ea7cce35bee9a24/wallet/topUp').send({ amount: 25 }).expect(200);
    assert.equal(topUp.body.amount, 25);

    const layout = await http.get('/api/care/layout/subscriber').expect(200);
    assert.equal(layout.body.source, 'default');
    await http.put('/api/care/layout/subscriber/user').send({ sections: layout.body.sections }).expect(200);
    assert.equal((await http.get('/api/care/layout/subscriber')).body.source, 'user');
    assert.equal((await http.delete('/api/care/layout/subscriber/user').expect(200)).body.source, 'default');

    const summary = (await http.get('/api/care/account/a1b2c3d4e5f64788990aabbccddeeff0/billingSummary').expect(200)).body;
    const pdf = await http.get(`/api/care/invoice/${summary.latestUnpaidInvoiceId}/pdf`).expect(200);
    assert.equal(pdf.headers['content-type'], 'application/pdf');

    const business = (await http.get('/api/customer360/business').expect(200)).body;
    const aws = business.find((c: { name: string }) => c.name === 'AWS Cloud Pte Ltd');
    const portfolio = (await http.get(`/api/customer360/business/${aws.id}/portfolio`).expect(200)).body;
    assert.equal(portfolio[0].children.length, 2);
    await http.get('/api/care/nothing/here/at/all').expect(404);
});
