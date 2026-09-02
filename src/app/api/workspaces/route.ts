/**
 * API Route for Prompt Workspaces (List)
 *
 * A workspace is the working state for one prompt — the values entered for the
 * current use. It is deliberately not part of the prompt: filling in a variable
 * is using a prompt, not editing it.
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { errorResponse } from '@/lib/apiValidation';
import { toWorkspace, type WorkspaceRow } from '@/lib/workspaceRows';

/**
 * GET /api/workspaces
 * Fetches the working state for every prompt that has any.
 */
export async function GET() {
    try {
        const rows = db
            .prepare('SELECT prompt_id, values_json, section_overrides_json FROM prompt_workspaces')
            .all() as WorkspaceRow[];

        return NextResponse.json(rows.map(toWorkspace));
    } catch (error) {
        console.error('Error fetching workspaces:', error);
        return errorResponse('Failed to fetch working values', 500);
    }
}
