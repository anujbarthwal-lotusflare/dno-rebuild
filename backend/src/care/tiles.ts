/**
 * Tile catalog of the Customer Care Suite overview pages.
 *
 * Names, sizes and the pages each tile may be placed on are taken from the original
 * `unified/app/customerCareSuite/constants/layoutTiles.ts`. Column sets for the table tiles
 * follow the original tiles where they were read and the product guide otherwise.
 */
import type { PageKey } from './model.ts';

export type TileSize = 'XLARGE' | 'LARGE' | 'MEDIUM' | 'SMALL' | 'THIRD' | 'VERTICAL' | 'CUSTOM_SIZE';

/** Grid footprint per size: 12 columns, row height 120px (LAYOUT_TILE_CONFIGS). */
export const TILE_SIZES: Record<TileSize, { w: number; h: number }> = {
    XLARGE: { w: 12, h: 6 },
    LARGE: { w: 12, h: 4 },
    MEDIUM: { w: 6, h: 4 },
    SMALL: { w: 3, h: 4 },
    THIRD: { w: 4, h: 2 },
    VERTICAL: { w: 4, h: 6 },
    CUSTOM_SIZE: { w: 12, h: 3 },
};

/**
 * How a column renders: text; date (formatted with the agent's date/time settings);
 * status (coloured tag); money; method (HTTP method tag); code (HTTP status tag);
 * link:<entity> (opens that profile); mono (identifier).
 */
export type ColumnType = 'text' | 'date' | 'status' | 'money' | 'method' | 'code' | 'mono' | 'link:user' | 'link:account' | 'link:subscriber' | 'link:organization' | 'tags' | 'boolean';

export interface TileColumn {
    key: string;
    label: string;
    type?: ColumnType;
}

export interface TileDefinition {
    key: string;
    name: string;
    size: TileSize;
    pages: PageKey[];
    /** 'table': generic searchable table filled from /tile data; anything else names a dedicated component. */
    kind: string;
    columns?: TileColumn[];
}

const U: PageKey = 'User';
const A: PageKey = 'Account';
const S: PageKey = 'subscriber';
const O: PageKey = 'organization';

const c = (key: string, label: string, type?: ColumnType): TileColumn => (type ? { key, label, type } : { key, label });

