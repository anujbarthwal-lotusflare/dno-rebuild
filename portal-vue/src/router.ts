import { createRouter, createWebHashHistory } from 'vue-router';

export const router = createRouter({
    history: createWebHashHistory(),
    scrollBehavior: () => {
        document.getElementById('main')?.scrollTo({ top: 0 });
        return undefined;
    },
    routes: [
        { path: '/', redirect: '/customer-care/user-manager' },
        { path: '/customer-care', redirect: '/customer-care/user-manager' },
        { path: '/customer-care/user-manager', name: 'userManager', component: () => import('./pages/UserManagerPage.vue') },
        { path: '/customer-care/user-manager/search-results', name: 'searchResults', component: () => import('./pages/SearchResultsPage.vue') },
        {
            path: '/customer-care/user-manager/:entityType(user|account|subscriber|organization)/:id',
            name: 'overview',
            component: () => import('./pages/OverviewPage.vue'),
            props: true,
        },
        { path: '/customer-care/message-history', component: () => import('./pages/MessageHistoryPage.vue') },
        { path: '/customer-care/external-log-history', component: () => import('./pages/ExternalLogHistoryPage.vue') },
        { path: '/customer-management/:kind(residential|business)-customers', component: () => import('./pages/CustomersListPage.vue'), props: true },
        { path: '/customer-management/:kind(residential|business)-customer/:id', component: () => import('./pages/Customer360Page.vue'), props: true },
        { path: '/settings', redirect: '/settings/user-settings' },
        { path: '/settings/:section', component: () => import('./pages/SettingsPage.vue'), props: true },
        { path: '/module/:slug', component: () => import('./pages/ModulePage.vue'), props: true },
        { path: '/:rest(.*)*', component: () => import('./pages/NotFoundPage.vue') },
    ],
});
