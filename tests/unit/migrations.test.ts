import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import {
  assertSchema,
  getSchemaVersion,
  LATEST_VERSION,
  migrate,
  REQUIRED_TABLES,
} from '@/lib/migrations.mjs';

/** An empty database, as a first install starts. */
const freshDatabase = () => new Database(':memory:');

/** Lists a table's column names. */
const columnsOf = (database: Database.Database, table: string) =>
  database
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map(column => (column as { name: string }).name);

/** Recreates the pre-migration schema: the old tables, unversioned. */
const legacyDatabase = () => {
  const database = new Database(':memory:');
  database.exec(`
    CREATE TABLE component_library (
      id TEXT PRIMARY KEY,
      parent_id TEXT,
      name TEXT NOT NULL,
      item_type TEXT NOT NULL CHECK(item_type IN ('folder', 'component')),
      content TEXT,
      component_type TEXT,
      is_expanded INTEGER DEFAULT 0,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE prompts (id TEXT PRIMARY KEY, name TEXT NOT NULL, sections TEXT, variables TEXT, num INTEGER, created_at TEXT, updated_at TEXT);
    CREATE TABLE app_config (id INTEGER PRIMARY KEY, settings_json TEXT, active_prompt_id TEXT, updated_at TEXT);
  `);
  return database;
};

describe('migrate', () => {
  it('brings a new installation to the current schema', () => {
    const database = freshDatabase();

    migrate(database);

    expect(getSchemaVersion(database)).toBe(LATEST_VERSION);
    const tables = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map(row => (row as { name: string }).name);
    REQUIRED_TABLES.forEach(table => expect(tables).toContain(table));
    expect(() => assertSchema(database, ':memory:')).not.toThrow();
  });

  it('runs each migration exactly once', () => {
    const database = freshDatabase();

    const first = migrate(database);
    const second = migrate(database);

    expect(first.applied.length).toBe(LATEST_VERSION);
    expect(second.applied).toEqual([]);
    expect(second.from).toBe(LATEST_VERSION);
  });

  it('migrates an existing installation without losing its rows', () => {
    const database = legacyDatabase();
    database
      .prepare("INSERT INTO prompts (id, name, sections) VALUES ('p1', 'Kept', '[]')")
      .run();
    expect(getSchemaVersion(database)).toBe(0);
    expect(columnsOf(database, 'component_library')).not.toContain('sort_order');

    const { from, to } = migrate(database);

    expect(from).toBe(0);
    expect(to).toBe(LATEST_VERSION);
    expect(columnsOf(database, 'component_library')).toContain('sort_order');
    expect(database.prepare('SELECT name FROM prompts').get()).toEqual({ name: 'Kept' });
  });

  it('reports the version through PRAGMA user_version, so any client can read it', () => {
    const database = freshDatabase();
    migrate(database);

    expect(database.pragma('user_version', { simple: true })).toBe(LATEST_VERSION);
  });
});

describe('assertSchema', () => {
  it('names the missing tables and points at the init script', () => {
    const database = freshDatabase();

    expect(() => assertSchema(database, '/tmp/x.db')).toThrowError(/component_library[\s\S]*npm run db:init/);
  });
});
