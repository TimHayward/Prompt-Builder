/**
 * API route for one framework
 *
 * Deleting is the only operation here; creating and replacing go through the
 * collection route, which takes the whole framework in one body.
 */
import { NextResponse } from 'next/server';
import { deleteFramework } from '@/lib/repositories/frameworksRepository';
import { errorResponse } from '@/lib/apiValidation';

/**
 * DELETE /api/frameworks/:id
 *
 * Whether anything still uses the framework's components is decided by the
 * client, which is where the prompts and the library are already loaded. The
 * server would have to read both to answer it, and the answer would be the
 * same one.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    return deleteFramework(id)
      ? NextResponse.json({ message: 'Framework deleted successfully' })
      : errorResponse('Framework not found', 404);
  } catch (error) {
    console.error('Error deleting framework:', error);
    return errorResponse('Failed to delete the framework', 500);
  }
}
