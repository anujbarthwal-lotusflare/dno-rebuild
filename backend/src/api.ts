/**
 * REST API. Paths are grouped by domain under /api.
 */
import type { App } from './app.ts';
import { Router } from './http.ts';
import type { Request } from './http.ts';
import { invalid } from './common/errors.ts';
import { careRoutes } from './care/routes.ts';
import { calculateTax, calculateTaxBulk, validateTaxRequest } from './tax/tax.ts';
import type { TaxRequest } from './tax/tax.ts';
import type { CreateIndividual, CreateOrganization } from './party/service.ts';
import type { CreateOffering, CreateSpecification } from './catalog/service.ts';
import type { CreateBillingAccount } from './billing/accountService.ts';
import type { CalculateBillOptions, CreateAcbr } from './billing/billingService.ts';
import type { CreateOrder } from './ordering/service.ts';
import type { CreatePayment } from './payment/service.ts';
import type { BalanceType, Money, PaymentStatus, Ref, SubscriberState, TransactionType } from './common/model.ts';

function body<T>(req: Request): T {
    if (req.body === null || typeof req.body !== 'object' || Array.isArray(req.body)) throw invalid('A JSON object body is required');
    return req.body as T;
}
const optionalBody = <T>(req: Request): T => (req.body && typeof req.body === 'object' ? req.body : {}) as T;
const id = (req: Request): string => req.params.id!;
const asOf = (req: Request, app: App): Date => {
    const raw = optionalBody<{ asOf?: string }>(req).asOf;
    if (!raw) return app.clock.now();
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) throw invalid('asOf is not a valid date');
    return d;
};