export const TILES: TileDefinition[] = [
    { key: 'messageHistory', name: 'Message History', size: 'MEDIUM', pages: [U], kind: 'table', columns: [c('channel', 'Channel'), c('message', 'Message'), c('sentAt', 'Sent at', 'date'), c('status', 'Status', 'status')] },
    { key: 'salesforceMessageHistory', name: 'Salesforce Message History', size: 'LARGE', pages: [U], kind: 'salesforce' },
    { key: 'appointments', name: 'Appointments', size: 'SMALL', pages: [S], kind: 'appointments' },
    { key: 'loggedInDevices', name: 'Logged In Devices', size: 'LARGE', pages: [U], kind: 'table', columns: [c('deviceId', 'Device ID', 'mono'), c('deviceName', 'Device Name'), c('platform', 'Platform'), c('lastLogin', 'Last Login', 'date'), c('ipAddress', 'IP Address')] },
    { key: 'wallet', name: 'Wallet', size: 'SMALL', pages: [U, A, S], kind: 'wallet' },
    { key: 'currentBenefits', name: 'Current Benefits', size: 'SMALL', pages: [U], kind: 'currentBenefits' },
    { key: 'accessList', name: 'Access List', size: 'MEDIUM', pages: [O, A, S], kind: 'table', columns: [c('userId', 'User ID', 'link:user'), c('email', 'Email'), c('role', 'Role')] },
    { key: 'agentNotes', name: 'Agent Notes', size: 'LARGE', pages: [O, U, A, S], kind: 'agentNotes' },
    { key: 'credentialChangeHistory', name: 'Credential Change History', size: 'MEDIUM', pages: [U], kind: 'table', columns: [c('timestamp', 'Timestamp', 'date'), c('credentialType', 'Credential Type'), c('changedBy', 'Changed By'), c('channel', 'Channel')] },
    { key: 'billing', name: 'Billing', size: 'SMALL', pages: [U], kind: 'billing' },
    { key: 'billingV2', name: 'Billing V2', size: 'SMALL', pages: [U, A], kind: 'billingV2' },
    { key: 'latestTransaction', name: 'Payment History', size: 'SMALL', pages: [U], kind: 'table', columns: [c('transactionId', 'Transaction ID', 'mono'), c('type', 'Type'), c('timestamp', 'Timestamp', 'date'), c('amount', 'Amount', 'money'), c('status', 'Status', 'status')] },
    { key: 'latestOrderDetailsV2', name: 'Latest Order Details V2', size: 'SMALL', pages: [U], kind: 'latestOrder' },
    { key: 'billingTransaction', name: 'Billing Transaction', size: 'LARGE', pages: [A], kind: 'table', columns: [c('transactionId', 'Transaction ID', 'mono'), c('type', 'Type'), c('timestamp', 'Timestamp', 'date'), c('amount', 'Amount', 'money'), c('status', 'Status', 'status')] },
    { key: 'billingTransactionV2', name: 'Billing Transaction V2', size: 'LARGE', pages: [A], kind: 'billingTransactionV2' },
    { key: 'chargeInjectionTransaction', name: 'Charge Injection Transaction', size: 'LARGE', pages: [A, S], kind: 'table', columns: [c('transactionId', 'Transaction ID', 'mono'), c('chargeName', 'Charge Name'), c('amount', 'Amount', 'money'), c('timestamp', 'Timestamp', 'date'), c('status', 'Status', 'status')] },
    { key: 'chargeInjectionCharge', name: 'Charge Injection Charge', size: 'LARGE', pages: [A], kind: 'table', columns: [c('chargeId', 'Charge ID', 'mono'), c('name', 'Name'), c('amount', 'Amount', 'money'), c('recurrence', 'Recurrence'), c('status', 'Status', 'status')] },
    { key: 'promotionAndRetention', name: 'Promotions & Retention', size: 'LARGE', pages: [A, S], kind: 'table', columns: [c('promotionName', 'Promotion Name'), c('benefitType', 'Benefit Type'), c('discount', 'Discount'), c('remainingUses', 'Remaining Uses'), c('grantedAt', 'Granted At', 'date'), c('status', 'Status', 'status')] },
    { key: 'oeExecutionQueue', name: 'OE Execution Queue', size: 'LARGE', pages: [A, S], kind: 'table', columns: [c('executionId', 'Execution ID', 'mono'), c('plan', 'Plan'), c('createdAt', 'Created At', 'date'), c('scheduledAt', 'Scheduled At', 'date'), c('status', 'Status', 'status')] },
    { key: 'appointmentsNotes', name: 'Appointments Notes', size: 'LARGE', pages: [S], kind: 'table', columns: [c('appointmentId', 'Appointment ID', 'mono'), c('note', 'Note'), c('author', 'Author'), c('timestamp', 'Timestamp', 'date')] },
    { key: 'paymentTransaction', name: 'Payment Transaction', size: 'LARGE', pages: [A], kind: 'table', columns: [c('paymentId', 'Payment ID', 'mono'), c('method', 'Payment Method'), c('amount', 'Amount', 'money'), c('timestamp', 'Timestamp', 'date'), c('status', 'Status', 'status')] },
    { key: 'group', name: 'Group', size: 'LARGE', pages: [U], kind: 'table', columns: [c('groupId', 'Group ID', 'mono'), c('name', 'Name'), c('role', 'Role'), c('members', 'Members')] },
    { key: 'organizationAccounts', name: 'Organization Accounts', size: 'LARGE', pages: [O], kind: 'table', columns: [c('accountId', 'Account ID', 'link:account'), c('accountName', 'Account Name'), c('status', 'Status', 'status')] },
    { key: 'associatedRoles', name: 'Associated Roles', size: 'LARGE', pages: [O], kind: 'table', columns: [c('id', 'ID', 'link:user'), c('type', 'Type'), c('role', 'Role'), c('email', 'E-mail')] },
    { key: 'associatedEntities', name: 'Associated Entities', size: 'LARGE', pages: [O, U, A, S], kind: 'associatedEntities' },
    { key: 'associatedEntitiesLarge', name: 'Associated Entities Large', size: 'LARGE', pages: [O, U, A, S], kind: 'associatedEntities' },
    { key: 'associatedEntitiesV2', name: 'Associated Entities Tiles', size: 'MEDIUM', pages: [U, A, S], kind: 'associatedEntitiesV2' },
    { key: 'consentHistory', name: 'Consent History', size: 'LARGE', pages: [U, A, S], kind: 'table', columns: [c('consentType', 'Consent Type'), c('status', 'Status', 'status'), c('channel', 'Channel'), c('timestamp', 'Timestamp', 'date')] },
    { key: 'deliveries', name: 'Deliveries', size: 'LARGE', pages: [U, A], kind: 'table', columns: [c('deliveryId', 'Delivery ID', 'mono'), c('carrier', 'Carrier'), c('trackingNumber', 'Tracking Number', 'mono'), c('status', 'Status', 'status'), c('shippedAt', 'Shipped At', 'date'), c('deliveredAt', 'Delivered At', 'date')] },
    { key: 'invitations', name: 'Invitations', size: 'LARGE', pages: [U, A], kind: 'table', columns: [c('invitationId', 'Invitation ID', 'mono'), c('email', 'Email'), c('role', 'Role'), c('status', 'Status', 'status'), c('sentAt', 'Sent At', 'date')] },
    { key: 'authenticationHistory', name: 'Login History', size: 'MEDIUM', pages: [U], kind: 'table', columns: [c('timestamp', 'Timestamp', 'date'), c('status', 'Status', 'status'), c('ipAddress', 'IP Address'), c('device', 'Device')] },
    { key: 'orderDetails', name: 'Order Details', size: 'LARGE', pages: [A, S], kind: 'table', columns: [c('orderId', 'Order ID', 'mono'), c('friendlyOrderId', 'Friendly Order ID'), c('orderDate', 'Order date', 'date'), c('status', 'Status', 'status'), c('amount', 'Amount', 'money')] },
    { key: 'orderDetailsV2', name: 'Order Details V2', size: 'LARGE', pages: [A], kind: 'table', columns: [c('orderId', 'Order ID', 'mono'), c('friendlyOrderId', 'Friendly Order ID'), c('orderDate', 'Order date', 'date'), c('status', 'Status', 'status'), c('total', 'Total', 'money'), c('paymentMethod', 'Payment Method')] },
    { key: 'broadbandNutritionLabel', name: 'Broadband facts', size: 'VERTICAL', pages: [A, S], kind: 'broadbandFacts' },
    { key: 'billingStatements', name: 'Billing Statements', size: 'LARGE', pages: [A], kind: 'billingStatements' },
    { key: 'billingStatementsV2', name: 'Billing Statements V2', size: 'LARGE', pages: [A], kind: 'billingStatements' },
    { key: 'voucherHistory', name: 'Voucher History', size: 'LARGE', pages: [A, S], kind: 'table', columns: [c('voucherCode', 'Voucher Code', 'mono'), c('voucherSet', 'Voucher Set'), c('value', 'Value', 'money'), c('redeemedAt', 'Redeemed At', 'date'), c('status', 'Status', 'status')] },
    { key: 'oeWorkflow', name: 'Orchestration Engine Workflow', size: 'XLARGE', pages: [A, S], kind: 'table', columns: [c('workflowId', 'Workflow ID', 'mono'), c('plan', 'Plan'), c('startedAt', 'Started', 'date'), c('finishedAt', 'Finished', 'date'), c('steps', 'Steps'), c('status', 'Status', 'status')] },
    { key: 'outageHistory', name: 'Outage History', size: 'LARGE', pages: [S], kind: 'table', columns: [c('outageId', 'Outage ID', 'mono'), c('area', 'Area'), c('startedAt', 'Started', 'date'), c('resolvedAt', 'Resolved', 'date'), c('impact', 'Impact')] },
    { key: 'appointmentHistory', name: 'Appointments History', size: 'LARGE', pages: [S], kind: 'table', columns: [c('appointmentId', 'Appointment ID', 'mono'), c('type', 'Type'), c('date', 'Date', 'date'), c('status', 'Status', 'status')] },
    { key: 'dataTransfer', name: 'Data Transfer', size: 'LARGE', pages: [A], kind: 'table', columns: [c('transferId', 'Transfer ID', 'mono'), c('from', 'From'), c('to', 'To'), c('amount', 'Amount (GB)'), c('timestamp', 'Timestamp', 'date'), c('status', 'Status', 'status')] },
    { key: 'application', name: 'Applications', size: 'LARGE', pages: [A], kind: 'table', columns: [c('applicationId', 'Application ID', 'mono'), c('name', 'Name'), c('status', 'Status', 'status'), c('createdAt', 'Created', 'date')] },
    { key: 'wholesalePricingSchema', name: 'Wholesale Pricing Schema', size: 'SMALL', pages: [S], kind: 'keyValue' },
    { key: 'subscriptions', name: 'Subscriptions', size: 'LARGE', pages: [A, S], kind: 'table', columns: [c('subscriptionId', 'Subscription ID', 'mono'), c('plan', 'Plan'), c('startDate', 'Start Date', 'date'), c('endDate', 'End Date', 'date'), c('renewal', 'Renewal'), c('status', 'Status', 'status')] },
    { key: 'deviceInfo', name: 'Device Info', size: 'LARGE', pages: [S], kind: 'table', columns: [c('deviceType', 'Device Type'), c('serialNumber', 'Serial Number', 'mono'), c('imei', 'IMEI', 'mono'), c('model', 'Model'), c('status', 'Status', 'status')] },
    { key: 'portingTable', name: 'Porting Status', size: 'LARGE', pages: [S], kind: 'table', columns: [c('portId', 'Port ID', 'mono'), c('donorOperator', 'Donor Operator'), c('msisdn', 'MSISDN'), c('requestedAt', 'Requested At', 'date'), c('status', 'Status', 'status')] },
    { key: 'msisdnTransactionHistory', name: 'Change MSISDN transaction history', size: 'LARGE', pages: [S], kind: 'table', columns: [c('oldMsisdn', 'Old MSISDN'), c('newMsisdn', 'New MSISDN'), c('changedAt', 'Changed At', 'date'), c('reason', 'Reason')] },
    { key: 'serviceTransactions', name: 'Subscriber Usage', size: 'LARGE', pages: [S], kind: 'table', columns: [c('timestamp', 'Timestamp', 'date'), c('service', 'Service'), c('usage', 'Usage'), c('unit', 'Unit'), c('charged', 'Charged', 'money')] },
    { key: 'simSwapTransactionHistory', name: 'Sim swap transaction history', size: 'LARGE', pages: [S], kind: 'table', columns: [c('oldIccid', 'Old ICCID', 'mono'), c('newIccid', 'New ICCID', 'mono'), c('swappedAt', 'Swapped At', 'date'), c('reason', 'Reason'), c('status', 'Status', 'status')] },
    { key: 'flagChangesHistory', name: 'Flag Changes History', size: 'LARGE', pages: [A, S], kind: 'table', columns: [c('flag', 'Flag'), c('oldValue', 'Old Value'), c('newValue', 'New Value'), c('changedAt', 'Changed At', 'date'), c('changedBy', 'Changed By')] },
    { key: 'authenticationTransactionHistory', name: 'Authentication Transaction History', size: 'LARGE', pages: [U], kind: 'table', columns: [c('transactionId', 'Transaction ID', 'mono'), c('method', 'Method'), c('result', 'Result', 'status'), c('timestamp', 'Timestamp', 'date')] },
    { key: 'pricingRulesDiscounts', name: 'Pricing Rules Discounts', size: 'LARGE', pages: [A, S], kind: 'table', columns: [c('ruleName', 'Rule Name'), c('ruleId', 'Rule ID', 'mono'), c('discount', 'Discount'), c('appliedTo', 'Applied To'), c('validUntil', 'Valid Until', 'date')] },
    { key: 'networkSpecification', name: 'Network Specification', size: 'LARGE', pages: [S], kind: 'table', columns: [c('parameter', 'Parameter'), c('value', 'Value')] },
    { key: 'devedgeUsage', name: 'Devedge Usage', size: 'LARGE', pages: [A], kind: 'table', columns: [c('date', 'Date', 'date'), c('api', 'API'), c('calls', 'Calls'), c('errors', 'Errors')] },
    { key: 'outageNotifications', name: 'Outage Notifications', size: 'LARGE', pages: [S], kind: 'table', columns: [c('notificationId', 'Notification ID', 'mono'), c('channel', 'Channel'), c('sentAt', 'Sent At', 'date'), c('outageId', 'Outage ID', 'mono')] },
    { key: 'imeiHistory', name: 'IMEI History', size: 'LARGE', pages: [S], kind: 'table', columns: [c('imei', 'IMEI', 'mono'), c('deviceModel', 'Device Model'), c('firstSeen', 'First Seen', 'date'), c('lastSeen', 'Last Seen', 'date')] },
    { key: 'accountWarnings', name: 'Account Warnings', size: 'LARGE', pages: [A], kind: 'table', columns: [c('category', 'Category'), c('warning', 'Warning')] },
    { key: 'tmoIdInfo', name: 'TMO ID Info Tile', size: 'XLARGE', pages: [U], kind: 'keyValue' },
    { key: 'planAndPurchase', name: 'Plan And Purchase', size: 'LARGE', pages: [S, A], kind: 'planAndPurchase' },
    { key: 'balancesAndWallet', name: 'Balances and Wallet', size: 'CUSTOM_SIZE', pages: [S, A], kind: 'balancesAndWallet' },
    { key: 'externalLogHistorySubscriber', name: 'SUBSCRIBER BASED External Log History', size: 'LARGE', pages: [S], kind: 'table', columns: [c('id', 'ID', 'mono'), c('timestamp', 'Timestamp', 'date'), c('agent', 'Agent'), c('service', 'Service'), c('method', 'Method', 'method'), c('endpoint', 'Endpoint'), c('statusCode', 'Status', 'code')] },
    { key: 'externalLogHistoryAccount', name: 'ACCOUNT BASED External Log History', size: 'LARGE', pages: [A], kind: 'table', columns: [c('id', 'ID', 'mono'), c('timestamp', 'Timestamp', 'date'), c('agent', 'Agent'), c('service', 'Service'), c('method', 'Method', 'method'), c('endpoint', 'Endpoint'), c('statusCode', 'Status', 'code')] },
    { key: 'externalLogHistoryUser', name: 'USER BASED External Log History', size: 'LARGE', pages: [U], kind: 'table', columns: [c('id', 'ID', 'mono'), c('timestamp', 'Timestamp', 'date'), c('agent', 'Agent'), c('service', 'Service'), c('method', 'Method', 'method'), c('endpoint', 'Endpoint'), c('statusCode', 'Status', 'code')] },
    { key: 'auditLogs', name: 'Audit Logs Tile', size: 'LARGE', pages: [S, A, U], kind: 'table', columns: [c('timestamp', 'Timestamp', 'date'), c('agent', 'Agent'), c('action', 'Action'), c('method', 'Method', 'method'), c('path', 'Path'), c('status', 'Status', 'code')] },
    { key: 'applicableDiscount', name: 'Applicable Discount', size: 'LARGE', pages: [S], kind: 'table', columns: [c('discountName', 'Discount Name'), c('type', 'Type'), c('amount', 'Amount'), c('validFrom', 'Valid From', 'date'), c('validTo', 'Valid To', 'date')] },
    { key: 'subscriberWarnings', name: 'Subscriber Warnings', size: 'LARGE', pages: [S], kind: 'table', columns: [c('category', 'Category'), c('warning', 'Warning')] },
    { key: 'orderDiscountsSnapshot', name: 'Order Discounts Snapshot', size: 'LARGE', pages: [S], kind: 'table', columns: [c('orderId', 'Order ID', 'mono'), c('offerName', 'Offer Name'), c('discount', 'Discount', 'money'), c('pricingRule', 'Pricing Rule')] },
    { key: 'referralsInformation', name: 'Referrals Information', size: 'MEDIUM', pages: [S, A], kind: 'table', columns: [c('referralCode', 'Referral Code', 'mono'), c('referrer', 'Referrer'), c('reward', 'Reward'), c('createdAt', 'Created', 'date'), c('status', 'Status', 'status')] },
    { key: 'referees', name: 'Referees', size: 'MEDIUM', pages: [S, A], kind: 'table', columns: [c('refereeId', 'Referee ID', 'mono'), c('msisdn', 'MSISDN'), c('joinedAt', 'Joined At', 'date'), c('status', 'Status', 'status')] },
];

