/** Hash router and shell. */
import { h, page } from './ui.ts';
import * as pages from './pages.ts';

const NAV: [string, string][] = [
    ['#/', 'Overview'],
    ['#/customers', 'Customers'],
    ['#/catalog', 'Catalog'],
    ['#/orders', 'Orders'],
    ['#/accounts', 'Billing'],
    ['#/payments', 'Payments'],
];

function resolve(path: string, query: URLSearchParams): Promise<HTMLElement> {
    const p = path.split('/').filter(Boolean);
    switch (p[0]) {
        case undefined:
            return pages.overview();
        case 'customers':
            return p[1] && p[2] ? pages.customer(p[1], p[2]) : pages.customers();
        case 'catalog':
            return p[1] ? pages.offering(p[1]) : pages.catalog();
        case 'orders':
            if (p[1] === 'new') return pages.newOrder(query);
            return p[1] ? pages.order(p[1]) : pages.orders();
        case 'accounts':
            return p[1] ? pages.account(p[1]) : pages.accounts();
        case 'bills':
            if (p[1]) return pages.bill(p[1]);
            break;
        case 'payments':
            return pages.payments();
    }
    return Promise.resolve(page('Page not found', 'That address does not match any screen.', h('a', { href: '#/' }, 'Go to the overview')));
}

let renderId = 0;
async function render(): Promise<void> {
    const mine = ++renderId;
    const raw = location.hash.replace(/^#/, '') || '/';
    const [path = '/', search = ''] = raw.split('?');
    const view = document.getElementById('view')!;
    const section = '#/' + (path.split('/').filter(Boolean)[0] ?? '');
    const current = section === '#/bills' ? '#/accounts' : section;
    document.getElementById('nav')!.replaceChildren(
        ...NAV.map(([hash, label]) => h('li', null, h('a', { href: hash, 'aria-current': hash === current ? 'page' : undefined }, label)))
    );
    let content: HTMLElement;
    try {
        content = await resolve(path, new URLSearchParams(search));
    } catch (e) {
        content = page('This screen could not be loaded', (e as Error).message, h('button', { type: 'button', onclick: () => void render() }, 'Try again'));
    }
    if (mine !== renderId) return; // a newer navigation won
    const y = window.scrollY;
    const samePage = view.dataset.path === raw;
    view.replaceChildren(content);
    view.dataset.path = raw;
    if (samePage) window.scrollTo(0, y);
    else window.scrollTo(0, 0);
    document.title = `${content.querySelector('h1')?.textContent ?? 'DNO'} - DNO console`;
}

window.addEventListener('hashchange', () => void render());
void render();
