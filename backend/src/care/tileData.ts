/**
 * Rows for the read-only history tiles. The original fetches each from its own back-end
 * (delivery service, auth service, OE, charging...). Those systems are outside this rebuild,
 * so the rows are generated deterministically from the entity id: the same profile always
 * shows the same history, and some profiles show "No data" as they would in production.
 */
import type { CcsAccount, CcsSubscriber, CcsUser } from './model.ts';
import { DAY, Rng, iso } from './random.ts';

export interface TileContext {
    entityType: 'user' | 'account' | 'subscriber' | 'organization';
    entityId: string;
    now: number;
    user?: CcsUser;
    account?: CcsAccount;
    subscriber?: CcsSubscriber;
    currency: string;
    msisdn?: string;
    planName?: string;
}

type Row = Record<string, unknown>;

const times = (rng: Rng, n: number, f: (i: number) => Row): Row[] => Array.from({ length: n }, (_, i) => f(i));

export function generateRows(tile: string, ctx: TileContext): Row[] | undefined {
    const rng = new Rng(`${tile}:${ctx.entityId}`);
    const ago = (maxDays: number, minDays = 0) => iso(ctx.now - rng.int(minDays * 24, maxDays * 24) * 3600_000 - rng.int(0, 3599) * 1000);
    const ahead = (maxDays: number, minDays = 1) => iso(ctx.now + rng.int(minDays, maxDays) * DAY);
    const money = (min: number, max: number) => ({ value: rng.money(min, max), currency: ctx.currency });
    const empty = (p: number) => rng.chance(p);
    const plan = ctx.planName ?? 'Mobile 15GB';
    const msisdn = ctx.msisdn ?? '15550100000';

    switch (tile) {
        case 'messageHistory':
            return times(rng, rng.int(3, 8), () => ({
                channel: rng.pick(['SMS', 'E-mail', 'Push']),
                message: rng.pick(['Your bill is ready', 'Data usage at 80%', 'Welcome to LotusFlare', 'Your order has shipped', 'OTP for sign-in']),
                sentAt: ago(60),
                status: rng.pick(['Delivered', 'Delivered', 'Sent', 'Failed']),
            }));
        case 'loggedInDevices':
            return times(rng, rng.int(1, 3), () => ({
                deviceId: rng.hex(16),
                deviceName: rng.pick(["Yan's iPhone", 'Galaxy S24', 'Chrome on macOS', 'Pixel 9']),
                platform: rng.pick(['iOS 18', 'Android 15', 'Web']),
                lastLogin: ago(10),
                ipAddress: `${rng.int(10, 200)}.${rng.int(0, 255)}.${rng.int(0, 255)}.${rng.int(1, 254)}`,
            }));
        case 'credentialChangeHistory':
            return times(rng, rng.int(0, 4), () => ({
                timestamp: ago(200),
                credentialType: rng.pick(['Password', 'PIN', 'E-mail', 'MSISDN']),
                changedBy: rng.pick(['End user', 'Agent: Maria Lopez', 'System']),
                channel: rng.pick(['App', 'Portal', 'Web']),
            }));
        case 'latestTransaction':
        case 'billingTransaction':
            return times(rng, rng.int(3, 7), () => ({
                transactionId: rng.uuid(),
                type: rng.pick(['Manual Payment', 'Auto Payment', 'Reserve']),
                timestamp: ago(120),
                amount: money(10, 80),
                status: rng.pick(['Succeeded', 'Succeeded', 'Succeeded', 'Failed']),
            }));
        case 'chargeInjectionTransaction':
            if (empty(0.3)) return [];
            return times(rng, rng.int(1, 4), () => ({
                transactionId: rng.uuid(),
                chargeName: rng.pick(['Late payment fee', 'Device installment', 'Roaming adjustment', 'Goodwill credit']),
                amount: money(1, 40),
                timestamp: ago(90),
                status: rng.pick(['Applied', 'Applied', 'Pending', 'Reverted']),
            }));
        case 'chargeInjectionCharge':
            return times(rng, rng.int(1, 3), () => ({
                chargeId: rng.hex(12),
                name: rng.pick(['Device installment', 'Paper bill fee', 'Static IP']),
                amount: money(2, 25),
                recurrence: rng.pick(['Monthly', 'One time']),
                status: rng.pick(['Active', 'Active', 'Ended']),
            }));
        case 'promotionAndRetention':
            return times(rng, rng.int(1, 4), (i) => ({
                promotionName: rng.pick(['Welcome 20%', 'Loyalty 5 off', 'Retention 3 months 50%', 'Refer a friend']),
                benefitType: rng.pick(['Percentage discount', 'Fixed discount', 'Free data']),
                discount: rng.pick(['20%', '$5.00', '50%', '5GB']),
                remainingUses: rng.int(0, 6),
                grantedAt: ago(300),
                status: i === 0 ? 'Active' : rng.pick(['Active', 'Historical']),
            }));
        case 'oeExecutionQueue':
            return times(rng, rng.int(0, 4), () => ({
                executionId: rng.uuid(),
                plan: rng.pick(['fulfilment_execution_v2', 'subscriber_suspend', 'bill_run_notification', 'place_order']),
                createdAt: ago(5),
                scheduledAt: ahead(3, 0),
                status: rng.pick(['Queued', 'Running', 'Completed', 'Failed']),
            }));
        case 'appointmentsNotes':
            return times(rng, rng.int(0, 3), () => ({
                appointmentId: rng.hex(16).toUpperCase(),
                note: rng.pick(['Technician arrived on time, ONT installed.', 'Customer not home, rescheduled.', 'Signal levels verified: -18 dBm.']),
                author: rng.pick(['Field tech: J. Smith', 'Agent: Maria Lopez']),
                timestamp: ago(60),
            }));
        case 'paymentTransaction':
            return times(rng, rng.int(2, 6), () => ({
                paymentId: rng.uuid(),
                method: rng.pick(['Visa **** 4242', 'Mastercard **** 5454', 'Direct debit']),
                amount: money(15, 90),
                timestamp: ago(150),
                status: rng.pick(['Succeeded', 'Succeeded', 'Refunded', 'Failed']),
            }));
        case 'group':
            return times(rng, rng.int(0, 2), () => ({ groupId: rng.hex(12), name: rng.pick(['Family plan', 'Sales team', 'Field crew']), role: rng.pick(['Owner', 'Member']), members: rng.int(2, 9) }));
        case 'consentHistory':
            return times(rng, rng.int(2, 5), () => ({
                consentType: rng.pick(['Marketing e-mails', 'Marketing SMS', 'Data processing', 'Location analytics', 'Terms & Conditions']),
                status: rng.pick(['Granted', 'Granted', 'Withdrawn']),
                channel: rng.pick(['App', 'Web', 'Agent']),
                timestamp: ago(400),
            }));
        case 'deliveries':
            if (empty(0.3)) return [];
            return times(rng, rng.int(1, 3), () => {
                const shipped = ctx.now - rng.int(3, 90) * DAY;
                const delivered = rng.chance(0.8);
                return {
                    deliveryId: rng.hex(12),
                    carrier: rng.pick(['DHL', 'FedEx', 'UPS', 'Aramex']),
                    trackingNumber: rng.digits(12),
                    status: delivered ? 'Delivered' : 'In transit',
                    shippedAt: iso(shipped),
                    deliveredAt: delivered ? iso(shipped + rng.int(1, 4) * DAY) : '',
                };
            });
        case 'invitations':
            return times(rng, rng.int(0, 3), () => ({
                invitationId: rng.hex(12),
                email: rng.pick(['john.doe', 'mary.k', 'ops.team']) + '@example.com',
                role: rng.pick(['member', 'viewer']),
                status: rng.pick(['Pending', 'Accepted', 'Expired']),
                sentAt: ago(60),
            }));
        case 'authenticationHistory':
            return times(rng, rng.int(4, 12), () => ({
                timestamp: ago(30),
                status: rng.pick(['Success', 'Success', 'Success', 'Failed']),
                ipAddress: `${rng.int(10, 200)}.${rng.int(0, 255)}.${rng.int(0, 255)}.${rng.int(1, 254)}`,
                device: rng.pick(['iPhone 15 Pro / iOS 18', 'Chrome 129 / macOS', 'Pixel 9 / Android 15']),
            }));
        case 'orderDetails':
        case 'orderDetailsV2':
            return times(rng, rng.int(2, 5), () => {
                const d = ctx.now - rng.int(1, 200) * DAY;
                const date = new Date(d);
                const friendly = `SL${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}${rng.hex(5).toUpperCase()}`;
                return {
                    orderId: rng.uuid(),
                    friendlyOrderId: friendly,
                    orderDate: iso(d),
                    status: rng.pick(['Completed', 'Completed', 'In progress', 'Cancelled']),
                    amount: money(20, 300),
                    total: money(20, 300),
                    paymentMethod: rng.pick(['Visa **** 4242', 'Direct debit']),
                };
            });
        case 'voucherHistory':
            return times(rng, rng.int(0, 3), () => ({
                voucherCode: rng.hex(10).toUpperCase(),
                voucherSet: rng.pick(['Welcome vouchers', 'Retail top-up', 'Apology credit']),
                value: money(5, 50),
                redeemedAt: ago(200),
                status: rng.pick(['Redeemed', 'Redeemed', 'Expired']),
            }));
        case 'oeWorkflow':
            return times(rng, rng.int(2, 6), () => {
                const start = ctx.now - rng.int(1, 60) * DAY;
                const ok = rng.chance(0.8);
                return {
                    workflowId: rng.uuid(),
                    plan: rng.pick(['place_order', 'fulfilment_execution_v2', 'product_order_item_fulfilment', 'subscriber_activation']),
                    startedAt: iso(start),
                    finishedAt: iso(start + rng.int(2, 600) * 1000),
                    steps: `${rng.int(3, 12)} / ${rng.int(12, 14)}`,
                    status: ok ? 'Completed' : rng.pick(['Failed', 'Rolled back']),
                };
            });
        case 'outageHistory':
            return times(rng, rng.int(0, 3), () => {
                const s = ctx.now - rng.int(5, 200) * DAY;
                return { outageId: rng.hex(10), area: rng.pick(['Cape Town CBD', 'Sector 7', 'North Hub']), startedAt: iso(s), resolvedAt: iso(s + rng.int(1, 12) * 3600_000), impact: rng.pick(['Data only', 'Voice and data', 'Fibre']) };
            });
        case 'appointmentHistory':
            return times(rng, rng.int(1, 4), () => ({ appointmentId: rng.hex(16).toUpperCase(), type: rng.pick(['Installation', 'Repair', 'Site survey']), date: ago(300), status: rng.pick(['Completed', 'Completed', 'Cancelled']) }));
        case 'dataTransfer':
            return times(rng, rng.int(0, 3), () => ({ transferId: rng.hex(12), from: msisdn, to: '2771' + rng.digits(7), amount: rng.pick([1, 2, 5]), timestamp: ago(60), status: rng.pick(['Completed', 'Completed', 'Rejected']) }));
        case 'application':
            return times(rng, rng.int(0, 2), () => ({ applicationId: rng.hex(12), name: rng.pick(['Partner app', 'IoT fleet']), status: rng.pick(['Active', 'Suspended']), createdAt: ago(400) }));
        case 'subscriptions':
            return times(rng, rng.int(1, 3), (i) => {
                const s = ctx.now - rng.int(30, 400) * DAY;
                return {
                    subscriptionId: rng.uuid(),
                    plan: i === 0 ? plan : rng.pick(['Roaming pack', 'Netflix add-on', 'Extra 5GB']),
                    startDate: iso(s),
                    endDate: iso(s + 365 * DAY),
                    renewal: rng.pick(['Auto renew', 'Manual']),
                    status: i === 0 ? 'Active' : rng.pick(['Active', 'Expired']),
                };
            });
        case 'deviceInfo': {
            const model = ctx.subscriber?.deviceModel ?? 'iPhone 15 Pro';
            const rows: Row[] = [{ deviceType: model.includes('Gateway') ? 'CPE' : 'Handset', serialNumber: rng.hex(12).toUpperCase(), imei: '35' + rng.digits(13), model, status: 'Active' }];
            if (rng.chance(0.5)) rows.push({ deviceType: 'ONT', serialNumber: 'ALCL' + rng.hex(8).toUpperCase(), imei: '', model: 'Nokia G-010G-Q', status: rng.pick(['Active', 'Provisioning']) });
            return rows;
        }
        case 'portingTable':
            if (empty(0.5)) return [];
            return [{ portId: rng.hex(10), donorOperator: rng.pick(['Vodacom', 'MTN', 'Telkom']), msisdn, requestedAt: ago(200), status: rng.pick(['Completed', 'Completed', 'Rejected']) }];
        case 'msisdnTransactionHistory':
            if (empty(0.6)) return [];
            return [{ oldMsisdn: '2771' + rng.digits(7), newMsisdn: msisdn, changedAt: ago(300), reason: rng.pick(['Customer request', 'Number recycling']) }];
        case 'serviceTransactions':
            return times(rng, rng.int(5, 12), () => {
                const service = rng.pick(['Data', 'Voice', 'SMS']);
                return {
                    timestamp: ago(14),
                    service,
                    usage: service === 'Data' ? rng.int(10, 2048) : service === 'Voice' ? rng.int(1, 45) : 1,
                    unit: service === 'Data' ? 'MB' : service === 'Voice' ? 'min' : 'msg',
                    charged: money(0, 2),
                };
            });
        case 'simSwapTransactionHistory':
            if (empty(0.6)) return [];
            return [{ oldIccid: '8927' + rng.digits(15), newIccid: ctx.subscriber?.iccid ?? '8927' + rng.digits(15), swappedAt: ago(300), reason: rng.pick(['Lost SIM', 'eSIM migration', 'Damaged SIM']), status: 'Completed' }];
        case 'flagChangesHistory':
            return times(rng, rng.int(0, 4), () => {
                const flag = rng.pick(['isFraud', 'isBlocked', 'marketingOptIn', 'isLocallyTied', 'paperBill']);
                const old = rng.chance(0.5);
                return { flag, oldValue: String(old), newValue: String(!old), changedAt: ago(300), changedBy: rng.pick(['Agent: Maria Lopez', 'System', 'End user']) };
            });
        case 'authenticationTransactionHistory':
            return times(rng, rng.int(2, 6), () => ({ transactionId: rng.uuid(), method: rng.pick(['OTP SMS', 'Password', 'Passkey', 'Magic link']), result: rng.pick(['Success', 'Success', 'Failed']), timestamp: ago(30) }));
        case 'pricingRulesDiscounts':
            return times(rng, rng.int(0, 3), () => ({ ruleName: rng.pick(['Loyalty 5 off', 'Bundle discount', 'Student 10%']), ruleId: rng.hex(12), discount: rng.pick(['$5.00', '10%', '15%']), appliedTo: plan, validUntil: ahead(300) }));
        case 'networkSpecification':
            return [
                { parameter: 'APN', value: 'internet.lotusflare' },
                { parameter: 'QoS class (QCI)', value: String(rng.pick([6, 8, 9])) },
                { parameter: 'Max downlink', value: rng.pick(['300 Mbps', '1 Gbps', '150 Mbps']) },
                { parameter: 'Max uplink', value: rng.pick(['50 Mbps', '100 Mbps']) },
                { parameter: 'VoLTE', value: 'Enabled' },
                { parameter: 'Network slice', value: rng.pick(['eMBB', 'default']) },
            ];
        case 'devedgeUsage':
            return times(rng, rng.int(3, 7), (i) => ({ date: iso(ctx.now - i * DAY), api: rng.pick(['Number Verification', 'SIM Swap', 'Device Location', 'QoD']), calls: rng.int(10, 5000), errors: rng.int(0, 30) }));
        case 'outageNotifications':
            return times(rng, rng.int(0, 2), () => ({ notificationId: rng.hex(10), channel: rng.pick(['SMS', 'Push']), sentAt: ago(100), outageId: rng.hex(10) }));
        case 'imeiHistory':
            return times(rng, rng.int(1, 3), () => {
                const first = ctx.now - rng.int(100, 700) * DAY;
                return { imei: '35' + rng.digits(13), deviceModel: rng.pick(['iPhone 13', 'iPhone 15 Pro', 'Galaxy S22', 'Galaxy S24', 'Pixel 9']), firstSeen: iso(first), lastSeen: iso(first + rng.int(10, 90) * DAY) };
            });
        case 'accountWarnings':
            if (empty(0.4)) return [];
            return [{ category: rng.pick(['Billing', 'Credit']), warning: rng.pick(['Payment method expires next month', 'Account is close to its credit limit', 'Two failed payments in the last 30 days']) }];
        case 'subscriberWarnings':
            if (ctx.subscriber?.state === 'Pending activation' || rng.chance(0.6))
                return [{ category: 'Subscriber Activation', warning: 'Installation is pending for activated subscriber, please advise' }];
            return [];
        case 'applicableDiscount':
            return times(rng, rng.int(0, 3), () => ({ discountName: rng.pick(['Autopay discount', 'Loyalty 5 off', 'Bundle saver']), type: rng.pick(['Fixed', 'Percentage']), amount: rng.pick(['$5.00', '10%', '$10.00']), validFrom: ago(200), validTo: ahead(200) }));
        case 'orderDiscountsSnapshot':
            return times(rng, rng.int(0, 3), () => ({ orderId: rng.uuid(), offerName: plan, discount: money(2, 20), pricingRule: rng.pick(['Welcome 20%', 'Bundle saver']) }));
        case 'referralsInformation':
            return times(rng, rng.int(0, 2), () => ({ referralCode: rng.hex(8).toUpperCase(), referrer: rng.pick(['Mary K', 'John D', '—']), reward: rng.pick(['5GB data', '$10 credit']), createdAt: ago(300), status: rng.pick(['Rewarded', 'Pending']) }));
        case 'referees':
            return times(rng, rng.int(0, 3), () => ({ refereeId: rng.hex(12), msisdn: '2771' + rng.digits(7), joinedAt: ago(300), status: rng.pick(['Active', 'Pending']) }));
        case 'externalLogHistorySubscriber':
        case 'externalLogHistoryAccount':
        case 'externalLogHistoryUser':
            return times(rng, rng.int(8, 45), () => ({
                id: rng.hex(32),
                timestamp: ago(30),
                agent: rng.pick(['Yan Li', 'Maria Lopez', 'Daniel Kim']),
                service: rng.pick(['User Management (v3)', 'Billing (v4)', 'Charging', 'Order Management']),
                method: rng.pick(['POST', 'POST', 'GET', 'PATCH']),
                endpoint: rng.pick(['/v3usermanager/fetchserviceinfo', '/v3usermanager/getuserinfo', '/v4billing/getbills', '/v3charging/getwallet', '/v1ordering/order']),
                statusCode: rng.pick([200, 200, 200, 200, 400, 500]),
            }));
        default:
            return undefined;
    }
}

