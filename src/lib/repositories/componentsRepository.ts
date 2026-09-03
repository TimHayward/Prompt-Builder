/**
 * Component library repository
 *
 * Owns the component_library table: the tree save, the single-item edits, and
 * the ingest route's folder rebuild. The save is the interesting one — it
 * upserts and deletes only what the client says it deleted, which is what stops
 * a stale snapshot from wiping items another path added.
 */

import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/db';
import { toComponentResponse, type ComponentResponse, type ComponentRow } from '@/lib/promptRows';
import type { FolderType, TreeNode } from '@/types';

/** A row as the save path builds it. */
export type LibraryRow = {
  id: string;
  parent_id: string | null;
  name: string;
  item_type: 'folder' | 'component';
  content: string | null;
  component_type: string | null;
  is_expanded: number | null;
  sort_order: number;
};

const SELECT_COLUMNS = `
    SELECT id, parent_id, name, item_type, content, component_type, is_expanded, sort_order, created_at, updated_at
    FROM component_library
`;

/** Every item, in sibling order, as the sidebar rebuilds its tree from. */
export const listLibrary = () =>
  db.prepare(`${SELECT_COLUMNS} ORDER BY sort_order, created_at`).all();

export const getLibraryItem = (id: string): ComponentResponse | undefined => {
  const row = db
    .prepare(
      'SELECT id, parent_id, name, item_type, content, component_type, is_expanded, created_at, updated_at FROM component_library WHERE id = ?'
    )
    .get(id) as ComponentRow | undefined;

  return row ? toComponentResponse(row) : undefined;
};

export const getItemType = (id: string): string | undefined =>
  (
    db.prepare('SELECT item_type FROM component_library WHERE id = ?').get(id) as
      { item_type: string } | undefined
  )?.item_type;

export const libraryItemExists = (id: string): boolean =>
  db.prepare('SELECT id FROM component_library WHERE id = ?').get(id) !== undefined;

/**
 * Flattens the client's tree into rows, recording each node's position among
 * its siblings so ordering survives a reload.
 */
export const flattenTree = (nodes: TreeNode[], parentId: string | null, rows: LibraryRow[]) => {
  nodes.forEach((node, index) => {
    const row: LibraryRow = {
      id: node.id || uuidv4(), // Ensure ID exists, generate if not (should be provided by client)
      parent_id: parentId,
      name: node.name,
      item_type: node.type,
      content: null,
      component_type: null,
      is_expanded: null,
      sort_order: index,
    };

    if (node.type === 'folder') {
      row.is_expanded = node.expanded ? 1 : 0; // SQLite stores boolean as 0 or 1
      rows.push(row);
      if (node.children && node.children.length > 0) {
        flattenTree(node.children, row.id, rows);
      }
    } else if (node.type === 'component') {
      row.content = node.content;
      row.component_type = node.componentType;
      rows.push(row);
    }
  });
};

const upsertStatement = () =>
  db.prepare(
    `INSERT INTO component_library
        (id, parent_id, name, item_type, content, component_type, is_expanded, sort_order, created_at, updated_at)
     VALUES (@id, @parent_id, @name, @item_type, @content, @component_type, @is_expanded, @sort_order, @timestamp, @timestamp)
     ON CONFLICT(id) DO UPDATE SET
        parent_id = excluded.parent_id,
        name = excluded.name,
        item_type = excluded.item_type,
        content = excluded.content,
        component_type = excluded.component_type,
        is_expanded = excluded.is_expanded,
        sort_order = excluded.sort_order,
        updated_at = excluded.updated_at`
  );

// Deletes the item and everything beneath it. Kept explicit rather than leaning
// on ON DELETE CASCADE so a connection opened without the foreign_keys pragma
// still cannot orphan rows.
const deleteSubtreeStatement = () =>
  db.prepare(
    `WITH RECURSIVE subtree(id) AS (
        SELECT id FROM component_library WHERE id = ?
        UNION ALL
        SELECT child.id FROM component_library child JOIN subtree ON child.parent_id = subtree.id
     )
     DELETE FROM component_library WHERE id IN (SELECT id FROM subtree)`
  );

/**
 * Saves the client's tree
 * @param tree - The whole tree as the client holds it
 * @param deletedIds - Only these are removed; anything merely absent is left alone
 */
export const saveLibraryTree = (tree: FolderType[], deletedIds: string[]) => {
  const rows: LibraryRow[] = [];
  tree.forEach(rootNode => {
    if (rootNode.type === 'folder') {
      flattenTree([rootNode], null, rows); // Root nodes have no parent_id
    }
  });

  const timestamp = new Date().toISOString();
  const upsert = upsertStatement();
  const deleteSubtree = deleteSubtreeStatement();

  const save = db.transaction(() => {
    deletedIds.forEach(id => deleteSubtree.run(id));
    rows.forEach(row => upsert.run({ ...row, timestamp }));
  });

  save();
};

/**
 * Applies a partial update to one item
 * @param id - The item to update
 * @param updates - Column names mapped to their new values
 * @returns The updated item, or undefined when nothing was changed
 */
export const updateLibraryItem = (
  id: string,
  updates: { column: string; value: unknown }[]
): ComponentResponse | undefined => {
  if (updates.length === 0) return undefined;

  const assignments = updates.map(update => `${update.column} = ?`).join(', ');
  const values = updates.map(update => update.value);

  db.prepare(`UPDATE component_library SET ${assignments}, updated_at = ? WHERE id = ?`).run(
    ...values,
    new Date().toISOString(),
    id
  );

  return getLibraryItem(id);
};

/** Deletes one item; its descendants go with it via the cascade. */
export const deleteLibraryItem = (id: string): boolean =>
  db.prepare('DELETE FROM component_library WHERE id = ?').run(id).changes > 0;

/** The root folder of that name, for the ingest route's upsert-by-name. */
export const findRootFolderByName = (name: string): { id: string } | undefined =>
  db
    .prepare(
      "SELECT id FROM component_library WHERE name = ? AND item_type = 'folder' AND parent_id IS NULL"
    )
    .get(name) as { id: string } | undefined;

/**
 * Rebuilds a folder's contents from an ingested document
 * @param folderName - The prompt's name, which the folder shares
 * @param components - One component per section
 */
export const replaceIngestedFolder = (
  folderName: string,
  components: { name: string; content: string; type: string }[]
) => {
  const now = new Date().toISOString();
  const existing = findRootFolderByName(folderName);

  let folderId: string;
  if (existing) {
    // Remove old children so they are rebuilt fresh from the current markdown
    db.prepare('DELETE FROM component_library WHERE parent_id = ?').run(existing.id);
    db.prepare('UPDATE component_library SET updated_at = ? WHERE id = ?').run(now, existing.id);
    folderId = existing.id;
  } else {
    folderId = uuidv4();
    db.prepare(
      'INSERT INTO component_library (id, parent_id, name, item_type, content, component_type, is_expanded, created_at, updated_at) VALUES (?, NULL, ?, ?, NULL, NULL, 1, ?, ?)'
    ).run(folderId, folderName, 'folder', now, now);
  }

  const insertComponent = db.prepare(
    'INSERT INTO component_library (id, parent_id, name, item_type, content, component_type, is_expanded, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)'
  );

  components.forEach(component => {
    insertComponent.run(
      uuidv4(),
      folderId,
      component.name,
      'component',
      component.content,
      component.type,
      now,
      now
    );
  });
};
