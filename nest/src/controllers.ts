/**
 * REST controllers. Paths and payloads are identical to the dependency-free server
 * in backend/src/api.ts, so both servers can back the same portal.
 */
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import type { App } from '../../backend/src/app.ts';
import { invalid } from '../../backend/src/common/errors.ts';
import type { BalanceType, Money, PaymentStatus, Ref, SubscriberState, TransactionType } from '../../backend/src/common/model.ts';
import { PartyService } from '../../backend/src/party/service.ts';
import type { CreateIndividual, CreateOrganization } from '../../backend/src/party/service.ts';
import { CatalogService } from '../../backend/src/catalog/service.ts';
import type { CreateOffering, CreateSpecification } from '../../backend/src/catalog/service.ts';
import { BillingAccountService } from '../../backend/src/billing/accountService.ts';
import type { CreateBillingAccount } from '../../backend/src/billing/accountService.ts';
import { BillingService } from '../../backend/src/billing/billingService.ts';
import type { CalculateBillOptions, CreateAcbr } from '../../backend/src/billing/billingService.ts';
import { InventoryService } from '../../backend/src/inventory/service.ts';
import { OrderingService } from '../../backend/src/ordering/service.ts';
import type { CreateOrder } from '../../backend/src/ordering/service.ts';
import { PaymentService } from '../../backend/src/payment/service.ts';
import type { CreatePayment } from '../../backend/src/payment/service.ts';
import { DunningService } from '../../backend/src/lifecycle/dunning.ts';
import { calculateTax, calculateTaxBulk, validateTaxRequest } from '../../backend/src/tax/tax.ts';
import type { TaxRequest } from '../../backend/src/tax/tax.ts';
import { APP } from './core.module.ts';
import { CareController } from './care.controller.ts';
import { asOf, obj, opt } from './util.ts';

@Controller()
export class SystemController {
    constructor(@Inject(APP) private readonly app: App) {}

    @Get('health')
    health() {
        return { status: 'ok', time: this.app.clock.now().toISOString(), operator: this.app.config.operatorName };
    }
    @Get('config')
    config() {
        return this.app.config;
    }
    @Get('event')
    events(@Query('limit') limit?: string) {
        return this.app.events.recent(Number(limit ?? 100));
    }
    @Get('sagaExecution')
    async sagas() {
        return (await this.app.sagas.list()).reverse();
    }
}

@Controller('party')
export class PartyController {
    constructor(private readonly parties: PartyService) {}

    @Get('individual')
    listIndividuals() {
        return this.parties.listIndividuals();
    }
    @Post('individual')
    createIndividual(@Body() body: unknown) {
        return this.parties.createIndividual(obj<CreateIndividual>(body));
    }
    @Get('individual/:id')
    getIndividual(@Param('id') id: string) {
        return this.parties.getIndividual(id);
    }
    @Patch('individual/:id')
    patchIndividual(@Param('id') id: string, @Body() body: unknown) {
        return this.parties.patchIndividual(id, obj(body));
    }
    @Get('organization')
    listOrganizations() {
        return this.parties.listOrganizations();
    }
    @Post('organization')
    createOrganization(@Body() body: unknown) {
        return this.parties.createOrganization(obj<CreateOrganization>(body));
    }
    @Get('organization/:id')
    getOrganization(@Param('id') id: string) {
        return this.parties.getOrganization(id);
    }
    @Patch('organization/:id')
    patchOrganization(@Param('id') id: string, @Body() body: unknown) {
        return this.parties.patchOrganization(id, obj(body));
    }
}

@Controller('catalog')
export class CatalogController {
    constructor(private readonly catalog: CatalogService) {}

    @Get('productSpecification')
    listSpecifications() {
        return this.catalog.listSpecifications();
    }
    @Post('productSpecification')
    createSpecification(@Body() body: unknown) {
        return this.catalog.createSpecification(obj<CreateSpecification>(body));
    }
    @Get('productSpecification/:id')
    getSpecification(@Param('id') id: string) {
        return this.catalog.getSpecification(id);
    }
    @Patch('productSpecification/:id')
    patchSpecification(@Param('id') id: string, @Body() body: unknown) {
        return this.catalog.patchSpecification(id, obj(body));
    }
    @Delete('productSpecification/:id')
    @HttpCode(204)
    deleteSpecification(@Param('id') id: string) {
        return this.catalog.deleteSpecification(id);
    }
    @Get('productOffering')
    listOfferings() {
        return this.catalog.listOfferings();
    }
    @Post('productOffering')
    createOffering(@Body() body: unknown) {
        return this.catalog.createOffering(obj<CreateOffering>(body));
    }
    @Get('productOffering/:id')
    getOffering(@Param('id') id: string) {
        return this.catalog.getOffering(id);
    }
    @Patch('productOffering/:id')
    patchOffering(@Param('id') id: string, @Body() body: unknown) {
        return this.catalog.patchOffering(id, obj(body));
    }
    @Delete('productOffering/:id')
    @HttpCode(204)
    deleteOffering(@Param('id') id: string) {
        return this.catalog.deleteOffering(id);
    }
}

