/**
 * API Route for Component Library (List and Save)
 * Handles fetching all component/folder items and saving the client's tree.
 */
import { NextResponse } from 'next/server';
import { saveLibraryRequestSchema } from '@/types/contracts';
import { listLibrary, saveLibraryTree } from '@/lib/repositories/componentsRepository';
import { errorResponse, parseRequestBody } from '@/lib/apiValidation';

/**
 * GET /api/components
 * Fetches all items from the component_library table, in sibling order.
 */
export async function GET() {
  try {
    return NextResponse.json(listLibrary());
  } catch (error) {
    console.error('Error fetching components:', error);
    return errorResponse('Failed to fetch components', 500);
  }
}

/**
 * POST /api/components
 * Saves the component library tree.
 *
 * Takes `{ tree, deletedIds }`: rows are upserted, and only the ids the client
 * says it deleted are removed. Anything absent from `tree` but not named in
 * `deletedIds` is left alone, so a stale client snapshot cannot wipe items that
 * another path added.
 */
export async function POST(request: Request) {
  try {
    const parsed = await parseRequestBody(request, saveLibraryRequestSchema);
    if (!parsed.ok) return parsed.response;

    try {
      saveLibraryTree(parsed.data.tree, parsed.data.deletedIds);
    } catch (dbError) {
      console.error('Database error during component/folder tree update:', dbError);
      return errorResponse('Failed to update component/folder tree in database', 500);
    }

    // Return the saved library so the client can reconcile if it wants to.
    return NextResponse.json(listLibrary(), { status: 200 });
  } catch (error) {
    console.error('Error processing request for component/folder tree update:', error);
    return errorResponse('Failed to update component/folder tree', 500);
  }
}
