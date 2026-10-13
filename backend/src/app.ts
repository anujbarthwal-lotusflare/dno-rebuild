/**
 * Composition root: builds every service on top of one store.
 */
import type { Store } from './common/store.ts';
import { MemoryStore } from './common/store.ts';
import { EventBus, SagaRunner, SystemClock, defaultConfig } from './common/runtime.ts';
import type { Clock, OperatorConfig } from './common/runtime.ts';
import { PartyService } from './party/service.ts';
import { CatalogService } from './catalog/service.ts';
import { BillingAccountService } from './billing/accountService.ts';
import { BillingService } from './billing/billingService.ts';
import { InventoryService } from './inventory/service.ts';
import { PaymentService } from './payment/service.ts';
import { DunningService } from './lifecycle/dunning.ts';
import { OrderingService } from './ordering/service.ts';
import { CareService } from './care/service.ts';
import type { LayoutFileOptions } from './care/layouts.ts';
import { Customer360Service } from './care/customer360.ts';

export interface App {
    store: Store;
    clock: Clock;
    config: OperatorConfig;
    events: EventBus;
    sagas: SagaRunner;
    parties: PartyService;
    catalog: CatalogService;
    accounts: BillingAccountService;
    inventory: InventoryService;
    billing: BillingService;
    payments: PaymentService;
    dunning: DunningService;
    ordering: OrderingService;
    care: CareService;
    customer360: Customer360Service;
}

export function createApp(options: { store?: Store; clock?: Clock; config?: Partial<OperatorConfig>; layoutFiles?: LayoutFileOptions } = {}): App {
    const store = options.store ?? new MemoryStore();
    const clock = options.clock ?? new SystemClock();
    const config: OperatorConfig = { ...defaultConfig, ...options.config, dunning: { ...defaultConfig.dunning, ...options.config?.dunning } };
    const events = new EventBus(store, clock);
    const sagas = new SagaRunner(store, clock);
    const parties = new PartyService(store, events, clock);
    const catalog = new CatalogService(store, events, clock);
    const accounts = new BillingAccountService(store, parties, events, clock);
    const inventory = new InventoryService(store, events, clock);
    const billing = new BillingService(store, accounts, inventory, events, clock, config);
    const payments = new PaymentService(store, accounts, billing, events, clock);
    const dunning = new DunningService(accounts, billing, inventory, events, clock, config);
    const ordering = new OrderingService({ store, parties, catalog, accounts, inventory, billing, payments, sagas, events, clock, config });
    const care = new CareService(store, clock, { layoutFiles: options.layoutFiles });
    const app = { store, clock, config, events, sagas, parties, catalog, accounts, inventory, billing, payments, dunning, ordering, care } as App;
    app.customer360 = new Customer360Service(app);
    return app;
}
