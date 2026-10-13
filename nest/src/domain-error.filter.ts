/** Renders every error in the TMF error shape the original APIs use. */
import { Catch, HttpException, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { DomainError } from '../../backend/src/common/errors.ts';

const tmf = (status: number, code: string, message: string) => ({ '@type': 'Error', code, reason: code, message, status: String(status) });

@Catch()
export class DomainErrorFilter implements ExceptionFilter {
    private readonly logger = new Logger('Error');

    catch(error: unknown, host: ArgumentsHost): void {
        const res = host.switchToHttp().getResponse<Response>();
        if (error instanceof DomainError) {
            res.status(error.status).json(error.toJSON());
            return;
        }
        if (error instanceof HttpException) {
            const status = error.getStatus();
            const code = status === 404 ? 'COMMON-NOT_FOUND' : status === 405 ? 'COMMON-METHOD_NOT_ALLOWED' : status === 413 ? 'COMMON-PAYLOAD_TOO_LARGE' : 'COMMON-INVALID_REQUEST';
            res.status(status).json(tmf(status, code, error.message));
            return;
        }
        this.logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
        res.status(500).json(tmf(500, 'COMMON-INTERNAL_ERROR', 'Internal error'));
    }
}
