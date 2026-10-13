/**
 * Entry point: `node backend/src/main.ts`
 *
 *   PORT       port to listen on (default 3000)
 *   HOST       interface to bind (default 127.0.0.1)
 *   DNO_DB     SQLite file (default ./data/dno.sqlite); ":memory:" for a throw-away run
 *   DNO_SEED   "0" to skip loading demo data into an empty database
 */
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MemoryStore, SqliteStore } from './common/store.ts';
import type { Store } from './common/store.ts';
import { createApp } from './app.ts';
import { buildRouter } from './api.ts';
import { createHttpServer } from './http.ts';
import { seed } from './seed.ts';
import { layoutFilesFromEnv } from './care/layoutFiles.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';
const dbPath = process.env.DNO_DB ?? resolve(root, 'data', 'dno.sqlite');

let store: Store;
if (dbPath === ':memory:') {
    store = new MemoryStore();
} else {
    mkdirSync(dirname(dbPath), { recursive: true });
    store = await SqliteStore.open(dbPath);
}

const app = createApp({ store, layoutFiles: layoutFilesFromEnv(root, (l) => console.log(l)) });
if (process.env.DNO_SEED !== '0' && (await app.catalog.listOfferings()).length === 0 && (await app.parties.listIndividuals()).length === 0) {
    await seed(app);
    console.log('Loaded demo data.');
}
if (process.env.DNO_SEED !== '0') {
    if (await app.care.ensureSeeded()) console.log('Loaded Customer Care Suite demo data.');
    await app.customer360.ensureSeeded();
}

// the Vue portal when it has been built, otherwise the plain console
const vueDist = resolve(root, 'portal-vue', 'dist');
const portalDir = existsSync(vueDist) ? vueDist : resolve(root, 'portal');
const server = createHttpServer(buildRouter(app), { portalDir, log: (line) => console.error(line) });
server.listen(port, host, () => {
    console.log(`DNO rebuild listening on http://${host}:${port}  (db: ${dbPath})`);
});

const shutdown = (): void => {
    server.close(() => {
        store.close();
        process.exit(0);
    });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
