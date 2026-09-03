/**
 * Backup repository
 *
 * Reads the whole library out as one document, and puts one back. The restore
 * replaces what is there: a backup is a picture of a library at a moment, and
 * merging two libraries would need answers about colliding ids that a restore
 * has no way to ask.
 */

import { db, runInTransaction } from '@/lib/db';
import { LATEST_VERSION } from '@/lib/migrations.mjs';
import { toPrompt, type PromptRow } from '@/lib/promptRows';
import {
  BACKUP_FORMAT_VERSION,
  type Backup,
  type BackupComponent,
  type BackupPrompt,
} from '@/domain/backup';
import type { StoredSection } from '@/types';
import type { Settings } from '@/types';

/** A component_library row as the export reads it. */
type ExportComponentRow = {
  id: string;
  parent_id: string | null;
  name: string;
  item_type: 'folder' | 'component';
  content: string | null;
  component_type: string | null;
  is_expanded: number | null;
  sort_order: number;
};

/**
 * The whole library as one document
 *
 * Working values are not read: they belong to a use of a prompt, not to the
 * library, and restoring them onto another installation would be meaningless.
 */
export const exportLibrary = (): Backup => {
  const promptRows = db
    .prepare(
      `SELECT id, name, sections, COALESCE(variables, '{}') as variables, num,
              description, is_favourite, tags, last_used_at, created_at, updated_at
         FROM prompts ORDER BY num IS NULL, num, created_at, id`
    )
    .all() as PromptRow[];

  const prompts: BackupPrompt[] = promptRows.map(row => {
    const prompt = toPrompt(row);

    return {
      id: prompt.id,
      num: prompt.num,
      name: prompt.name,
      description: prompt.description,
      isFavourite: prompt.isFavourite,
      tags: prompt.tags,
      lastUsedAt: prompt.lastUsedAt,
      // Variable definitions travel inside the section text, so exporting the
      // sections exports them.
      sections: prompt.sections as StoredSection[],
    };
  });

  const componentRows = db
    .prepare(
      `SELECT id, parent_id, name, item_type, content, component_type, is_expanded, sort_order
         FROM component_library ORDER BY sort_order, created_at`
    )
    .all() as ExportComponentRow[];

  const components: BackupComponent[] = componentRows.map(row => ({
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    itemType: row.item_type,
    content: row.content,
    componentType: row.component_type,
    expanded: row.is_expanded === 1,
    sortOrder: row.sort_order,
  }));

  const configRow = db.prepare('SELECT settings_json FROM app_config WHERE id = 1').get() as
    { settings_json: string | null } | undefined;

  let settings: Settings | null = null;
  try {
    settings = configRow?.settings_json ? (JSON.parse(configRow.settings_json) as Settings) : null;
  } catch {
    // A corrupt settings blob should not stop someone backing up their prompts.
    settings = null;
  }

  return {
    schemaVersion: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    databaseVersion: LATEST_VERSION,
    prompts,
    components,
    settings,
  };
};

/** What a restore replaced, so the caller can say what happened. */
export type RestoreSummary = { prompts: number; components: number };

/**
 * Replaces the library with the contents of a backup
 *
 * All of it happens in one transaction: a restore that failed halfway would
 * leave neither the old library nor the new one.
 *
 * @param backup - A backup already read and migrated to the current shape
 * @returns How much was written
 */
export const importLibrary = (backup: Backup): RestoreSummary => {
  const now = new Date().toISOString();

  return runInTransaction(() => {
    // app_config.active_prompt_id references prompts, so it is cleared before
    // the rows it points at are removed.
    db.prepare('UPDATE app_config SET active_prompt_id = NULL WHERE id = 1').run();
    db.prepare('DELETE FROM prompt_workspaces').run();
    db.prepare('DELETE FROM prompts').run();
    db.prepare('DELETE FROM component_library').run();

    const insertPrompt = db.prepare(
      `INSERT INTO prompts (id, name, description, is_favourite, tags, last_used_at, sections,
                            variables, num, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    backup.prompts.forEach(prompt => {
      insertPrompt.run(
        prompt.id,
        prompt.name,
        prompt.description,
        prompt.isFavourite ? 1 : 0,
        JSON.stringify(prompt.tags),
        prompt.lastUsedAt,
        JSON.stringify(prompt.sections),
        // Values belong to a use, not to the library: a restored prompt starts
        // unfilled.
        '{}',
        prompt.num,
        now,
        now
      );
    });

    const insertComponent = db.prepare(
      `INSERT INTO component_library (id, parent_id, name, item_type, content, component_type,
                                      is_expanded, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    // Parents before children: parent_id is a foreign key onto this table.
    orderByDepth(backup.components).forEach(item => {
      insertComponent.run(
        item.id,
        item.parentId,
        item.name,
        item.itemType,
        item.content,
        item.componentType,
        item.expanded ? 1 : 0,
        item.sortOrder,
        now,
        now
      );
    });

    if (backup.settings) {
      db.prepare('UPDATE app_config SET settings_json = ?, updated_at = ? WHERE id = 1').run(
        JSON.stringify(backup.settings),
        now
      );
    }

    return { prompts: backup.prompts.length, components: backup.components.length };
  });
};

/**
 * Orders items so every parent comes before its children
 *
 * A backup's order is the sibling order, which says nothing about depth, and a
 * child inserted first would fail the foreign key. Anything whose parent is
 * missing from the file is treated as a root rather than dropped, so a damaged
 * backup still restores what it can.
 *
 * @param components - The items as the backup lists them
 */
const orderByDepth = (components: BackupComponent[]): BackupComponent[] => {
  const byParent = new Map<string | null, BackupComponent[]>();
  const known = new Set(components.map(item => item.id));

  components.forEach(item => {
    const parent = item.parentId && known.has(item.parentId) ? item.parentId : null;
    byParent.set(parent, [...(byParent.get(parent) ?? []), { ...item, parentId: parent }]);
  });

  const ordered: BackupComponent[] = [];

  const take = (parent: string | null) => {
    (byParent.get(parent) ?? []).forEach(item => {
      ordered.push(item);
      take(item.id);
    });
  };

  take(null);

  return ordered;
};
