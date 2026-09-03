// src/lib/db.ts
/**
 * SQLite Database Connection
 *
 * Opens the better-sqlite3 connection on first use rather than at import, so
 * importing a route (as `next build` does when it collects page data) never
 * touches the database. The first query is what opens it, migrates it, and
 * fails loudly if it is missing or unusable.
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { assertSchema, migrate } from './migrations.mjs';

/**
 * Where the database lives. Resolved on first use rather than at import so a
 * caller — a test, or a deployment that keeps its data elsewhere — can point
 * PROMPT_BUILDER_DATA_DIR somewhere else without racing module loading.
 */
export const resolveDatabasePath = (): { directory: string; file: string } => {
  const directory = path.resolve(process.env.PROMPT_BUILDER_DATA_DIR || path.join(process.cwd(), 'data'));
  return { directory, file: path.join(directory, 'prompt_builder.db') };
};

let dbInstance: Database.Database | null = null;

const openDatabase = (): Database.Database => {
  if (dbInstance) return dbInstance;

  const { directory: dbDirectory, file: dbPath } = resolveDatabasePath();

  try {
    // The init script normally creates this; recreate it for robustness.
    if (!fs.existsSync(dbDirectory)) {
      fs.mkdirSync(dbDirectory, { recursive: true });
    }

    const database = new Database(dbPath);
    // Enable WAL mode for better concurrency
    database.pragma('journal_mode = WAL');
    // Off by default in SQLite, so the cascades and SET NULL the schema declares
    // would otherwise be inert. Must be set outside a transaction.
    database.pragma('foreign_keys = ON');

    const { applied } = migrate(database);
    if (applied.length > 0) {
      console.log(`Applied database migrations — ${applied.join('; ')}`);
    }
    assertSchema(database, dbPath);

    dbInstance = database;
    return database;
  } catch (error) {
    // Nothing downstream can work without the database, so surface the reason
    // and let the failure propagate instead of serving against a broken file.
    console.error(`Failed to open the SQLite database at ${dbPath}:`, error);
    throw error;
  }
};

/**
 * Runs work inside one transaction
 *
 * Lets a caller group repository calls atomically without reaching for the
 * connection itself — the transaction boundary is the caller's decision, the
 * database handle is not its business.
 *
 * @param work - Called once; its result is returned
 */
export const runInTransaction = <T>(work: () => T): T => openDatabase().transaction(work)();

/** Closes the connection so the next query opens the database afresh. */
export const closeDatabase = (): void => {
  dbInstance?.close();
  dbInstance = null;
};

/**
 * The database handle. Behaves like a better-sqlite3 instance; the connection
 * is established on the first property access.
 */
export const db = new Proxy({} as Database.Database, {
  get(_target, property) {
    const database = openDatabase();
    const value = Reflect.get(database, property, database);
    return typeof value === 'function' ? value.bind(database) : value;
  },
});
