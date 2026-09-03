/**
 * API Route for Prompt Workspaces (List)
 *
 * A workspace is the working state for one prompt — the values entered for the
 * current use. It is deliberately not part of the prompt: filling in a variable
 * is using a prompt, not editing it.
 */
import { NextResponse } from 'next/server';
import { listWorkspaces } from '@/lib/repositories/workspacesRepository';
import { errorResponse } from '@/lib/apiValidation';

/**
 * GET /api/workspaces
 * Fetches the working state for every prompt that has any.
 */
export async function GET() {
    try {
        return NextResponse.json(listWorkspaces());
    } catch (error) {
        console.error('Error fetching workspaces:', error);
        return errorResponse('Failed to fetch working values', 500);
    }
}
