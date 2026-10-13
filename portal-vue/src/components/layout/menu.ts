/**
 * Sidebar navigation, in the order of the original portal (components/layout/Sidebar.vue).
 * Modules outside the Customer Care Suite open a placeholder page in this rebuild.
 */
export interface MenuItem {
    /** Stable key for the menu editor when the name can change (the tenant). */
    key?: string;
    name: string;
    icon: string;
    link?: string;
    subItems?: { name: string; link: string }[];
}

const mod = (slug: string) => `/module/${slug}`;

export const MAIN_MENU: MenuItem[] = [
    { name: 'Home', icon: 'consistency/sidebar-home', link: mod('home') },
    {
        name: 'Product Catalog',
        icon: 'consistency/sidebar-product-catalog',
        subItems: [
            { name: 'Offers', link: mod('offers') },
            { name: 'Products', link: mod('products') },
            { name: 'Services', link: mod('services') },
            { name: 'Resources', link: mod('resources') },
        ],
    },
    {
        name: 'Pricing and Fees',
        icon: 'consistency/sidebar-pricing-and-fees',
        subItems: [
            { name: 'Fee Rules', link: mod('fee-rules') },
            { name: 'Pricing Rules', link: mod('pricing-rules') },
        ],
    },
    {
        name: 'Charging',
        icon: 'consistency/sidebar-charging',
        subItems: [
            { name: 'Charging Specifications', link: mod('charging-specifications') },
            { name: 'Policy Counters', link: mod('policy-counters') },
        ],
    },
    { name: 'Promotions', icon: 'consistency/sidebar-promotions', link: mod('promotions') },
    {
        name: 'Rewards',
        icon: 'consistency/sidebar-rewards',
        subItems: [
            { name: 'Reward Rules', link: mod('reward-rules') },
            { name: 'Voucher Sets', link: mod('voucher-sets') },
        ],
    },
    {
        name: 'Messages',
        icon: 'consistency/sidebar-campaigns',
        subItems: [{ name: 'Campaigns', link: mod('campaigns') }],
    },
    { name: 'Segments', icon: 'consistency/sidebar-segments', link: mod('segments') },
    {
        name: 'Data Hub',
        icon: 'consistency/sidebar-data-hub',
        subItems: [{ name: 'Explore', link: mod('data-hub') }],
    },
    {
        name: 'Customer Care',
        icon: 'consistency/sidebar-user-management',
        subItems: [
            { name: 'User Manager', link: '/customer-care/user-manager' },
            { name: 'Message History', link: '/customer-care/message-history' },
            { name: 'External Log History', link: '/customer-care/external-log-history' },
        ],
    },
    {
        name: 'Customers',
        icon: 'consistency/sidebar-our-team',
        subItems: [
            { name: 'Residential Customers', link: '/customer-management/residential-customers' },
            { name: 'Business Customers', link: '/customer-management/business-customers' },
        ],
    },
    { name: 'Reports', icon: 'consistency/sidebar-analytics', link: mod('reports') },
    {
        name: 'Orchestration Engine',
        icon: 'consistency/sidebar-orchestration',
        subItems: [
            { name: 'Plans', link: mod('orchestration-plans') },
            { name: 'Executions', link: mod('orchestration-executions') },
        ],
    },
    {
        name: 'Operations',
        icon: 'consistency/sidebar-operations',
        subItems: [{ name: 'Number Management', link: mod('number-management') }],
    },
    {
        name: 'Documents',
        icon: 'consistency/document',
        subItems: [{ name: 'Templates', link: mod('document-templates') }],
    },
    {
        name: 'Authentication',
        icon: 'consistency/lock-new',
        subItems: [{ name: 'Roles', link: mod('roles') }],
    },
    {
        name: 'Billing',
        icon: 'consistency/receipt',
        subItems: [
            { name: 'Billing Accounts', link: mod('billing-accounts') },
            { name: 'Disputes', link: mod('disputes') },
        ],
    },
    {
        name: 'Audit Logs',
        icon: 'consistency/details-new',
        subItems: [{ name: 'Portal Audit Logs', link: mod('audit-logs') }],
    },
];

export const FOOTER_MENU: MenuItem[] = [
    { name: 'Settings', icon: 'consistency/sidebar-settings', link: '/settings/user-settings' },
    {
        name: 'Support & Feedback',
        icon: 'consistency/sidebar-support',
        subItems: [
            { name: 'Contact Support', link: mod('support') },
            { name: 'Give Feedback', link: mod('feedback') },
        ],
    },
    {
        name: 'My Account',
        icon: 'consistency/sidebar-my-account',
        subItems: [{ name: 'Profile', link: mod('my-account') }],
    },
];
