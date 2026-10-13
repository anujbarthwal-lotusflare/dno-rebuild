/**
 * State machine engine.
 *
 * Port of ts-polaris `libs/stateMachineEngine`: a model of states with
 * target-transitions (caller names the state it wants) and event-transitions
 * (caller raises an event, the first transition whose guard passes wins),
 * optional guards, entry/exit/transition actions, and config validation at
 * construction time. Persistence callbacks are replaced by returning the
 * resolved next state, which the caller stores.
 */
import { invalid } from './errors.ts';

export interface Transition {
    guard?: string;
    actions?: string[];
}
export interface EventTransition extends Transition {
    target: string;
}
export interface StateDef {
    initial?: boolean;
    deletable?: boolean;
    entry?: string[];
    exit?: string[];
    on?: {
        targets?: Record<string, Transition>;
        events?: Record<string, EventTransition[]>;
    };
}
export interface StateMachineDef<C = unknown> {
    id: string;
    model: Record<string, StateDef>;
    guards?: Record<string, (ctx: C) => boolean | Promise<boolean>>;
    actions?: Record<string, (ctx: C) => void | Promise<void>>;
}

export class StateMachine<C = unknown> {
    readonly def: StateMachineDef<C>;

    constructor(def: StateMachineDef<C>) {
        this.def = def;
        this.validateConfig();
    }

    get id(): string {
        return this.def.id;
    }

    /** Validate that `state` may be used as the first state of a new entity. */
    async init(state: string, ctx: C): Promise<string> {
        const s = this.def.model[state];
        if (!s) throw invalid(`Initial state [${state}] is not found`);
        if (!s.initial) throw invalid(`Initial state [${state}] is not initializable`);
        await this.run(s.entry, ctx);
        return state;
    }

    /** Move from `current` to the explicitly requested `target`. */
    async target(current: string, target: string, ctx: C): Promise<string> {
        if (current === target) return target;
        const cur = this.def.model[current];
        if (!cur) throw invalid(`Current state [${current}] is not found`);
        const transition = cur.on?.targets?.[target];
        if (!transition) throw invalid(`No transition found from [${current}] to [${target}]`);
        if (transition.guard && !(await this.def.guards![transition.guard]!(ctx))) {
            throw invalid(`Guard for transition from [${current}] to [${target}] failed`);
        }
        await this.run(cur.exit, ctx);
        await this.run(transition.actions, ctx);
        await this.run(this.def.model[target]!.entry, ctx);
        return target;
    }

    /** Raise `event` in `current`; the first transition whose guard passes is taken. */
    async event(current: string, event: string, ctx: C): Promise<string> {
        const cur = this.def.model[current];
        if (!cur) throw invalid(`Current state [${current}] is not found`);
        let chosen: EventTransition | undefined;
        for (const t of cur.on?.events?.[event] ?? []) {
            if (!t.guard || (await this.def.guards![t.guard]!(ctx))) {
                chosen = t;
                break;
            }
        }
        if (!chosen) throw invalid(`All guards for event [${event}] in state [${current}] failed`);
        await this.run(cur.exit, ctx);
        await this.run(chosen.actions, ctx);
        await this.run(this.def.model[chosen.target]!.entry, ctx);
        return chosen.target;
    }

    /** Check that an entity in `current` may be deleted. */
    async assertDeletable(current: string, ctx: C): Promise<void> {
        const cur = this.def.model[current];
        if (!cur) throw invalid(`Current state [${current}] is not found`);
        if (!cur.deletable) throw invalid(`Current state [${current}] is not deletable`);
        await this.run(cur.exit, ctx);
    }

    canTarget(current: string, target: string): boolean {
        return current === target || !!this.def.model[current]?.on?.targets?.[target];
    }

    private async run(actions: string[] | undefined, ctx: C): Promise<void> {
        for (const a of actions ?? []) await this.def.actions![a]!(ctx);
    }

    private validateConfig(): void {
        const { model, guards, actions } = this.def;
        const needAction = (name: string, where: string): void => {
            if (!actions?.[name]) throw invalid(`Action [${name}] is not provided for ${where}`);
        };
        for (const [stateName, state] of Object.entries(model)) {
            state.exit?.forEach((a) => needAction(a, `exit action in state [${stateName}]`));
            state.entry?.forEach((a) => needAction(a, `entry action in state [${stateName}]`));
            for (const [target, t] of Object.entries(state.on?.targets ?? {})) {
                if (target === stateName) {
                    throw invalid(`Target state [${target}] cannot be the same as current state [${stateName}]`);
                }
                if (!model[target]) throw invalid(`Target state [${target}] is not provided (from [${stateName}])`);
                if (t.guard && !guards?.[t.guard]) throw invalid(`Guard [${t.guard}] is not provided`);
                t.actions?.forEach((a) => needAction(a, `transition [${stateName}] -> [${target}]`));
            }
            for (const [event, list] of Object.entries(state.on?.events ?? {})) {
                for (const t of list) {
                    if (t.target === stateName) {
                        throw invalid(`Event [${event}] target cannot equal current state [${stateName}]`);
                    }
                    if (!model[t.target]) throw invalid(`Target state [${t.target}] is not provided (event [${event}])`);
                    if (t.guard && !guards?.[t.guard]) throw invalid(`Guard [${t.guard}] is not provided`);
                    t.actions?.forEach((a) => needAction(a, `event [${event}] in state [${stateName}]`));
                }
            }
        }
    }
}

/**
 * The original also declares simple lifecycles as flat rows
 * (`resources/enum_state_transitions_dir_name/enum_name_to_state_transition.json`):
 * `{ currentState, nextState }` where `null` means "does not exist yet / deleted".
 */
export interface TransitionRow {
    currentState: string | null;
    nextState: string | null;
}

export class TransitionTable {
    private readonly rows: TransitionRow[];
    private readonly entity: string;

    constructor(entity: string, rows: TransitionRow[]) {
        this.entity = entity;
        this.rows = rows;
    }

    allows(current: string | null, next: string | null): boolean {
        return this.rows.some((r) => r.currentState === current && r.nextState === next);
    }

    assert(current: string | null, next: string | null): void {
        if (current === next) return;
        if (!this.allows(current, next)) {
            throw invalid(
                `Invalid ${this.entity} state transition: [${current ?? 'none'}] -> [${next ?? 'deleted'}]`,
                'COMMON-INVALID_STATE_TRANSITION'
            );
        }
    }

    nextStates(current: string | null): string[] {
        return this.rows.filter((r) => r.currentState === current && r.nextState).map((r) => r.nextState!);
    }
}
