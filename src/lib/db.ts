// src/lib/db.ts
/**
 * SQLite Database Connection
 *
 * Opens the better-sqlite3 connection on first use rather than at import, so
 * importing a route (as `next build` does when it collects page data) never
 * touches the database. The first query is what opens it, and a database that
 * is missing or unusable fails loudly there.
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbDirectory = path.resolve(process.cwd(), 'data');
const dbPath = path.join(dbDirectory, 'prompt_builder.db');

/**
 * Fails loudly when the database is unusable rather than letting the app serve
 * requests against a half-initialised file.
 */
const assertSchema = (database: Database.Database) => {
  const requiredTables = ['component_library', 'prompts', 'app_config'];
  const presentTables = new Set(
    database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map(row => (row as { name: string }).name)
  );

  const missingTables = requiredTables.filter(table => !presentTables.has(table));
  if (missingTables.length > 0) {
    throw new Error(
      `Database at ${dbPath} is missing the ${missingTables.join(', ')} table(s). ` +
      'Run "npm run db:init" before starting the application.'
    );
  }

  // component_library.sort_order records sibling order. Older databases predate
  // it, so add it here rather than forcing a manual re-initialisation.
  const componentColumns = database
    .prepare('PRAGMA table_info(component_library)')
    .all()
    .map(column => (column as { name: string }).name);

  if (!componentColumns.includes('sort_order')) {
    database.exec('ALTER TABLE component_library ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0');
  }
};

let dbInstance: Database.Database | null = null;

const openDatabase = (): Database.Database => {
  if (dbInstance) return dbInstance;

  try {
    // The init script normally creates this; recreate it for robustness.
    if (!fs.existsSync(dbDirectory)) {
      fs.mkdirSync(dbDirectory, { recursive: true });
    }

    const database = new Database(dbPath);
    // Enable WAL mode for better concurrency
    database.pragma('journal_mode = WAL');
    assertSchema(database);

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
