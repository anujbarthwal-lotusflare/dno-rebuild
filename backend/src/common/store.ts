/**
 * Document store.
 *
 * The original persists TMF entities as JSON documents (Postgres JSONB through the
 * "petal" data-access layer, plus Cassandra for the Lua services). The rebuild keeps
 * the same shape behind one small interface with two implementations:
 *   - MemoryStore: tests and throw-away runs
 *   - SqliteStore: durable single-file storage using Node's built-in node:sqlite
 * The interface is async so a Postgres implementation can be added without touching
 * any domain code.
 */
import { randomUUID } from 'node:crypto';
import { notFound } from './errors.ts';

export interface Entity {
    id: string;
    [key: string]: unknown;
}

export interface Collection<T extends { id: string }> {
    get(id: string): Promise<T | undefined>;
    /** Like get, but throws a 404 DomainError when missing. */
    require(id: string): Promise<T>;
    list(filter?: (doc: T) => boolean): Promise<T[]>;
    insert(doc: Omit<T, 'id'> & { id?: string }): Promise<T>;
    replace(doc: T): Promise<T>;
    delete(id: string): Promise<void>;
}

export interface Store {
    collection<T extends { id: string }>(name: string, label?: string): Collection<T>;
    close(): void;
}

const clone = <T>(x: T): T => structuredClone(x);

class MemoryCollection<T extends { id: string }> implements Collection<T> {
    private readonly docs = new Map<string, T>();
    private readonly label: string;

    constructor(label: string) {
        this.label = label;
    }

    async get(id: string): Promise<T | undefined> {
        const d = this.docs.get(id);
        return d ? clone(d) : undefined;
    }
    async require(id: string): Promise<T> {
        const d = await this.get(id);
        if (!d) throw notFound(this.label, id);
        return d;
    }
    async list(filter?: (doc: T) => boolean): Promise<T[]> {
        const all = [...this.docs.values()].map(clone);
        return filter ? all.filter(filter) : all;
    }
    async insert(doc: Omit<T, 'id'> & { id?: string }): Promise<T> {
        const withId = { ...clone(doc), id: doc.id ?? randomUUID() } as T;
        this.docs.set(withId.id, withId);
        return clone(withId);
    }
    async replace(doc: T): Promise<T> {
        if (!this.docs.has(doc.id)) throw notFound(this.label, doc.id);
        this.docs.set(doc.id, clone(doc));
        return clone(doc);
    }
    async delete(id: string): Promise<void> {
        if (!this.docs.delete(id)) throw notFound(this.label, id);
    }
}

export class MemoryStore implements Store {
    private readonly collections = new Map<string, MemoryCollection<{ id: string }>>();

    collection<T extends { id: string }>(name: string, label = name): Collection<T> {
        let c = this.collections.get(name);
        if (!c) {
            c = new MemoryCollection<{ id: string }>(label);
            this.collections.set(name, c);
        }
        return c as unknown as Collection<T>;
    }
    close(): void {}
}

/** Minimal structural type for node:sqlite so this file type-checks without @types. */
interface SqliteDb {
    exec(sql: string): void;
    prepare(sql: string): {
        get(...params: unknown[]): unknown;
        all(...params: unknown[]): unknown[];
        run(...params: unknown[]): unknown;
    };
    close(): void;
}

class SqliteCollection<T extends { id: string }> implements Collection<T> {
    private readonly db: SqliteDb;
    private readonly name: string;
    private readonly label: string;

    constructor(db: SqliteDb, name: string, label: string) {
        this.db = db;
        this.name = name;
        this.label = label;
    }

    async get(id: string): Promise<T | undefined> {
        const row = this.db.prepare('SELECT body FROM docs WHERE collection = ? AND id = ?').get(this.name, id) as
            | { body: string }
            | undefined;
        return row ? (JSON.parse(row.body) as T) : undefined;
    }
    async require(id: string): Promise<T> {
        const d = await this.get(id);
        if (!d) throw notFound(this.label, id);
        return d;
    }
    async list(filter?: (doc: T) => boolean): Promise<T[]> {
        const rows = this.db.prepare('SELECT body FROM docs WHERE collection = ? ORDER BY seq').all(this.name) as {
            body: string;
        }[];
        const all = rows.map((r) => JSON.parse(r.body) as T);
        return filter ? all.filter(filter) : all;
    }
    async insert(doc: Omit<T, 'id'> & { id?: string }): Promise<T> {
        const withId = { ...doc, id: doc.id ?? randomUUID() } as T;
        this.db
            .prepare('INSERT INTO docs (collection, id, body) VALUES (?, ?, ?)')
            .run(this.name, withId.id, JSON.stringify(withId));
        return clone(withId);
    }
    async replace(doc: T): Promise<T> {
        const res = this.db
            .prepare('UPDATE docs SET body = ? WHERE collection = ? AND id = ?')
            .run(JSON.stringify(doc), this.name, doc.id) as { changes: number | bigint };
        if (Number(res.changes) === 0) throw notFound(this.label, doc.id);
        return clone(doc);
    }
    async delete(id: string): Promise<void> {
        const res = this.db.prepare('DELETE FROM docs WHERE collection = ? AND id = ?').run(this.name, id) as {
            changes: number | bigint;
        };
        if (Number(res.changes) === 0) throw notFound(this.label, id);
    }
}

export class SqliteStore implements Store {
    private readonly db: SqliteDb;

    private constructor(db: SqliteDb) {
        this.db = db;
        db.exec(
            `CREATE TABLE IF NOT EXISTS docs (
                seq INTEGER PRIMARY KEY AUTOINCREMENT,
                collection TEXT NOT NULL,
                id TEXT NOT NULL,
                body TEXT NOT NULL,
                UNIQUE (collection, id)
            )`
        );
    }

    static async open(path: string): Promise<SqliteStore> {
        const sqlite = (await import('node:sqlite')) as unknown as { DatabaseSync: new (p: string) => SqliteDb };
        return new SqliteStore(new sqlite.DatabaseSync(path));
    }

    collection<T extends { id: string }>(name: string, label = name): Collection<T> {
        return new SqliteCollection<T>(this.db, name, label);
    }
    close(): void {
        this.db.close();
    }
}
