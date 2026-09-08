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
    tags TEXT NOT NULL DEFAULT '[]',
    last_used_at TEXT,
    created_at TEXT DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
`;

const createAppConfigTable = `
CREATE TABLE IF NOT EXISTS app_config (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    settings_json TEXT,
    active_prompt_id TEXT,
    open_prompt_ids TEXT NOT NULL DEFAULT '[]',
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

const createPromptRevisionsTable = `
CREATE TABLE IF NOT EXISTS prompt_revisions (
    id TEXT PRIMARY KEY,
    prompt_id TEXT NOT NULL,
    name TEXT NOT NULL,
    sections TEXT NOT NULL,
    created_at TEXT DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (prompt_id) REFERENCES prompts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_prompt_revisions ON prompt_revisions(prompt_id, created_at DESC);
`;

const createComponentRevisionsTable = `
CREATE TABLE IF NOT EXISTS component_revisions (
    id TEXT PRIMARY KEY,
    component_id TEXT NOT NULL,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (component_id) REFERENCES component_library(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_component_revisions ON component_revisions(component_id, created_at DESC);
`;

const createFrameworksTable = `
CREATE TABLE IF NOT EXISTS frameworks (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
`;

/**
 * A framework component.
 *
 * The id is what a prompt section stores in its `type` column, so it is
 * immutable once seeded; the label beside it is the editable half. That
 * separation is the whole point — renaming or reordering a component can then
 * never orphan a section that references it.
 */
const createFrameworkComponentsTable = `
CREATE TABLE IF NOT EXISTS framework_components (
    id TEXT PRIMARY KEY,
    framework_id TEXT NOT NULL,
    label TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    example TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (framework_id) REFERENCES frameworks(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_framework_components
    ON framework_components(framework_id, sort_order);
`;

/**
 * The five frameworks as they stood when this migration was written.
 *
 * Inlined deliberately. This file is plain ESM, run by scripts/init-db.mjs
 * under bare node, so it cannot import the TypeScript registry — and it should
 * not want to: a migration that read live application constants would change
 * what it did retroactively every time those constants were edited. This is a
 * snapshot, and it stays one.
 */
const SEED_FRAMEWORKS = [
  {
    id: 'standard',
    label: 'Standard',
    components: [
      ['role', 'Role'],
      ['instruction', 'Instruction'],
      ['context', 'Context'],
      ['format', 'Format'],
      ['style', 'Style'],
    ],
  },
  {
    id: 'rctcso',
    label: 'R-C-T-C-S-O',
    components: [
      ['role', 'Role'],
      ['context', 'Context'],
      ['task', 'Task'],
      ['constraints', 'Constraints'],
      ['style', 'Style'],
      ['output', 'Output'],
    ],
  },
  {
    id: 'gcse',
    label: 'GCSE',
    components: [
      ['goal', 'Goal'],
      ['context', 'Context'],
      ['source', 'Source'],
      ['expectations', 'Expectations'],
    ],
  },
  {
    id: 'rise',
    label: 'RISE',
    components: [
      ['role', 'Role'],
      ['input', 'Input'],
      ['steps', 'Steps'],
      ['expectation', 'Expectation'],
    ],
  },
  {
    id: 'risen',
    label: 'RISEN',
    components: [
      ['role', 'Role'],
      ['instructions', 'Instructions'],
      ['steps', 'Steps'],
      ['end-goal', 'End Goal'],
      ['narrowing', 'Narrowing'],
    ],
  },
];

/** Tables every migrated database must have. */
export const REQUIRED_TABLES = [
  'component_library',
  'prompts',
  'app_config',
  'prompt_workspaces',
  'prompt_revisions',
  'component_revisions',
  'frameworks',
  'framework_components',
];

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
      database.exec(createPromptRevisionsTable);
      database.exec(createComponentRevisionsTable);
      database.exec(createFrameworksTable);
      database.exec(createFrameworkComponentsTable);
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
  {
    version: 6,
    name: 'prompt tags and last use',
    apply(database) {
      // Tags group a library across the order the tabs happen to be in, and the
      // last use is what makes "the one I reached for yesterday" findable.
      if (!hasColumn(database, 'prompts', 'tags')) {
        database.exec("ALTER TABLE prompts ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'");
      }
      if (!hasColumn(database, 'prompts', 'last_used_at')) {
        database.exec('ALTER TABLE prompts ADD COLUMN last_used_at TEXT');
      }
    },
  },
  {
    version: 7,
    name: 'revision history',
    apply(database) {
      // A deliberate edit to a prompt or a component leaves the previous text
      // recoverable. Each table cascades from what it is the history of, so a
      // deleted prompt takes its revisions with it.
      database.exec(createPromptRevisionsTable);
      database.exec(createComponentRevisionsTable);
    },
  },
  {
    version: 8,
    name: 'open prompt tabs',
    apply(database) {
      // Tabs used to be the whole library, so closing one had to delete the
      // prompt. The open set becomes its own thing, and is remembered here so a
      // restart restores the tabs rather than every prompt that exists.
      //
      // A JSON array cannot carry the ON DELETE SET NULL that active_prompt_id
      // has, so settingsRepository drops ids with no prompt on read and write.
      if (!hasColumn(database, 'app_config', 'open_prompt_ids')) {
        database.exec(
          "ALTER TABLE app_config ADD COLUMN open_prompt_ids TEXT NOT NULL DEFAULT '[]'"
        );
      }

      // The prompt that was open is the one tab worth restoring for a database
      // migrating in; anything else would reopen the whole library at once.
      database.exec(
        `UPDATE app_config
         SET open_prompt_ids = JSON_ARRAY(active_prompt_id)
         WHERE active_prompt_id IS NOT NULL AND open_prompt_ids = '[]'`
      );
    },
  },
  {
    version: 9,
    name: 'frameworks as data',
    apply(database) {
      // Frameworks were a const array in the source, so nobody could add one,
      // rename one or reorder its components without editing TypeScript. They
      // become rows here, seeded so an existing installation keeps the five it
      // already has, under the ids its prompts already store.
      database.exec(createFrameworksTable);
      database.exec(createFrameworkComponentsTable);

      // Idempotent beyond the version stamp: a database seeded by some other
      // route must not gain a second copy of everything.
      const { count } = database.prepare('SELECT COUNT(*) AS count FROM frameworks').get();
      if (count > 0) return;

      const addFramework = database.prepare(
        `INSERT INTO frameworks (id, label, description, sort_order)
         VALUES (?, ?, '', ?)`
      );
      const addComponent = database.prepare(
        `INSERT INTO framework_components
           (id, framework_id, label, description, example, sort_order)
         VALUES (?, ?, ?, '', '', ?)
         ON CONFLICT(id) DO NOTHING`
      );

      SEED_FRAMEWORKS.forEach((framework, order) => {
        addFramework.run(framework.id, framework.label, order);
        framework.components.forEach(([id, label], componentOrder) => {
          // A type key belongs to several frameworks — role is in four of them
          // — and the id is the primary key, so the first framework to claim it
          // owns the row. Which frameworks a type appears in is derived from
          // membership, exactly as getFrameworkForType already derives it.
          addComponent.run(id, framework.id, label, componentOrder);
        });
      });
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
