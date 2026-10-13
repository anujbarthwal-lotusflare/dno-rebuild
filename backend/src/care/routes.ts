/**
 * Customer Care Suite and Customer 360 REST routes, declared once and mounted by both
 * servers (the dependency-free one in ../http.ts and the NestJS one).
 *
 *   /care/...          user manager, overview pages, tiles, layouts, preferences
 *   /customer360/...   residential and business Customer 360
 */
import { invalid } from '../common/errors.ts';
import { FileResult } from '../http.ts';
import type { CareService, NewNote } from './service.ts';
import type { Customer360Service } from './customer360.ts';
import type { EntityType, Quote } from './model.ts';

export interface RouteContext {
    params: Record<string, string>;
    query: URLSearchParams;
    body: unknown;
}
export interface CareRoute {
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    path: string;
    status?: number;
    handler: (ctx: RouteContext) => unknown;
}

const obj = <T>(body: unknown): T => {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) throw invalid('A JSON object body is required');
    return body as T;
};
const opt = <T>(body: unknown): T => (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as T;

export function careRoutes(care: CareService, c360: Customer360Service): CareRoute[] {
    const et = (ctx: RouteContext): EntityType => care.entityType(ctx.params.entityType!);
    const id = (ctx: RouteContext): string => ctx.params.id!;
    const kind = (ctx: RouteContext) => c360.kind(ctx.params.kind!);

    return [
        // catalog and options
        { method: 'GET', path: '/care/tileCatalog', handler: () => care.tileCatalog() },
        { method: 'GET', path: '/care/searchOptions', handler: () => care.searchOptions() },
        { method: 'GET', path: '/care/noteTags', handler: () => care.noteTags() },

        // search
        { method: 'POST', path: '/care/search', status: 200, handler: (ctx) => care.search(obj(ctx.body)) },

        // entities
        { method: 'GET', path: '/care/user/:id', handler: (ctx) => care.getUser(id(ctx)) },
        { method: 'PATCH', path: '/care/user/:id', handler: (ctx) => care.patchUser(id(ctx), obj(ctx.body)) },
        { method: 'GET', path: '/care/account/:id', handler: (ctx) => care.getAccount(id(ctx)) },
        { method: 'PATCH', path: '/care/account/:id', handler: (ctx) => care.patchAccount(id(ctx), obj(ctx.body)) },
        { method: 'GET', path: '/care/subscriber/:id', handler: (ctx) => care.getSubscriber(id(ctx)) },
        { method: 'PATCH', path: '/care/subscriber/:id', handler: (ctx) => care.patchSubscriber(id(ctx), obj(ctx.body)) },
        { method: 'GET', path: '/care/organization/:id', handler: (ctx) => care.getOrganization(id(ctx)) },

        // per-entity tiles and actions
        { method: 'GET', path: '/care/:entityType/:id/associatedEntities', handler: (ctx) => care.associatedEntities(et(ctx), id(ctx)) },
        { method: 'GET', path: '/care/:entityType/:id/entityPicker', handler: (ctx) => care.entityPicker(et(ctx), id(ctx), ctx.query.get('include')?.split(',').filter(Boolean) as EntityType[] | undefined) },
        { method: 'GET', path: '/care/:entityType/:id/tile/:tile', handler: (ctx) => care.tileData(ctx.params.tile!, et(ctx), id(ctx)) },
        { method: 'GET', path: '/care/:entityType/:id/wallet', handler: (ctx) => care.getWallet(et(ctx), id(ctx)) },
        { method: 'POST', path: '/care/:entityType/:id/wallet/topUp', status: 200, handler: (ctx) => care.topUp(et(ctx), id(ctx), obj(ctx.body)) },
        { method: 'POST', path: '/care/:entityType/:id/wallet/deduct', status: 200, handler: (ctx) => care.deduct(et(ctx), id(ctx), obj(ctx.body)) },
        { method: 'GET', path: '/care/:entityType/:id/currentBenefit', handler: (ctx) => care.currentBenefit(et(ctx), id(ctx)) },
        { method: 'GET', path: '/care/:entityType/:id/planAndPurchase', handler: (ctx) => care.planAndPurchase(et(ctx), id(ctx)) },
        { method: 'GET', path: '/care/:entityType/:id/balances', handler: (ctx) => care.balances(et(ctx), id(ctx)) },
        { method: 'GET', path: '/care/:entityType/:id/broadbandFacts', handler: (ctx) => care.broadbandFacts(et(ctx), id(ctx)) },
        { method: 'GET', path: '/care/:entityType/:id/notes', handler: (ctx) => care.listNotes(et(ctx), id(ctx)) },
        { method: 'POST', path: '/care/:entityType/:id/notes', handler: (ctx) => care.createNote(et(ctx), id(ctx), obj<NewNote>(ctx.body)) },
        { method: 'GET', path: '/care/:entityType/:id/supportActions', handler: (ctx) => care.supportActions(et(ctx)) },
        { method: 'POST', path: '/care/:entityType/:id/supportActions/:action', status: 200, handler: (ctx) => care.runSupportAction(et(ctx), id(ctx), ctx.params.action!) },
        { method: 'GET', path: '/care/user/:id/latestOrder', handler: async (ctx) => (await care.latestOrder(id(ctx))) ?? null },

        { method: 'GET', path: '/care/attachment/:id', handler: async (ctx) => {
            const a = await care.getAttachment(id(ctx));
            return new FileResult(a.name, a.type, Buffer.from(a.content, 'base64'));
        } },

        // billing
        { method: 'GET', path: '/care/account/:id/billingSummary', handler: (ctx) => care.billingSummary(id(ctx)) },
        { method: 'GET', path: '/care/account/:id/invoices', handler: (ctx) => care.listInvoices(id(ctx)) },
        { method: 'GET', path: '/care/account/:id/transactions', handler: (ctx) => care.listTransactions(id(ctx)) },
        { method: 'GET', path: '/care/account/:id/salesforceMessages', handler: (ctx) => care.salesforceMessages(id(ctx)) },
        { method: 'GET', path: '/care/invoice/:id/pdf', handler: async (ctx) => {
            const { filename, pdf } = await care.invoicePdf(id(ctx));
            return new FileResult(filename, 'application/pdf', pdf, true);
        } },
        { method: 'POST', path: '/care/transaction/:id/refund', status: 200, handler: (ctx) => care.refund(id(ctx), obj(ctx.body)) },

        // appointments
        { method: 'GET', path: '/care/subscriber/:id/appointments', handler: (ctx) => care.listAppointments(id(ctx)) },
        { method: 'PATCH', path: '/care/appointment/:id', handler: (ctx) => care.updateAppointment(id(ctx), obj(ctx.body)) },

        // layouts and preferences
        { method: 'GET', path: '/care/layout/:page', handler: (ctx) => care.getLayout(ctx.params.page!) },
        // versioning: draft (working copy), commit, history, restore
        { method: 'PUT', path: '/care/layout/:page/draft', handler: (ctx) => care.layoutVersions.saveDraft(ctx.params.page!, obj(ctx.body)) },
        { method: 'DELETE', path: '/care/layout/:page/draft', status: 200, handler: (ctx) => care.layoutVersions.discardDraft(ctx.params.page!) },
        { method: 'POST', path: '/care/layout/:page/:scope/commit', handler: (ctx) => care.layoutVersions.commit(ctx.params.page!, ctx.params.scope!, obj(ctx.body)) },
        { method: 'GET', path: '/care/layout/:page/versions', handler: (ctx) => care.layoutVersions.list(ctx.params.page!, ctx.query.get('scope') ?? undefined) },
        { method: 'GET', path: '/care/layout/:page/versions/:scope/:n', handler: (ctx) => care.layoutVersions.getVersion(ctx.params.page!, ctx.params.scope!, ctx.params.n!) },
        { method: 'POST', path: '/care/layout/:page/versions/:scope/:n/restore', handler: (ctx) => care.layoutVersions.restore(ctx.params.page!, ctx.params.scope!, ctx.params.n!, opt(ctx.body)) },
        { method: 'PUT', path: '/care/layout/:page/:scope', handler: (ctx) => care.saveLayout(ctx.params.page!, ctx.params.scope!, obj(ctx.body)) },
        { method: 'DELETE', path: '/care/layout/:page/user', status: 200, handler: (ctx) => care.resetLayout(ctx.params.page!) },
        { method: 'GET', path: '/care/settings', handler: () => care.getSettings() },
        { method: 'GET', path: '/care/menu', handler: () => care.getMenu() },
        { method: 'PUT', path: '/care/menu', handler: (ctx) => care.saveMenu(ctx.body) },
        { method: 'DELETE', path: '/care/menu', handler: () => care.resetMenu(), status: 200 },
        { method: 'PUT', path: '/care/settings', handler: (ctx) => care.saveSettings(obj(ctx.body)) },

        // sidebar pages
        { method: 'GET', path: '/care/messageHistory', handler: (ctx) => care.messageHistory({ userId: ctx.query.get('userId') ?? undefined }) },
        { method: 'GET', path: '/care/externalLogHistory', handler: (ctx) => care.externalLogHistory({ entityType: ctx.query.get('entityType') ?? undefined, entityId: ctx.query.get('entityId') ?? undefined }) },

        // Customer 360
        { method: 'GET', path: '/customer360/offerings', handler: () => c360.offerings() },
        { method: 'GET', path: '/customer360/:kind', handler: (ctx) => c360.list(kind(ctx)) },
        { method: 'GET', path: '/customer360/:kind/:id', handler: (ctx) => c360.header(kind(ctx), id(ctx)) },
        { method: 'GET', path: '/customer360/:kind/:id/general', handler: (ctx) => c360.general(kind(ctx), id(ctx)) },
        { method: 'PATCH', path: '/customer360/:kind/:id/general', handler: (ctx) => c360.updateGeneral(kind(ctx), id(ctx), obj(ctx.body)) },
        { method: 'GET', path: '/customer360/:kind/:id/orders', handler: (ctx) => c360.orders(kind(ctx), id(ctx)) },
        { method: 'GET', path: '/customer360/:kind/:id/portfolio', handler: (ctx) => c360.portfolio(kind(ctx), id(ctx)) },
        { method: 'POST', path: '/customer360/:kind/:id/purchase', handler: (ctx) => c360.purchase(kind(ctx), id(ctx), obj(ctx.body)) },
        { method: 'POST', path: '/customer360/:kind/:id/modifyByOrder', handler: (ctx) => c360.modifyByOrder(kind(ctx), id(ctx), obj(ctx.body)) },
        { method: 'POST', path: '/customer360/:kind/:id/quotes', handler: (ctx) => c360.createQuote(kind(ctx), id(ctx), obj(ctx.body)) },
        { method: 'GET', path: '/customer360/:kind/:id/quotes', handler: (ctx) => c360.listQuotes(kind(ctx), id(ctx)) },
        { method: 'POST', path: '/customer360/quote/:id/state', status: 200, handler: (ctx) => c360.setQuoteState(id(ctx), obj<{ state: Quote['state'] }>(ctx.body).state) },
        { method: 'POST', path: '/customer360/subscription/:id/status', status: 200, handler: (ctx) => c360.modifyStatus('subscription', id(ctx), String(obj<{ status: string }>(ctx.body).status)) },
        { method: 'POST', path: '/customer360/product/:id/status', status: 200, handler: (ctx) => c360.modifyStatus('product', id(ctx), String(obj<{ status: string }>(ctx.body).status)) },
        { method: 'GET', path: '/customer360/:kind/:id/accounts', handler: (ctx) => c360.accounts(kind(ctx), id(ctx)) },
        { method: 'DELETE', path: '/customer360/:kind/:id/accounts/:accountId', status: 200, handler: (ctx) => c360.closeAccount(kind(ctx), id(ctx), ctx.params.accountId!) },
        { method: 'GET', path: '/customer360/:kind/:id/bills', handler: (ctx) => c360.bills(kind(ctx), id(ctx)) },
        { method: 'GET', path: '/customer360/bill/:id/pdf', handler: async (ctx) => {
            const { filename, pdf } = await c360.billPdf(id(ctx));
            return new FileResult(filename, 'application/pdf', pdf, true);
        } },
        { method: 'GET', path: '/customer360/:kind/:id/payments', handler: (ctx) => c360.payments(kind(ctx), id(ctx)) },
        { method: 'POST', path: '/customer360/:kind/:id/payments', handler: (ctx) => c360.createPayment(kind(ctx), id(ctx), opt(ctx.body)) },
        { method: 'GET', path: '/customer360/:kind/:id/provisioning', handler: (ctx) => c360.provisioning(kind(ctx), id(ctx)) },
    ];
}
