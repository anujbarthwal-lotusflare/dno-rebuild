/**
 * Wires the framework-agnostic domain core (../../backend/src) into Nest's DI container.
 * One App object is built at start-up; each domain service is then exposed under its own class token.
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Global, Inject, Injectable, Logger, Module } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import { createApp } from '../../backend/src/app.ts';
import type { App } from '../../backend/src/app.ts';
import { MemoryStore, SqliteStore } from '../../backend/src/common/store.ts';
import type { Store } from '../../backend/src/common/store.ts';
import { seed } from '../../backend/src/seed.ts';
import { layoutFilesFromEnv } from '../../backend/src/care/layoutFiles.ts';
import { PartyService } from '../../backend/src/party/service.ts';
import { CatalogService } from '../../backend/src/catalog/service.ts';
import { BillingAccountService } from '../../backend/src/billing/accountService.ts';
import { BillingService } from '../../backend/src/billing/billingService.ts';
import { InventoryService } from '../../backend/src/inventory/service.ts';
import { OrderingService } from '../../backend/src/ordering/service.ts';
import { PaymentService } from '../../backend/src/payment/service.ts';
import { DunningService } from '../../backend/src/lifecycle/dunning.ts';

export const APP = Symbol('DNO_APP');

/** Project root: nest/dist/nest/src -> four levels up. */
export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

async function buildApp(): Promise<App> {
    const dbPath = process.env.DNO_DB ?? resolve(PROJECT_ROOT, 'data', 'dno.sqlite');
    let store: Store;
    if (dbPath === ':memory:') {
        store = new MemoryStore();
    } else {
        mkdirSync(dirname(dbPath), { recursive: true });
        store = await SqliteStore.open(dbPath);
    }
    const app = createApp({ store, layoutFiles: layoutFilesFromEnv(PROJECT_ROOT, (l) => new Logger('Layouts').log(l)) });
    const empty = (await app.catalog.listOfferings()).length === 0 && (await app.parties.listIndividuals()).length === 0;
    if (process.env.DNO_SEED !== '0' && empty) await seed(app);
    if (process.env.DNO_SEED !== '0') {
        await app.care.ensureSeeded();
        await app.customer360.ensureSeeded();
    }
    return app;
}

@Injectable()
class StoreLifecycle implements OnApplicationShutdown {
    constructor(@Inject(APP) private readonly app: App) {}
    onApplicationShutdown(): void {
        this.app.store.close();
    }
}

const fromApp = <T>(token: abstract new (...args: never[]) => T, pick: (app: App) => T) => ({
    provide: token,
    useFactory: pick,
    inject: [APP],
});

const providers = [
    { provide: APP, useFactory: buildApp },
    fromApp(PartyService, (a) => a.parties),
    fromApp(CatalogService, (a) => a.catalog),
    fromApp(BillingAccountService, (a) => a.accounts),
    fromApp(BillingService, (a) => a.billing),
    fromApp(InventoryService, (a) => a.inventory),
    fromApp(OrderingService, (a) => a.ordering),
    fromApp(PaymentService, (a) => a.payments),
    fromApp(DunningService, (a) => a.dunning),
    StoreLifecycle,
];

@Global()
@Module({
    providers,
    exports: [APP, PartyService, CatalogService, BillingAccountService, BillingService, InventoryService, OrderingService, PaymentService, DunningService],
})
export class CoreModule {}
