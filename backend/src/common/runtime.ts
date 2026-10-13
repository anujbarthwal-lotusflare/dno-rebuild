/**
 * Cross-cutting runtime pieces: clock, event bus, saga runner, config, merge patch.
 */
import type { Collection, Store } from './store.ts';

/** Injectable clock so billing/term logic is testable. */
export interface Clock {
    now(): Date;
}
export class SystemClock implements Clock {
    now(): Date {
        return new Date();
    }
}
export class FixedClock implements Clock {
    private t: Date;
    constructor(iso: string) {
        this.t = new Date(iso);
    }
    now(): Date {
        return new Date(this.t);
    }
    set(iso: string): void {
        this.t = new Date(iso);
    }
    advanceDays(days: number): void {
        this.t = new Date(this.t.getTime() + days * 86_400_000);
    }
}

export interface DomainEvent {
    id: string;
    eventType: string;
    eventTime: string;
    payload: unknown;
}

type Handler = (payload: never, event: DomainEvent) => void | Promise<void>;

/**
 * In-process event bus standing in for Kafka. Events are persisted (so the portal
 * can show an activity feed) and delivered to subscribers in order. A failing
 * subscriber never fails the publisher, matching the fire-and-forget event
 * emission of the original services.
 */
export class EventBus {
    private readonly handlers = new Map<string, Handler[]>();
    private readonly log: Collection<DomainEvent>;
    private readonly clock: Clock;
    readonly errors: { eventType: string; error: string }[] = [];

    constructor(store: Store, clock: Clock) {
        this.log = store.collection<DomainEvent>('event', 'Event');
        this.clock = clock;
    }

    on<P>(eventType: string, handler: (payload: P, event: DomainEvent) => void | Promise<void>): void {
        const list = this.handlers.get(eventType) ?? [];
        list.push(handler as Handler);
        this.handlers.set(eventType, list);
    }

    async publish(eventType: string, payload: unknown): Promise<void> {
        const event = await this.log.insert({ eventType, eventTime: this.clock.now().toISOString(), payload });
        for (const h of this.handlers.get(eventType) ?? []) {
            try {
                await h(payload as never, event);
            } catch (e) {
                this.errors.push({ eventType, error: e instanceof Error ? e.message : String(e) });
            }
        }
    }

    async recent(limit = 100): Promise<DomainEvent[]> {
        const all = await this.log.list();
        return all.slice(-limit).reverse();
    }
}

export interface SagaStep<C> {
    name: string;
    run(ctx: C): Promise<void>;
    /** Undo this step. Called in reverse order for every completed step when a later step fails. */
    compensate?(ctx: C): Promise<void>;
}

export interface SagaExecution {
    id: string;
    plan: string;
    startedAt: string;
    finishedAt?: string;
    status: 'running' | 'succeeded' | 'rolledBack' | 'rollbackFailed';
    steps: { name: string; status: 'done' | 'failed' | 'compensated' | 'compensationFailed'; error?: string }[];
    error?: string;
    ref?: string;
}

/**
 * Sequential plan runner with rollback. Stands in for the Lua Orchestration Engine
 * that executes the JSON plans (`place_order.json`, `fulfilment_execution_v2.json`,
 * each with a `rollback_definition`).
 */
export class SagaRunner {
    private readonly executions: Collection<SagaExecution>;
    private readonly clock: Clock;

    constructor(store: Store, clock: Clock) {
        this.executions = store.collection<SagaExecution>('sagaExecution', 'SagaExecution');
        this.clock = clock;
    }

    async execute<C>(plan: string, steps: SagaStep<C>[], ctx: C, ref?: string): Promise<SagaExecution> {
        let exec = await this.executions.insert({
            plan,
            ref,
            startedAt: this.clock.now().toISOString(),
            status: 'running',
            steps: [],
        } as Omit<SagaExecution, 'id'>);
        const done: SagaStep<C>[] = [];
        try {
            for (const step of steps) {
                try {
                    await step.run(ctx);
                    exec.steps.push({ name: step.name, status: 'done' });
                    done.push(step);
                } catch (e) {
                    exec.steps.push({ name: step.name, status: 'failed', error: errText(e) });
                    throw e;
                }
            }
            exec.status = 'succeeded';
        } catch (e) {
            exec.error = errText(e);
            exec.status = 'rolledBack';
            for (const step of done.reverse()) {
                if (!step.compensate) continue;
                try {
                    await step.compensate(ctx);
                    exec.steps.push({ name: `rollback:${step.name}`, status: 'compensated' });
                } catch (ce) {
                    exec.status = 'rollbackFailed';
                    exec.steps.push({ name: `rollback:${step.name}`, status: 'compensationFailed', error: errText(ce) });
                }
            }
        }
        exec.finishedAt = this.clock.now().toISOString();
        exec = await this.executions.replace(exec);
        return exec;
    }

    list(): Promise<SagaExecution[]> {
        return this.executions.list();
    }
}

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Operator (tenant) configuration. The original reads these per operator from config services. */
export interface OperatorConfig {
    operatorName: string;
    /** Decimal places for money (Lua: `currency_precision.monetary`). */
    monetaryPrecision: number;
    /** Default tax rate in percent applied to charges when an offering does not carry its own. */
    defaultTaxRatePercent: number;
    /** ts-polaris BillingAccountValidator: `should_validate_credit_limit`. */
    shouldValidateCreditLimit: boolean;
    /** Lua `order_mgr.allow_partial_bundle_deactivation`. */
    allowPartialBundleDeactivation: boolean;
    /** Days past the payment due date at which each dunning step fires. */
    dunning: { graceWithSubscription: number; graceWithoutSubscription: number; terminating: number; terminated: number };
    /** Default sales channel name (ts-polaris priceCalculation `DefaultChannelName`). */
    defaultChannel: string;
}

export const defaultConfig: OperatorConfig = {
    operatorName: 'default',
    monetaryPrecision: 2,
    defaultTaxRatePercent: 0,
    shouldValidateCreditLimit: true,
    allowPartialBundleDeactivation: false,
    dunning: { graceWithSubscription: 1, graceWithoutSubscription: 15, terminating: 30, terminated: 60 },
    defaultChannel: 'CustomerCare',
};

/** RFC 7396 JSON Merge Patch (the original accepts merge patch and JSON Patch; only merge patch is rebuilt). */
export function mergePatch<T>(target: T, patch: unknown): T {
    if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return patch as T;
    const base: Record<string, unknown> =
        target !== null && typeof target === 'object' && !Array.isArray(target)
            ? { ...(target as Record<string, unknown>) }
            : {};
    for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
        if (v === null) delete base[k];
        else base[k] = mergePatch(base[k], v);
    }
    return base as T;
}

export const DAY_MS = 86_400_000;
export const addDays = (d: Date, days: number): Date => new Date(d.getTime() + days * DAY_MS);