/** Key/value tiles. */
export function generateKeyValue(tile: string, ctx: TileContext): { label: string; value: string }[] | undefined {
    const rng = new Rng(`${tile}:${ctx.entityId}`);
    switch (tile) {
        case 'wholesalePricingSchema':
            return [
                { label: 'Schema', value: rng.pick(['MVNO Tier 2', 'Wholesale Standard', 'Partner Gold']) },
                { label: 'Rate per GB', value: `${ctx.currency} ${rng.money(0.5, 2.5).toFixed(2)}` },
                { label: 'Rate per minute', value: `${ctx.currency} ${rng.money(0.005, 0.03).toFixed(3)}` },
                { label: 'Effective from', value: iso(ctx.now - rng.int(30, 300) * DAY) },
            ];
        case 'tmoIdInfo':
            return [
                { label: 'TMO ID', value: rng.hex(24) },
                { label: 'Linked', value: rng.chance(0.5) ? 'Yes' : 'No' },
                { label: 'Validation method', value: rng.pick(['OTP SMS', 'E-mail']) },
                { label: 'PIN enabled', value: rng.chance(0.5) ? 'Yes' : 'No' },
                { label: 'Phone number for OTP', value: ctx.msisdn ?? '' },
            ];
        default:
            return undefined;
    }
}
