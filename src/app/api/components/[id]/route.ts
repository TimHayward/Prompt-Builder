/**
 * API Route for Single Component/Folder (Read, Update, Delete)
 * Handles fetching, updating, and deleting a single item from component_library by its ID.
 */
import { NextResponse } from 'next/server';
import { FolderType, ComponentType } from '@/types';
import {
    deleteLibraryItem,
    getItemType,
    getLibraryItem,
    libraryItemExists,
    updateLibraryItem,
} from '@/lib/repositories/componentsRepository';
import { errorResponse } from '@/lib/apiValidation';

interface RouteParams {
    // Next.js 15 hands route params to the handler as a promise.
    params: Promise<{ id: string }>;
}

/**
 * GET /api/components/[id]
 * Fetches a single component/folder by its ID.
 */
export async function GET(request: Request, { params }: RouteParams) {
    const { id } = await params;

    try {
        const item = getLibraryItem(id);
        return item ? NextResponse.json(item) : errorResponse('Item not found', 404);
    } catch (error) {
        console.error(`Error fetching item ${id}:`, error);
        return errorResponse('Failed to fetch item', 500);
    }
}

/**
 * PUT /api/components/[id]
 * Updates an existing component/folder by its ID.
 */
export async function PUT(request: Request, { params }: RouteParams) {
    const { id } = await params;

    try {
        const body = await request.json();
        const { name, parent_id, item_type, content, component_type, expanded } =
            body as Partial<FolderType & ComponentType & { expanded: boolean }>;

        const existingType = getItemType(id);
        if (!existingType) {
            return errorResponse('Item not found', 404);
        }

        // A folder and a component disagree about which columns may be set, so
        // the incoming body is checked against whichever type the item will be.
        const effectiveItemType = item_type ?? existingType;

        if (effectiveItemType === 'folder') {
            if ('content' in body && content !== null) {
                return errorResponse('Content must be null for folders', 400);
            }
            if ('component_type' in body && component_type !== null) {
                return errorResponse('Component type must be null for folders', 400);
            }
        } else {
            if ('content' in body && content === null) {
                return errorResponse('Content cannot be null for a component', 400);
            }
            if ('component_type' in body && component_type === null) {
                return errorResponse('Component type cannot be null for a component', 400);
            }
        }

        const updates: { column: string; value: unknown }[] = [];

        if (name !== undefined) updates.push({ column: 'name', value: name });
        if (parent_id !== undefined) updates.push({ column: 'parent_id', value: parent_id });
        if (item_type !== undefined) updates.push({ column: 'item_type', value: item_type });
        if (content !== undefined) {
            updates.push({ column: 'content', value: effectiveItemType === 'component' ? content : null });
        }
        if (component_type !== undefined) {
            updates.push({
                column: 'component_type',
                value: effectiveItemType === 'component' ? component_type : null,
            });
        }

        // is_expanded belongs to folders; a component always stores null.
        if (effectiveItemType === 'folder' && 'expanded' in body) {
            updates.push({ column: 'is_expanded', value: expanded ? 1 : 0 });
        } else if (effectiveItemType === 'component' && existingType !== 'component') {
            updates.push({ column: 'is_expanded', value: null });
        }

        if (updates.length === 0) {
            return errorResponse('No fields to update provided', 400);
        }

        const updated = updateLibraryItem(id, updates);

        return updated ? NextResponse.json(updated) : errorResponse('Failed to retrieve updated item', 500);
    } catch (error) {
        console.error(`Error updating item ${id}:`, error);
        return errorResponse('Failed to update item', 500);
    }
}

/**
 * DELETE /api/components/[id]
 * Deletes a component/folder by its ID. SQLite handles cascading deletes for children.
 */
export async function DELETE(request: Request, { params }: RouteParams) {
    const { id } = await params;

    try {
        if (!libraryItemExists(id)) {
            return errorResponse('Item not found', 404);
        }

        return deleteLibraryItem(id)
            ? NextResponse.json({ message: 'Item deleted successfully' })
            : errorResponse('Item not found or already deleted', 404);
    } catch (error) {
        console.error(`Error deleting item ${id}:`, error);
        return errorResponse('Failed to delete item', 500);
    }
}
