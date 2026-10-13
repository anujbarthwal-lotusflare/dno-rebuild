/**
 * HTTP layer on node:http: a small router, JSON handling, TMF error rendering,
 * and static serving of the portal. Portal sources are TypeScript; they are
 * type-stripped on the fly with Node's built-in stripper, so there is no build step.
 */
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import * as nodeModule from 'node:module';
import { DomainError } from './common/errors.ts';

export interface Request {
    method: string;
    path: string;
    params: Record<string, string>;
    query: URLSearchParams;
    body: unknown;
}
export type Handler = (req: Request) => Promise<unknown> | unknown;

interface Route {
    method: string;
    segments: string[];
    handler: Handler;
    status: number;
}

/** Return this from a handler to send a file (PDF, attachment) instead of JSON. */
export class FileResult {
    readonly filename: string;
    readonly contentType: string;
    readonly body: Buffer;
    readonly inline: boolean;
    constructor(filename: string, contentType: string, body: Buffer, inline = false) {
        this.filename = filename;
        this.contentType = contentType;
        this.body = body;
        this.inline = inline;
    }
}

/** Return this from a handler to control the status code. */
export class HttpResult {
    readonly status: number;
    readonly body: unknown;
    constructor(status: number, body: unknown) {
        this.status = status;
        this.body = body;
    }
}

export class Router {
    private readonly routes: Route[] = [];

    private add(method: string, path: string, handler: Handler, status: number): this {
        this.routes.push({ method, segments: path.split('/').filter(Boolean), handler, status });
        return this;
    }
    get(path: string, handler: Handler): this {
        return this.add('GET', path, handler, 200);
    }
    post(path: string, handler: Handler, status = 201): this {
        return this.add('POST', path, handler, status);
    }
    patch(path: string, handler: Handler): this {
        return this.add('PATCH', path, handler, 200);
    }
    put(path: string, handler: Handler): this {
        return this.add('PUT', path, handler, 200);
    }
    /** Register a route with an explicit method and success status. */
    route(method: string, path: string, handler: Handler, status: number): this {
        return this.add(method, path, handler, status);
    }
    delete(path: string, handler: Handler): this {
        return this.add('DELETE', path, handler, 204);
    }

    match(method: string, path: string): { route: Route; params: Record<string, string> } | 'methodNotAllowed' | undefined {
        const parts = path.split('/').filter(Boolean);
        let pathMatched = false;
        for (const route of this.routes) {
            if (route.segments.length !== parts.length) continue;
            const params: Record<string, string> = {};
            const ok = route.segments.every((seg, i) => {
                if (seg.startsWith(':')) {
                    params[seg.slice(1)] = decodeURIComponent(parts[i]!);
                    return true;
                }
                return seg === parts[i];
            });
            if (!ok) continue;
            pathMatched = true;
            if (route.method === method) return { route, params };
        }
        return pathMatched ? 'methodNotAllowed' : undefined;
    }
}

/** Large enough for agent-note attachments (5 MB each, base64). */
const MAX_BODY = 16_000_000;

async function readJson(req: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
        size += (chunk as Buffer).length;
        if (size > MAX_BODY) throw new DomainError('COMMON-PAYLOAD_TOO_LARGE', 'Request body too large', 413);
        chunks.push(chunk as Buffer);
    }
    if (!chunks.length) return undefined;
    const text = Buffer.concat(chunks).toString('utf8').trim();
    if (!text) return undefined;
    try {
        return JSON.parse(text);
    } catch {
        throw new DomainError('COMMON-INVALID_JSON', 'Request body is not valid JSON', 400);
    }
}

function send(res: ServerResponse, status: number, body: unknown): void {
    if (status === 204 || body === undefined) {
        res.writeHead(status === 200 ? 204 : status).end();
        return;
    }
    const text = JSON.stringify(body);
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }).end(text);
}

const MIME: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.ts': 'text/javascript; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.ttf': 'font/ttf',
    '.woff2': 'font/woff2',
    '.ico': 'image/x-icon',
};

const stripTypes = (nodeModule as unknown as { stripTypeScriptTypes?: (code: string) => string }).stripTypeScriptTypes;

async function serveStatic(root: string, urlPath: string, res: ServerResponse): Promise<boolean> {
    const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
    const file = normalize(join(root, rel));
    if (file !== root && !file.startsWith(root + sep)) return false; // no path traversal
    const type = MIME[extname(file)];
    if (!type) return false;
    let content: string | Buffer;
    try {
        content = await readFile(file);
    } catch {
        return false;
    }
    if (extname(file) === '.ts') {
        if (!stripTypes) {
            res.writeHead(500, { 'content-type': 'text/plain' }).end('This Node version cannot strip TypeScript types (need >= 22.13).');
            return true;
        }
        content = stripTypes(content.toString('utf8'));
    }
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' }).end(content);
    return true;
}

export function createHttpServer(router: Router, options: { portalDir?: string; log?: (line: string) => void } = {}): Server {
    return createServer((req, res) => {
        void (async () => {
            const url = new URL(req.url ?? '/', 'http://localhost');
            const method = (req.method ?? 'GET').toUpperCase();
            try {
                if (url.pathname.startsWith('/api/')) {
                    const m = router.match(method, url.pathname.slice(4));
                    if (m === 'methodNotAllowed') throw new DomainError('COMMON-METHOD_NOT_ALLOWED', `${method} is not allowed here`, 405);
                    if (!m) throw new DomainError('COMMON-NOT_FOUND', `No route for ${method} ${url.pathname}`, 404);
                    const body = method === 'GET' || method === 'DELETE' ? undefined : await readJson(req);
                    const result = await m.route.handler({ method, path: url.pathname, params: m.params, query: url.searchParams, body });
                    if (result instanceof FileResult) {
                        const disposition = `${result.inline ? 'inline' : 'attachment'}; filename="${result.filename.replace(/["\\\r\n]/g, '_')}"`;
                        res.writeHead(200, { 'content-type': result.contentType, 'content-disposition': disposition, 'cache-control': 'no-store' }).end(result.body);
                    } else if (result instanceof HttpResult) send(res, result.status, result.body);
                    else send(res, m.route.status, result);
                    return;
                }
                if (method === 'GET' && options.portalDir && (await serveStatic(options.portalDir, url.pathname, res))) return;
                throw new DomainError('COMMON-NOT_FOUND', `Not found: ${url.pathname}`, 404);
            } catch (e) {
                if (e instanceof DomainError) {
                    send(res, e.status, e.toJSON());
                } else {
                    options.log?.(`500 ${method} ${url.pathname}: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
                    send(res, 500, { '@type': 'Error', code: 'COMMON-INTERNAL_ERROR', reason: 'COMMON-INTERNAL_ERROR', message: 'Internal error', status: '500' });
                }
            }
        })();
    });
}
