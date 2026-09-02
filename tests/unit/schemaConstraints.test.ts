/**
 * The schema declares ON DELETE CASCADE and ON DELETE SET NULL, both of which
 * SQLite ignores unless foreign_keys is on for the connection. These cover that
 * the pragma the app sets actually makes them fire.
 */
import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '@/lib/migrations.mjs';

let db: Database.Database;

const insertFolder = (id: string, parentId: string | null) =>
  db
    .prepare(
      `INSERT INTO component_library (id, parent_id, name, item_type, content, component_type)
       VALUES (?, ?, ?, 'folder', NULL, NULL)`
    )
    .run(id, parentId, id);

const insertComponent = (id: string, parentId: string) =>
  db
    .prepare(
      `INSERT INTO component_library (id, parent_id, name, item_type, content, component_type)
       VALUES (?, ?, ?, 'component', 'body', 'instruction')`
    )
    .run(id, parentId, id);

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);
});

describe('component_library cascade', () => {
  it('deletes a folder\'s descendants with it', () => {
    insertFolder('root', null);
    insertFolder('child-folder', 'root');
    insertComponent('grandchild', 'child-folder');

    db.prepare('DELETE FROM component_library WHERE id = ?').run('root');

    expect(db.prepare('SELECT COUNT(*) AS count FROM component_library').get()).toEqual({ count: 0 });
  });

  it('refuses a parent_id that does not exist', () => {
    expect(() => insertComponent('orphan', 'missing-folder')).toThrowError(/FOREIGN KEY/i);
  });
});

describe('app_config.active_prompt_id', () => {
  it('is cleared when the prompt it points at is deleted', () => {
    db.prepare("INSERT INTO prompts (id, name, sections) VALUES ('p1', 'One', '[]')").run();
    db.prepare("INSERT INTO app_config (id, settings_json, active_prompt_id) VALUES (1, '{}', 'p1')").run();

    db.prepare('DELETE FROM prompts WHERE id = ?').run('p1');

    expect(db.prepare('SELECT active_prompt_id FROM app_config WHERE id = 1').get()).toEqual({
      active_prompt_id: null,
    });
  });
});
