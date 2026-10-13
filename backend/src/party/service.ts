/**
 * Party management (TMF632): individuals and organizations.
 *
 * Ported from ts-polaris `apps/partyManagement`:
 *  - status state machines (IndividualStateMachine / OrganizationStateMachine)
 *  - create/patch validators (the Post*Pipe / Patch*Interceptor classes)
 *  - state-change events emitted after a successful status change
 */
import type { Collection, Store } from '../common/store.ts';
import type { Clock, EventBus } from '../common/runtime.ts';
import { mergePatch } from '../common/runtime.ts';
import { StateMachine } from '../common/stateMachine.ts';
import { DomainError, invalid } from '../common/errors.ts';
import type { ContactMedium, CreditProfile, Individual, Organization, Party, TaxExemptionCertificate } from '../common/model.ts';

export const individualStateMachine = new StateMachine({
    id: 'partyManagement_individual_status',
    model: {
        initialized: { initial: true, on: { targets: { validated: {}, deceased: {} } } },
        validated: { on: { targets: { deceased: {} } } },
        deceased: {},
    },
});

export const organizationStateMachine = new StateMachine({
    id: 'partyManagement_organization_status',
    model: {
        initialized: { initial: true, on: { targets: { validated: {}, closed: {} } } },
        validated: { on: { targets: { closed: {} } } },
        closed: {},
    },
});

const partyError = (code: string, message: string): DomainError => new DomainError(`PARTY-${code}`, message, 400);

/** At most one preferred contact medium per contact-medium type. */
export function validateSinglePreferredContactMediumPerType(list: ContactMedium[] | undefined): void {
    const seen = new Set<string>();
    for (const cm of list ?? []) {
        if (!cm.preferred) continue;
        if (seen.has(cm['@type'])) {
            throw partyError(
                'MULTIPLE_PREFERRED_CONTACT_MEDIUM',
                `Only one preferred contact medium is allowed per type (${cm['@type']})`
            );
        }
        seen.add(cm['@type']);
    }
}

function validateCreditProfile(party: { creditProfile?: CreditProfile[] }): void {
    for (const cp of party.creditProfile ?? []) {
        if (Object.keys(cp).length === 0 || !cp.creditScore || !cp.creditProfileDate || !cp.creditRiskRating) {
            throw partyError(
                'INVALID_CREDIT_RATING',
                'Each credit profile needs creditScore, creditProfileDate and creditRiskRating'
            );
        }
    }
}

function validateTaxExemptionCertificates(party: { taxExemptionCertificate?: TaxExemptionCertificate[] }): void {
    for (const c of party.taxExemptionCertificate ?? []) {
        if (Object.keys(c).length === 0 || !c.certificateNumber) {
            throw partyError('TAX_EXEMPTION_CERTIFICATE_INVALID', 'Tax exemption certificate needs a certificateNumber');
        }
    }
}

export type CreateIndividual = Omit<Individual, 'id' | 'status' | '@type'> & { status?: string };
export type CreateOrganization = Omit<Organization, 'id' | 'status' | '@type'> & { status?: string };

export class PartyService {
    private readonly individuals: Collection<Individual>;
    private readonly organizations: Collection<Organization>;
    private readonly events: EventBus;
    private readonly clock: Clock;

    constructor(store: Store, events: EventBus, clock: Clock) {
        this.individuals = store.collection<Individual>('individual', 'Individual');
        this.organizations = store.collection<Organization>('organization', 'Organization');
        this.events = events;
        this.clock = clock;
    }

    /* ----- individuals ----- */

    listIndividuals(): Promise<Individual[]> {
        return this.individuals.list();
    }
    getIndividual(id: string): Promise<Individual> {
        return this.individuals.require(id);
    }

    async createIndividual(body: CreateIndividual): Promise<Individual> {
        if (!body.givenName?.trim() || !body.familyName?.trim()) {
            throw invalid('givenName and familyName are required');
        }
        validateSinglePreferredContactMediumPerType(body.contactMedium);
        validateCreditProfile(body);
        validateTaxExemptionCertificates(body);
        const status = await this.initStatus(individualStateMachine, body.status ?? 'initialized');
        const created = await this.individuals.insert({
            ...body,
            '@type': 'Individual',
            status: status as Individual['status'],
            lastUpdate: this.clock.now().toISOString(),
        });
        await this.events.publish('IndividualCreateEvent', { individual: created });
        return created;
    }

