/** Tag colour for a status value, following the portal's status conventions. */
export type TagColor = 'green' | 'yellow' | 'red' | 'blue' | 'gray' | 'white';

const GREEN = ['active', 'succeeded', 'success', 'completed', 'delivered', 'paid', 'applied', 'granted', 'accepted', 'approved', 'rewarded', 'redeemed', 'settled', 'validated', 'verified', 'sent', 'enabled', 'post'];
const YELLOW = ['pending', 'scheduled', 'received', 'in progress', 'inprogress', 'initialized', 'queued', 'running', 'in transit', 'partially refunded', 'partially paid', 'partiallysettled', 'pending activation', 'provisioning', 'suspended', 'reserved', 'created', 'designed', 'acknowledged', 'draft', 'unpaid', 'patch', 'put'];
const RED = ['failed', 'terminated', 'terminating', 'cancelled', 'canceled', 'rejected', 'expired', 'overdue', 'closed', 'withdrawn', 'refunded', 'rolled back', 'reverted', 'deleted', 'inactive', 'aborted', 'delete', 'barred'];
const BLUE = ['historical', 'ended', 'get', 'manual', 'new'];

export function statusColor(status: unknown): TagColor {
    const s = String(status ?? '').toLowerCase().trim();
    if (!s) return 'gray';
    if (GREEN.includes(s)) return 'green';
    if (YELLOW.includes(s)) return 'yellow';
    if (RED.includes(s)) return 'red';
    if (BLUE.includes(s)) return 'blue';
    if (/^deletion /.test(s)) return s.includes('terminating') ? 'red' : 'yellow';
    if (/^2\d\d$/.test(s)) return 'green';
    if (/^[45]\d\d$/.test(s)) return 'red';
    return 'gray';
}

/** "pendingActive" -> "Pending active" */
export function statusLabel(status: unknown): string {
    const s = String(status ?? '');
    if (!s) return '';
    const spaced = s.replace(/([a-z])([A-Z])/g, '$1 $2');
    return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}
