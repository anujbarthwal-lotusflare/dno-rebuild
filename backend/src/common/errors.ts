/**
 * TMF-style error (the original throws `TMFStandardException(code, message, status)`
 * and renders `{ code, reason, message, status }`).
 */
export class DomainError extends Error {
    readonly code: string;
    readonly status: number;
    readonly details?: unknown;

    constructor(code: string, message: string, status = 400, details?: unknown) {
        super(message);
        this.name = 'DomainError';
        this.code = code;
        this.status = status;
        this.details = details;
    }

    toJSON(): Record<string, unknown> {
        return {
            '@type': 'Error',
            code: this.code,
            reason: this.code,
            message: this.message,
            status: String(this.status),
            ...(this.details === undefined ? {} : { details: this.details }),
        };
    }
}

export const invalid = (message: string, code = 'COMMON-INVALID_REQUEST', details?: unknown): DomainError =>
    new DomainError(code, message, 400, details);

export const notFound = (what: string, id: string): DomainError =>
    new DomainError('COMMON-NOT_FOUND', `${what} with id ${id} not found`, 404);

export const notAllowed = (message: string, code = 'COMMON-OPERATION_NOT_ALLOWED'): DomainError =>
    new DomainError(code, message, 409);
