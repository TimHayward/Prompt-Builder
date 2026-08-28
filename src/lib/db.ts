// src/lib/db.ts
/**
 * SQLite Database Connection
 * Initializes and exports the better-sqlite3 database instance.
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbDirectory = path.resolve(process.cwd(), 'data');
const dbPath = path.join(dbDirectory, 'prompt_builder.db');

// Ensure the data directory exists
// The init-db.mjs script should handle this, but it's good for robustness
if (!fs.existsSync(dbDirectory)) {
  fs.mkdirSync(dbDirectory, { recursive: true });
}

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

let dbInstance: Database.Database;

try {
  dbInstance = new Database(dbPath);
  // Enable WAL mode for better concurrency
  dbInstance.pragma('journal_mode = WAL');
  assertSchema(dbInstance);
} catch (error) {
  // Nothing downstream can work without the database, so surface the reason and
  // let the failure propagate instead of serving requests against a broken file.
  console.error(`Failed to open the SQLite database at ${dbPath}:`, error);
  throw error;
}

export const db = dbInstance;