@Controller('tax')
export class TaxController {
    constructor(@Inject(APP) private readonly app: App) {}

    @Post('calculate')
    @HttpCode(200)
    calculate(@Body() body: unknown) {
        const b = obj<TaxRequest & { requests?: Record<string, TaxRequest> }>(body);
        if (b.requests) return calculateTaxBulk(b.requests, this.app.config.monetaryPrecision);
        validateTaxRequest('single', b);
        return calculateTax(b, this.app.config.monetaryPrecision);
    }
}

const MANUAL_TRANSACTIONS: TransactionType[] = [
    'adjustmentCreditTransaction',
    'adjustmentDebitTransaction',
    'depositCreditTransaction',
    'depositDebitTransaction',
];

@Controller('billing')
export class BillingController {
    constructor(
        @Inject(APP) private readonly app: App,
        private readonly accounts: BillingAccountService,
        private readonly billing: BillingService,
        private readonly dunning: DunningService
    ) {}

    @Get('billingCycleSpecification')
    listCycleSpecifications() {
        return this.accounts.listCycleSpecifications();
    }
    @Post('billingCycleSpecification')
    createCycleSpecification(@Body() body: unknown) {
        return this.accounts.createCycleSpecification(obj(body));
    }

    @Get('billingAccount')
    listAccounts() {
        return this.accounts.list();
    }
    @Post('billingAccount')
    createAccount(@Body() body: unknown) {
        return this.accounts.create(obj<CreateBillingAccount>(body));
    }
    @Get('billingAccount/:id')
    getAccount(@Param('id') id: string) {
        return this.accounts.get(id);
    }
    @Patch('billingAccount/:id')
    patchAccount(@Param('id') id: string, @Body() body: unknown) {
        return this.accounts.patch(id, obj(body));
    }
    @Get('billingAccount/:id/transaction')
    transactions(@Param('id') id: string) {
        return this.accounts.listTransactions(id);
    }
    @Get('billingAccount/:id/billCycle')
    cycles(@Param('id') id: string) {
        return this.accounts.listCycles(id);
    }
    @Post('billingAccount/:id/activate')
    @HttpCode(200)
    activate(@Param('id') id: string, @Body() body: unknown) {
        return this.accounts.activate(id, opt<{ billCycleStartDateTime?: string }>(body).billCycleStartDateTime);
    }
    @Post('billingAccount/:id/close')
    @HttpCode(200)
    close(@Param('id') id: string) {
        return this.accounts.close(id);
    }
    @Post('billingAccount/:id/editBalance')
    @HttpCode(200)
    editBalance(@Param('id') id: string, @Body() body: unknown) {
        const b = obj<{ transactionType: TransactionType; balanceType?: BalanceType; amount: Money; reference?: string }>(body);
        if (!MANUAL_TRANSACTIONS.includes(b.transactionType)) {
            throw invalid(`transactionType must be one of ${MANUAL_TRANSACTIONS.join(', ')}`);
        }
        return this.accounts.editAccountBalance(id, b.transactionType, b.balanceType ?? 'payableBalance', b.amount, b.reference);
    }
    @Post('billingAccount/:id/calculateBill')
    calculateBill(@Param('id') id: string, @Body() body: unknown) {
        return this.billing.calculateBill(id, opt<CalculateBillOptions>(body));
    }
    @Post('billingAccount/:id/subscriberState')
    @HttpCode(200)
    subscriberState(@Param('id') id: string, @Body() body: unknown) {
        return this.dunning.transition(id, obj<{ state: SubscriberState }>(body).state);
    }