export const TILE_BY_KEY = new Map(TILES.map((t) => [t.key, t]));

/** The layouts a fresh install shows (the operator can replace them with "Save As Operator Default"). */
export type DefaultTile = string | { key: string; w: number; h: number };
export const DEFAULT_LAYOUTS: Record<PageKey, { sectionName: string; isInitiallyCollapsed?: boolean; tiles: DefaultTile[] }[]> = {
    User: [
        { sectionName: 'Billing', tiles: ['wallet', 'billingV2', 'billing', 'currentBenefits', 'associatedEntities'] },
        { sectionName: 'Activity', tiles: ['externalLogHistoryUser', 'salesforceMessageHistory', 'authenticationHistory', 'messageHistory', 'deliveries', 'agentNotes'] },
        { sectionName: 'History', isInitiallyCollapsed: true, tiles: ['latestTransaction', 'latestOrderDetailsV2', 'loggedInDevices', 'consentHistory', 'auditLogs'] },
    ],
    Account: [
        { sectionName: 'Billing', tiles: ['billingTransactionV2', 'billingV2', 'wallet', 'balancesAndWallet', 'orderDetailsV2'] },
        { sectionName: 'Account', tiles: ['associatedEntities', 'accessList', 'subscriptions', 'planAndPurchase', 'agentNotes'] },
        { sectionName: 'Operations', isInitiallyCollapsed: true, tiles: ['billingStatements', 'promotionAndRetention', 'pricingRulesDiscounts', 'voucherHistory', 'chargeInjectionTransaction', 'oeExecutionQueue', 'oeWorkflow', 'flagChangesHistory', 'broadbandNutritionLabel', 'referralsInformation', 'referees', 'externalLogHistoryAccount', 'auditLogs'] },
    ],
    subscriber: [
        { sectionName: 'Tiles', tiles: ['subscriberWarnings', 'appointments', 'wallet', 'wholesalePricingSchema', 'balancesAndWallet', 'planAndPurchase'] },
        { sectionName: 'Service', tiles: ['deviceInfo', 'imeiHistory', 'subscriptions', 'applicableDiscount', 'orderDiscountsSnapshot', 'appointmentsNotes', 'agentNotes'] },
        { sectionName: 'History', isInitiallyCollapsed: true, tiles: ['associatedEntities', 'accessList', 'consentHistory', 'externalLogHistorySubscriber', 'auditLogs'] },
    ],
    organization: [
        {
            sectionName: 'Organization',
            tiles: [{ key: 'associatedEntities', w: 6, h: 5 }, { key: 'accessList', w: 6, h: 5 }, 'agentNotes', 'organizationAccounts', 'associatedRoles'],
        },
    ],
};