    async patchIndividual(id: string, patch: Partial<Individual>): Promise<Individual> {
        const current = await this.individuals.require(id);
        const merged = mergePatch(current, patch);
        merged.id = current.id;
        merged['@type'] = 'Individual';
        validateSinglePreferredContactMediumPerType(merged.contactMedium);
        validateCreditProfile(merged);
        validateTaxExemptionCertificates(merged);
        await this.transition(individualStateMachine, current.status, merged.status);
        merged.lastUpdate = this.clock.now().toISOString();
        const saved = await this.individuals.replace(merged);
        if (current.status !== saved.status) {
            await this.events.publish('IndividualStateChangeEvent', {
                entityId: id,
                previousState: current.status,
                newState: saved.status,
            });
        }
        return saved;
    }

    /* ----- organizations ----- */

    listOrganizations(): Promise<Organization[]> {
        return this.organizations.list();
    }
    getOrganization(id: string): Promise<Organization> {
        return this.organizations.require(id);
    }

    async createOrganization(body: CreateOrganization): Promise<Organization> {
        if (!body.name?.trim()) throw invalid('name is required');
        await this.validateOrganization(body, undefined);
        const status = await this.initStatus(organizationStateMachine, body.status ?? 'initialized');
        const created = await this.organizations.insert({
            ...body,
            '@type': 'Organization',
            status: status as Organization['status'],
            lastUpdate: this.clock.now().toISOString(),
        });
        await this.events.publish('OrganizationCreateEvent', { organization: created });
        return created;
    }

    async patchOrganization(id: string, patch: Partial<Organization>): Promise<Organization> {
        const current = await this.organizations.require(id);
        const merged = mergePatch(current, patch);
        merged.id = current.id;
        merged['@type'] = 'Organization';
        await this.validateOrganization(merged, id);
        await this.transition(organizationStateMachine, current.status, merged.status);
        merged.lastUpdate = this.clock.now().toISOString();
        const saved = await this.organizations.replace(merged);
        if (current.status !== saved.status) {
            await this.events.publish('OrganizationStateChangeEvent', {
                entityId: id,
                previousState: current.status,
                newState: saved.status,
            });
        }
        return saved;
    }

    private async validateOrganization(org: Omit<Partial<Organization>, 'status'>, selfId: string | undefined): Promise<void> {
        // PostOrganizationDepartmentNotLegalEntityPipe
        if (org.isLegalEntity && (org.organizationType ?? '').toLowerCase() === 'department') {
            throw partyError('DEPARTMENT_CANNOT_BE_LEGAL_ENTITY', 'A department cannot be a legal entity');
        }
        // PostOrganizationNoParentHeadOfficePipe
        if (org.organizationParentRelationship && org.isHeadOffice === true) {
            throw partyError(
                'HEAD_OFFICE_ORGANIZATION_CANNOT_HAVE_PARENT',
                'A head office organization cannot have a parent'
            );
        }
        // PatchOrganizationParentNotExistInterceptor
        const parentId = org.organizationParentRelationship?.organization?.id;
        if (parentId) {
            if (parentId === selfId) throw partyError('INVALID_PARENT', 'An organization cannot be its own parent');
            if (!(await this.organizations.get(parentId))) {
                throw partyError('PARENT_ORGANIZATION_NOT_FOUND', `Parent organization ${parentId} does not exist`);
            }
        }
        validateSinglePreferredContactMediumPerType(org.contactMedium);
        validateCreditProfile(org);
        validateTaxExemptionCertificates(org);
    }

    /* ----- shared ----- */

    /** Resolve a party of either kind; used by ordering and billing validation. */
    async findParty(id: string, referredType?: string): Promise<Party | undefined> {
        if (referredType === 'Organization') return this.organizations.get(id);
        if (referredType === 'Individual') return this.individuals.get(id);
        return (await this.individuals.get(id)) ?? (await this.organizations.get(id));
    }

    private async initStatus(machine: StateMachine, status: string): Promise<string> {
        try {
            return await machine.init(status, undefined);
        } catch (e) {
            throw invalid(`Invalid status transition: ${(e as Error).message}`, 'PARTY-VALIDATE_ERROR');
        }
    }

    private async transition(machine: StateMachine, from: string, to: string): Promise<void> {
        if (from === to) return;
        try {
            await machine.target(from, to, undefined);
        } catch (e) {
            throw invalid(`Invalid status transition: ${(e as Error).message}`, 'PARTY-VALIDATE_ERROR');
        }
    }
}