    @Get('appliedCustomerBillingRate')
    listAcbrs(@Query('billingAccountId') accountId?: string) {
        return this.billing.listAcbrs(accountId ? (a) => a.billingAccount.id === accountId : undefined);
    }
    @Post('appliedCustomerBillingRate')
    createAcbr(@Body() body: unknown) {
        return this.billing.createAcbr(obj<CreateAcbr>(body));
    }
    @Get('customerBill')
    listBills(@Query('billingAccountId') accountId?: string) {
        return this.billing.listBills(accountId ? (b) => b.billingAccount.id === accountId : undefined);
    }
    @Get('customerBill/:id')
    getBill(@Param('id') id: string) {
        return this.billing.getBill(id);
    }
    @Post('customerBill/:id/approve')
    @HttpCode(200)
    approveBill(@Param('id') id: string) {
        return this.billing.approveBill(id);
    }
    @Post('customerBill/:id/cancel')
    @HttpCode(200)
    cancelBill(@Param('id') id: string) {
        return this.billing.cancelBill(id);
    }

    @Post('run/recurringCharges')
    @HttpCode(200)
    async runRecurring(@Body() body: unknown) {
        return { created: await this.billing.runRecurringCharges(asOf(body, this.app.clock.now())) };
    }
    @Post('run/dunning')
    @HttpCode(200)
    runDunning(@Body() body: unknown) {
        return this.dunning.run(asOf(body, this.app.clock.now()));
    }
}

@Controller('inventory')
export class InventoryController {
    constructor(private readonly inventory: InventoryService) {}

    @Get('product')
    listProducts(@Query('billingAccountId') accountId?: string) {
        return this.inventory.listProducts(accountId ? (p) => p.billingAccount?.id === accountId : undefined);
    }
    @Get('product/:id')
    getProduct(@Param('id') id: string) {
        return this.inventory.getProduct(id);
    }
    @Post('product/:id/activate')
    @HttpCode(200)
    activate(@Param('id') id: string) {
        return this.inventory.activate(id);
    }
    @Post('product/:id/suspend')
    @HttpCode(200)
    suspend(@Param('id') id: string, @Body() body: unknown) {
        return this.inventory.suspend(id, opt<{ reason?: string }>(body).reason);
    }
    @Get('subscription')
    listSubscriptions() {
        return this.inventory.listSubscriptions();
    }
    @Get('subscription/:id')
    getSubscription(@Param('id') id: string) {
        return this.inventory.getSubscription(id);
    }
}

@Controller('ordering/productOrder')
export class OrderingController {
    constructor(private readonly ordering: OrderingService) {}

    @Get()
    async list() {
        return (await this.ordering.list()).reverse();
    }
    @Post()
    create(@Body() body: unknown) {
        return this.ordering.create(obj<CreateOrder>(body));
    }
    @Post('preview')
    @HttpCode(200)
    preview(@Body() body: unknown) {
        return this.ordering.preview(obj<CreateOrder>(body));
    }
    @Get(':id')
    get(@Param('id') id: string) {
        return this.ordering.get(id);
    }
    @Post(':id/submit')
    @HttpCode(200)
    submit(@Param('id') id: string) {
        return this.ordering.submitDraft(id);
    }
    @Post(':id/cancel')
    @HttpCode(200)
    cancel(@Param('id') id: string) {
        return this.ordering.cancel(id);
    }
}

@Controller('payment')
export class PaymentController {
    constructor(private readonly payments: PaymentService) {}

    @Get('payment')
    async list() {
        return (await this.payments.list()).reverse();
    }
    @Post('payment')
    create(@Body() body: unknown) {
        return this.payments.create(obj<CreatePayment>(body));
    }
    @Get('payment/:id')
    get(@Param('id') id: string) {
        return this.payments.get(id);
    }
    @Post('payment/:id/status')
    @HttpCode(200)
    setStatus(@Param('id') id: string, @Body() body: unknown) {
        return this.payments.transition(id, obj<{ status: PaymentStatus }>(body).status);
    }
    @Post('payment/:id/cancel')
    @HttpCode(200)
    cancel(@Param('id') id: string) {
        return this.payments.cancel(id);
    }
    @Get('refund')
    listRefunds() {
        return this.payments.listRefunds();
    }
    @Post('refund')
    requestRefund(@Body() body: unknown) {
        return this.payments.requestRefund(obj<{ account: Ref; totalAmount: Money; reason?: string }>(body));
    }
    @Post('refund/:id/complete')
    @HttpCode(200)
    completeRefund(@Param('id') id: string) {
        return this.payments.completeRefund(id);
    }
    @Post('refund/:id/reject')
    @HttpCode(200)
    rejectRefund(@Param('id') id: string) {
        return this.payments.rejectRefund(id);
    }
}

export const controllers = [
    CareController,
    SystemController,
    PartyController,
    CatalogController,
    TaxController,
    BillingController,
    InventoryController,
    OrderingController,
    PaymentController,
];
