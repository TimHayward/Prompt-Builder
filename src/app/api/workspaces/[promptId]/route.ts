/**
 * API Route for one Prompt Workspace (Read, Update, Clear)
 *
 * Updates here never touch the prompt itself, which is the point: entering
 * working values must leave the source prompt — and the variable definitions
 * inside it — exactly as they were.
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { errorResponse, parseRequestBody } from '@/lib/apiValidation';
import { updateWorkspaceRequestSchema } from '@/types/contracts';
import { emptyWorkspaceRow, toWorkspace, type WorkspaceRow } from '@/lib/workspaceRows';

interface RouteParams {
    // Next.js 15 hands route params to the handler as a promise.
    params: Promise<{ promptId: string }>;
}

const selectWorkspace = (promptId: string): WorkspaceRow | undefined =>
    db
        .prepare('SELECT prompt_id, values_json, section_overrides_json FROM prompt_workspaces WHERE prompt_id = ?')
        .get(promptId) as WorkspaceRow | undefined;

/**
 * GET /api/workspaces/[promptId]
 * Fetches the working state for one prompt.
 */
export async function GET(request: Request, { params }: RouteParams) {
    const { promptId } = await params;

    try {
        return NextResponse.json(toWorkspace(selectWorkspace(promptId) ?? emptyWorkspaceRow(promptId)));
    } catch (error) {
        console.error(`Error fetching workspace ${promptId}:`, error);
        return errorResponse('Failed to fetch working values', 500);
    }
}

/**
 * PUT /api/workspaces/[promptId]
 * Replaces the working values, the section overrides, or both.
 */
export async function PUT(request: Request, { params }: RouteParams) {
    const { promptId } = await params;

    try {
        const parsed = await parseRequestBody(request, updateWorkspaceRequestSchema);
        if (!parsed.ok) return parsed.response;

        const promptExists = db.prepare('SELECT id FROM prompts WHERE id = ?').get(promptId);
        if (!promptExists) {
            return errorResponse('Prompt not found', 404);
        }

        const existing = selectWorkspace(promptId) ?? emptyWorkspaceRow(promptId);
        const valuesJson = parsed.data.values ? JSON.stringify(parsed.data.values) : existing.values_json;
        const overridesJson = parsed.data.sectionOverrides
            ? JSON.stringify(parsed.data.sectionOverrides)
            : existing.section_overrides_json;

        db.prepare(
            `INSERT INTO prompt_workspaces (prompt_id, values_json, section_overrides_json, updated_at)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(prompt_id) DO UPDATE SET
                values_json = excluded.values_json,
                section_overrides_json = excluded.section_overrides_json,
                updated_at = excluded.updated_at`
        ).run(promptId, valuesJson, overridesJson, new Date().toISOString());

        return NextResponse.json(
            toWorkspace({
                prompt_id: promptId,
                values_json: valuesJson,
                section_overrides_json: overridesJson,
            })
        );
    } catch (error) {
        console.error(`Error updating workspace ${promptId}:`, error);
        return errorResponse('Failed to save working values', 500);
    }
}

/**
 * DELETE /api/workspaces/[promptId]
 * Clears the working state, leaving the prompt untouched.
 */
export async function DELETE(request: Request, { params }: RouteParams) {
    const { promptId } = await params;

    try {
        db.prepare('DELETE FROM prompt_workspaces WHERE prompt_id = ?').run(promptId);
        return NextResponse.json(toWorkspace(emptyWorkspaceRow(promptId)));
    } catch (error) {
        console.error(`Error clearing workspace ${promptId}:`, error);
        return errorResponse('Failed to clear working values', 500);
    }
}
