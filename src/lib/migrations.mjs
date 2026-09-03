/**
 * Schema migrations
 *
 * The schema version lives in SQLite's own `PRAGMA user_version`, so it can be
 * inspected with any SQLite client and needs no table of its own. Each migration
 * runs at most once, in order, inside a transaction.
 *
 * Written as .mjs so both the application (src/lib/db.ts) and the init script
 * (scripts/init-db.mjs) run exactly the same migrations.
 *
 * Adding a migration: append an entry with the next version number. Never edit
 * or renumber a released one — installations that already ran it will not run it
 * again. Keep each `apply` idempotent where it is cheap to do so, so a database
 * stamped by some other tool cannot leave the schema half-built.
 */

const createComponentLibraryTable = `
CREATE TABLE IF NOT EXISTS component_library (
    id TEXT PRIMARY KEY,
    parent_id TEXT,
    name TEXT NOT NULL,
    item_type TEXT NOT NULL CHECK(item_type IN ('folder', 'component')),
    content TEXT,
    component_type TEXT,
    is_expanded INTEGER DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (parent_id) REFERENCES component_library(id) ON DELETE CASCADE,
    CONSTRAINT check_item_specific_fields CHECK (
        (item_type = 'folder' AND content IS NULL AND component_type IS NULL) OR
        (item_type = 'component' AND content IS NOT NULL AND component_type IS NOT NULL)
    )
);
`;

const createPromptsTable = `
CREATE TABLE IF NOT EXISTS prompts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sections TEXT,
    variables TEXT,
    num INTEGER,
    description TEXT NOT NULL DEFAULT '',
    is_favourite INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
`;

const createAppConfigTable = `
CREATE TABLE IF NOT EXISTS app_config (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    settings_json TEXT,
    active_prompt_id TEXT,
    updated_at TEXT DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (active_prompt_id) REFERENCES prompts(id) ON DELETE SET NULL
);
`;

const createPromptWorkspacesTable = `
CREATE TABLE IF NOT EXISTS prompt_workspaces (
    prompt_id TEXT PRIMARY KEY,
    values_json TEXT NOT NULL DEFAULT '{}',
    section_overrides_json TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (prompt_id) REFERENCES prompts(id) ON DELETE CASCADE
);
`;

/** Tables every migrated database must have. */
export const REQUIRED_TABLES = ['component_library', 'prompts', 'app_config', 'prompt_workspaces'];

/**
 * Reports whether a table already has a column
 * @param {import('better-sqlite3').Database} database
 * @param {string} table
 * @param {string} column
 * @returns {boolean}
 */
const hasColumn = (database, table, column) =>
  database
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .some(info => info.name === column);

export const MIGRATIONS = [
  {
    version: 1,
    name: 'baseline schema',
    apply(database) {
      database.exec(createComponentLibraryTable);
      database.exec(createPromptsTable);
      database.exec(createAppConfigTable);
      database.exec(createPromptWorkspacesTable);
    },
  },
  {
    version: 2,
    name: 'component sibling order',
    apply(database) {
      // Databases created before the column exists get it here; the baseline
      // above already includes it, so this is a no-op on a fresh install.
      if (!hasColumn(database, 'component_library', 'sort_order')) {
        database.exec(
          'ALTER TABLE component_library ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0'
        );
      }
    },
  },
  {
    version: 3,
    name: 'working prompt state',
    apply(database) {
      // Working values used to live on the prompt itself, which made entering a
      // value an edit to the source. They move to their own table; prompts.variables
      // stays as the source's starting values for a fresh workspace.
      database.exec(createPromptWorkspacesTable);

      const promptsWithValues = database
        .prepare(
          "SELECT id, variables FROM prompts WHERE variables IS NOT NULL AND variables != '{}'"
        )
        .all();

      const insert = database.prepare(
        `INSERT INTO prompt_workspaces (prompt_id, values_json, section_overrides_json)
         VALUES (?, ?, '{}')
         ON CONFLICT(prompt_id) DO NOTHING`
      );

      promptsWithValues.forEach(prompt => insert.run(prompt.id, prompt.variables));
    },
  },
  {
    version: 4,
    name: 'clear working values copied off the source prompt',
    apply(database) {
      // Version 3 copied these into prompt_workspaces. Leaving the originals on
      // the prompt would mean clearing working values still left them behind in
      // the source. The column stays for the source defaults J4 will add.
      database.exec(
        `UPDATE prompts SET variables = '{}'
         WHERE id IN (SELECT prompt_id FROM prompt_workspaces)`
      );
    },
  },
  {
    version: 5,
    name: 'prompt description and favourite',
    apply(database) {
      // A library outgrows a row of tabs: a description says what a prompt is
      // for, and a favourite marks the ones reached for often.
      if (!hasColumn(database, 'prompts', 'description')) {
        database.exec("ALTER TABLE prompts ADD COLUMN description TEXT NOT NULL DEFAULT ''");
      }
      if (!hasColumn(database, 'prompts', 'is_favourite')) {
        database.exec('ALTER TABLE prompts ADD COLUMN is_favourite INTEGER NOT NULL DEFAULT 0');
      }
    },
  },
];

/** The version a fully migrated database reports. */
export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

/**
 * Reads the schema version recorded in the database
 * @param {import('better-sqlite3').Database} database
 * @returns {number}
 */
export const getSchemaVersion = database => database.pragma('user_version', { simple: true });

/**
 * Brings a database up to LATEST_VERSION
 * @param {import('better-sqlite3').Database} database
 * @returns {{ from: number, to: number, applied: string[] }} What ran, for logging
 */
export const migrate = database => {
  const from = getSchemaVersion(database);
  const applied = [];

  for (const migration of MIGRATIONS) {
    if (migration.version <= from) continue;

    // The version stamp is written in the same transaction as the change, so an
    // interrupted migration leaves neither behind.
    database.transaction(() => {
      migration.apply(database);
      database.pragma(`user_version = ${migration.version}`);
    })();

    applied.push(`${migration.version}: ${migration.name}`);
  }

  return { from, to: getSchemaVersion(database), applied };
};

/**
 * Throws when the schema is not usable, naming what is missing
 * @param {import('better-sqlite3').Database} database
 * @param {string} databasePath - Named in the error so the operator knows which file
 */
export const assertSchema = (database, databasePath) => {
  const presentTables = new Set(
    database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map(row => row.name)
  );

  const missingTables = REQUIRED_TABLES.filter(table => !presentTables.has(table));
  if (missingTables.length > 0) {
    throw new Error(
      `Database at ${databasePath} is missing the ${missingTables.join(', ')} table(s). ` +
        'Run "npm run db:init" before starting the application.'
    );
  }
};
