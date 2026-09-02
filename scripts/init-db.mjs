/**
 * Database Initialization Script
 *
 * Creates the SQLite database file if it does not exist and runs any schema
 * migrations it has not seen. Safe to run repeatedly — migrations that already
 * ran are skipped. Run it before starting the application.
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { assertSchema, getSchemaVersion, LATEST_VERSION, migrate } from '../src/lib/migrations.mjs';

// Matches the application's own resolution, so a deployment or a test can put
// the database somewhere other than ./data and initialise it the same way.
const dbDirectory = path.resolve(process.env.PROMPT_BUILDER_DATA_DIR || path.join(process.cwd(), 'data'));
const dbPath = path.join(dbDirectory, 'prompt_builder.db');

// Ensure the data directory exists
if (!fs.existsSync(dbDirectory)) {
  fs.mkdirSync(dbDirectory, { recursive: true });
  console.log(`Created directory: ${dbDirectory}`);
} else {
  console.log(`Directory already exists: ${dbDirectory}`);
}

console.log(`Database path: ${dbPath}`);

// Opened inside the try below so an unreadable or corrupt file is reported
// the same way as any other initialisation failure.
let db;

try {
  db = new Database(dbPath);

  // Enable WAL mode for better concurrency (optional, but good practice)
  db.pragma('journal_mode = WAL');
  console.log('WAL mode enabled.');

  db.pragma('foreign_keys = ON');

  const { from, to, applied } = migrate(db);

  if (applied.length === 0) {
    console.log(`Schema already at version ${to}; nothing to migrate.`);
  } else {
    console.log(`Migrated schema from version ${from} to ${to}:`);
    applied.forEach(name => console.log(`  applied ${name}`));
  }

  assertSchema(db, dbPath);

  const version = getSchemaVersion(db);
  if (version !== LATEST_VERSION) {
    // A database stamped ahead of this build belongs to a newer version of the
    // app; say so rather than letting it fail later inside some query.
    console.warn(`Warning: schema version is ${version}, but this build expects ${LATEST_VERSION}.`);
  }

  console.log('Database initialization complete.');
} catch (error) {
  // Exit non-zero so callers — the Docker build and CI included — see the failure.
  console.error('Error initializing database:', error);
  process.exitCode = 1;
} finally {
  if (db) {
    db.close();
    console.log('Database connection closed.');
  }
}