export function buildRouter(app: App): Router {
    const r = new Router();
    const { parties, catalog, accounts, billing, inventory, ordering, payments, dunning } = app;

    for (const route of careRoutes(app.care, app.customer360)) {
        r.route(route.method, route.path, (req) => route.handler({ params: req.params, query: req.query, body: req.body }), route.status ?? (route.method === 'POST' ? 201 : 200));
    }

    r.get('/health', () => ({ status: 'ok', time: app.clock.now().toISOString(), operator: app.config.operatorName }));
    r.get('/config', () => app.config);
    r.get('/event', (req) => app.events.recent(Number(req.query.get('limit') ?? 100)));
    r.get('/sagaExecution', async () => (await app.sagas.list()).reverse());

    /* party */
    r.get('/party/individual', () => parties.listIndividuals());
    r.post('/party/individual', (req) => parties.createIndividual(body<CreateIndividual>(req)));
    r.get('/party/individual/:id', (req) => parties.getIndividual(id(req)));
    r.patch('/party/individual/:id', (req) => parties.patchIndividual(id(req), body(req)));
    r.get('/party/organization', () => parties.listOrganizations());
    r.post('/party/organization', (req) => parties.createOrganization(body<CreateOrganization>(req)));
    r.get('/party/organization/:id', (req) => parties.getOrganization(id(req)));
    r.patch('/party/organization/:id', (req) => parties.patchOrganization(id(req), body(req)));

    /* catalog */
    r.get('/catalog/productSpecification', () => catalog.listSpecifications());
    r.post('/catalog/productSpecification', (req) => catalog.createSpecification(body<CreateSpecification>(req)));
    r.get('/catalog/productSpecification/:id', (req) => catalog.getSpecification(id(req)));
    r.patch('/catalog/productSpecification/:id', (req) => catalog.patchSpecification(id(req), body(req)));
    r.delete('/catalog/productSpecification/:id', (req) => catalog.deleteSpecification(id(req)));
    r.get('/catalog/productOffering', () => catalog.listOfferings());
    r.post('/catalog/productOffering', (req) => catalog.createOffering(body<CreateOffering>(req)));
    r.get('/catalog/productOffering/:id', (req) => catalog.getOffering(id(req)));
    r.patch('/catalog/productOffering/:id', (req) => catalog.patchOffering(id(req), body(req)));
    r.delete('/catalog/productOffering/:id', (req) => catalog.deleteOffering(id(req)));

    /* tax */
    r.post(
        '/tax/calculate',
        (req) => {
            const b = body<TaxRequest & { requests?: Record<string, TaxRequest> }>(req);
            if (b.requests) return calculateTaxBulk(b.requests, app.config.monetaryPrecision);
            validateTaxRequest('single', b);
            return calculateTax(b, app.config.monetaryPrecision);
        },
        200
    );

    /* billing accounts */
    r.get('/billing/billingCycleSpecification', () => accounts.listCycleSpecifications());
    r.post('/billing/billingCycleSpecification', (req) => accounts.createCycleSpecification(body(req)));
    r.get('/billing/billingAccount', () => accounts.list());
    r.post('/billing/billingAccount', (req) => accounts.create(body<CreateBillingAccount>(req)));
    r.get('/billing/billingAccount/:id', (req) => accounts.get(id(req)));
    r.patch('/billing/billingAccount/:id', (req) => accounts.patch(id(req), body(req)));
    r.get('/billing/billingAccount/:id/transaction', (req) => accounts.listTransactions(id(req)));
    r.get('/billing/billingAccount/:id/billCycle', (req) => accounts.listCycles(id(req)));
    r.post('/billing/billingAccount/:id/activate', (req) => accounts.activate(id(req), optionalBody<{ billCycleStartDateTime?: string }>(req).billCycleStartDateTime), 200);
    r.post('/billing/billingAccount/:id/close', (req) => accounts.close(id(req)), 200);
    r.post(
        '/billing/billingAccount/:id/editBalance',
        (req) => {
            const b = body<{ transactionType: TransactionType; balanceType?: BalanceType; amount: Money; reference?: string }>(req);
            const allowed: TransactionType[] = ['adjustmentCreditTransaction', 'adjustmentDebitTransaction', 'depositCreditTransaction', 'depositDebitTransaction'];
            if (!allowed.includes(b.transactionType)) throw invalid(`transactionType must be one of ${allowed.join(', ')}`);
            return accounts.editAccountBalance(id(req), b.transactionType, b.balanceType ?? 'payableBalance', b.amount, b.reference);
        },
        200
    );
    r.post('/billing/billingAccount/:id/calculateBill', (req) => billing.calculateBill(id(req), optionalBody<CalculateBillOptions>(req)));
    r.post('/billing/billingAccount/:id/subscriberState', (req) => dunning.transition(id(req), body<{ state: SubscriberState }>(req).state), 200);

    /* rating and bills */
    r.get('/billing/appliedCustomerBillingRate', (req) => {
        const account = req.query.get('billingAccountId');
        return billing.listAcbrs(account ? (a) => a.billingAccount.id === account : undefined);
    });
    r.post('/billing/appliedCustomerBillingRate', (req) => billing.createAcbr(body<CreateAcbr>(req)));
    r.get('/billing/customerBill', (req) => {
        const account = req.query.get('billingAccountId');
        return billing.listBills(account ? (b) => b.billingAccount.id === account : undefined);
    });
    r.get('/billing/customerBill/:id', (req) => billing.getBill(id(req)));
    r.post('/billing/customerBill/:id/approve', (req) => billing.approveBill(id(req)), 200);
    r.post('/billing/customerBill/:id/cancel', (req) => billing.cancelBill(id(req)), 200);
    r.post('/billing/run/recurringCharges', async (req) => ({ created: await billing.runRecurringCharges(asOf(req, app)) }), 200);
    r.post('/billing/run/dunning', (req) => dunning.run(asOf(req, app)), 200);

    /* inventory */
    r.get('/inventory/product', (req) => {
        const account = req.query.get('billingAccountId');
        return inventory.listProducts(account ? (p) => p.billingAccount?.id === account : undefined);
    });
    r.get('/inventory/product/:id', (req) => inventory.getProduct(id(req)));
    r.post('/inventory/product/:id/activate', (req) => inventory.activate(id(req)), 200);
    r.post('/inventory/product/:id/suspend', (req) => inventory.suspend(id(req), optionalBody<{ reason?: string }>(req).reason), 200);
    r.get('/inventory/subscription', () => inventory.listSubscriptions());
    r.get('/inventory/subscription/:id', (req) => inventory.getSubscription(id(req)));

    /* ordering */
    r.get('/ordering/productOrder', async () => (await ordering.list()).reverse());
    r.post('/ordering/productOrder', (req) => ordering.create(body<CreateOrder>(req)));
    r.post('/ordering/productOrder/preview', (req) => ordering.preview(body<CreateOrder>(req)), 200);
    r.get('/ordering/productOrder/:id', (req) => ordering.get(id(req)));
    r.post('/ordering/productOrder/:id/submit', (req) => ordering.submitDraft(id(req)), 200);
    r.post('/ordering/productOrder/:id/cancel', (req) => ordering.cancel(id(req)), 200);

    /* payments */
    r.get('/payment/payment', async () => (await payments.list()).reverse());
    r.post('/payment/payment', (req) => payments.create(body<CreatePayment>(req)));
    r.get('/payment/payment/:id', (req) => payments.get(id(req)));
    r.post('/payment/payment/:id/status', (req) => payments.transition(id(req), body<{ status: PaymentStatus }>(req).status), 200);
    r.post('/payment/payment/:id/cancel', (req) => payments.cancel(id(req)), 200);
    r.get('/payment/refund', () => payments.listRefunds());
    r.post('/payment/refund', (req) => payments.requestRefund(body<{ account: Ref; totalAmount: Money; reason?: string }>(req)));
    r.post('/payment/refund/:id/complete', (req) => payments.completeRefund(id(req)), 200);
    r.post('/payment/refund/:id/reject', (req) => payments.rejectRefund(id(req)), 200);

    return r;
}
