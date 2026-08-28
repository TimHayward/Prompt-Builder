/**
 * API Route for Component Library (List and Save)
 * Handles fetching all component/folder items and saving the client's tree.
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db'; // SQLite database instance
import { v4 as uuidv4 } from 'uuid';
import { FolderType, ComponentType, TreeNode } from '@/types';

/** One component_library row as the save path builds it. */
type LibraryRow = {
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
 * The save payload. `tree` is the client's whole tree; `deletedIds` are the
 * items the client actually removed. Anything absent from `tree` but not named
 * in `deletedIds` is left alone — that is what keeps components ingested by
 * another path from being wiped by a stale client snapshot.
 */
type SaveLibraryBody = {
    tree: FolderType[];
    deletedIds?: string[];
};

/**
 * GET /api/components
 * Fetches all items from the component_library table, in sibling order.
 */
export async function GET() {
    try {
        const stmt = db.prepare(
            `SELECT id, parent_id, name, item_type, content, component_type, is_expanded, sort_order, created_at, updated_at
             FROM component_library
             ORDER BY sort_order, created_at`
        );
        const components = stmt.all() as (FolderType | ComponentType)[];
        return NextResponse.json(components);
    } catch (error) {
        console.error('Error fetching components:', error);
        return NextResponse.json({ error: 'Failed to fetch components' }, { status: 500 });
    }
}

/**
 * Flattens the client's tree into rows, recording each node's position among
 * its siblings so ordering survives a reload.
 */
const flattenTree = (nodes: TreeNode[], parentId: string | null, rows: LibraryRow[]) => {
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

/**
 * POST /api/components
 * Saves the component library tree.
 *
 * Accepts either `{ tree, deletedIds }` or, for older clients, a bare array of
 * root folders. Rows are upserted and only explicitly deleted ids are removed.
 */
export async function POST(request: Request) {
    try {
        const body = await request.json() as SaveLibraryBody | FolderType[];

        const treeData = Array.isArray(body) ? body : body?.tree;
        const deletedIds = Array.isArray(body) ? [] : (body?.deletedIds ?? []);

        if (!Array.isArray(treeData)) {
            return NextResponse.json(
                { error: 'Request body must be an array of FolderType, or { tree, deletedIds }' },
                { status: 400 }
            );
        }

        if (!Array.isArray(deletedIds) || deletedIds.some(id => typeof id !== 'string')) {
            return NextResponse.json({ error: 'deletedIds must be an array of item ids' }, { status: 400 });
        }

        const rows: LibraryRow[] = [];
        treeData.forEach(rootNode => {
            if (rootNode.type === 'folder') {
                flattenTree([rootNode], null, rows); // Root nodes have no parent_id
            }
        });

        const currentTimestamp = new Date().toISOString();

        const upsertStmt = db.prepare(
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

        // Deletes the item and everything beneath it. Done explicitly rather than
        // relying on ON DELETE CASCADE, which needs a foreign_keys pragma.
        const deleteSubtreeStmt = db.prepare(
            `WITH RECURSIVE subtree(id) AS (
                SELECT id FROM component_library WHERE id = ?
                UNION ALL
                SELECT child.id FROM component_library child JOIN subtree ON child.parent_id = subtree.id
             )
             DELETE FROM component_library WHERE id IN (SELECT id FROM subtree)`
        );

        const saveLibrary = db.transaction((itemsToSave: LibraryRow[], idsToDelete: string[]) => {
            idsToDelete.forEach(id => deleteSubtreeStmt.run(id));
            itemsToSave.forEach(item => upsertStmt.run({ ...item, timestamp: currentTimestamp }));
        });

        try {
            saveLibrary(rows, deletedIds);
        } catch (dbError) {
            console.error('Database error during component/folder tree update:', dbError);
            return NextResponse.json({ error: 'Failed to update component/folder tree in database' }, { status: 500 });
        }

        // Return the saved library so the client can reconcile if it wants to.
        const newItemsStmt = db.prepare(
            `SELECT id, parent_id, name, item_type, content, component_type, is_expanded, sort_order, created_at, updated_at
             FROM component_library
             ORDER BY sort_order, created_at`
        );
        const newLibrary = newItemsStmt.all();

        return NextResponse.json(newLibrary, { status: 200 });

    } catch (error) {
        console.error('Error processing request for component/folder tree update:', error);
        if (error instanceof SyntaxError) {
            return NextResponse.json({ error: 'Invalid JSON format in request body' }, { status: 400 });
        }
        return NextResponse.json({ error: 'Failed to update component/folder tree' }, { status: 500 });
    }
}
