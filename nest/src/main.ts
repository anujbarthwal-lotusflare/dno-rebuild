/**
 * NestJS entry point.
 *
 *   PORT       port to listen on (default 3000)
 *   HOST       interface to bind (default 127.0.0.1)
 *   DNO_DB     SQLite file (default ./data/dno.sqlite); ":memory:" for a throw-away run
 *   DNO_SEED   "0" to skip loading demo data into an empty database
 */
import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.ts';
import { PROJECT_ROOT } from './core.module.ts';

const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
// agent-note attachments travel as base64 JSON (5 MB per file)
app.useBodyParser('json', { limit: '16mb' });
app.setGlobalPrefix('api');
app.enableShutdownHooks();

// the built Vue portal, when present
const portal = resolve(PROJECT_ROOT, 'portal-vue', 'dist');
const log = new Logger('Main');
if (existsSync(portal)) app.useStaticAssets(portal);
else log.warn('portal-vue/dist not found. Run "npm run build" to build the portal, or "npm run dev:portal" for the dev server.');

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';
await app.listen(port, host);
log.log(`DNO rebuild (NestJS) listening on http://${host}:${port}`);
