/**
 * Customer Care Suite and Customer 360 routes. The route table lives in the domain core
 * (backend/src/care/routes.ts) so the NestJS server and the dependency-free server expose
 * exactly the same API; this controller dispatches every /care and /customer360 request to it.
 */
import { All, Controller, Inject, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { App } from '../../backend/src/app.ts';
import { DomainError } from '../../backend/src/common/errors.ts';
import { FileResult, Router } from '../../backend/src/http.ts';
import { careRoutes } from '../../backend/src/care/routes.ts';
import { APP } from './core.module.ts';

@Controller()
export class CareController {
    private readonly router = new Router();

    constructor(@Inject(APP) app: App) {
        for (const route of careRoutes(app.care, app.customer360)) {
            this.router.route(route.method, route.path, (req) => route.handler({ params: req.params, query: req.query, body: req.body }), route.status ?? (route.method === 'POST' ? 201 : 200));
        }
    }

    @All(['care/*', 'customer360/*'])
    async dispatch(@Req() req: Request, @Res() res: Response): Promise<void> {
        const url = new URL(req.originalUrl, 'http://localhost');
        const path = url.pathname.replace(/^\/api/, '');
        const method = req.method.toUpperCase();
        const m = this.router.match(method, path);
        if (m === 'methodNotAllowed') throw new DomainError('COMMON-METHOD_NOT_ALLOWED', `${method} is not allowed here`, 405);
        if (!m) throw new DomainError('COMMON-NOT_FOUND', `No route for ${method} ${url.pathname}`, 404);
        const body = method === 'GET' || method === 'DELETE' ? undefined : req.body;
        const result = await m.route.handler({ method, path, params: m.params, query: url.searchParams, body });
        if (result instanceof FileResult) {
            res.status(200)
                .set({
                    'content-type': result.contentType,
                    'content-disposition': `${result.inline ? 'inline' : 'attachment'}; filename="${result.filename.replace(/["\\\r\n]/g, '_')}"`,
                    'cache-control': 'no-store',
                })
                .send(result.body);
            return;
        }
        if (result === undefined) {
            res.status(204).end();
            return;
        }
        res.status(m.route.status).json(result);
    }
}
