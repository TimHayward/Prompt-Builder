/**
 * API Route for Single Prompt (Read, Update, Delete)
 * Handles fetching, updating, and deleting a single prompt by its ID.
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { updatePromptRequestSchema } from '@/types/contracts';
import { toPrompt, type PromptRow } from '@/lib/promptRows';
import { errorResponse, parseRequestBody } from '@/lib/apiValidation';

interface RouteParams {
    // Next.js 15 hands route params to the handler as a promise.
    params: Promise<{ id: string }>;
}

/**
 * GET /api/prompts/[id]
 * Fetches a single prompt by its ID.
 */
export async function GET(request: Request, { params }: RouteParams) {
    const { id } = await params;

    try {
        // Use COALESCE to handle NULL values for variables column (for backward compatibility)
        const stmt = db.prepare(`
            SELECT id, name, sections, COALESCE(variables, '{}') as variables, num, created_at, updated_at 
            FROM prompts WHERE id = ?
        `);
        const row = stmt.get(id) as PromptRow | undefined;

        if (row) {
            return NextResponse.json(toPrompt(row));
        } else {
            return errorResponse('Prompt not found', 404);
        }
    } catch (error) {
        console.error(`Error fetching prompt ${id}:`, error);
        return errorResponse('Failed to fetch prompt', 500);
    }
}

/**
 * PUT /api/prompts/[id]
 * Updates an existing prompt by its ID.
 */
export async function PUT(request: Request, { params }: RouteParams) {
    const { id } = await params;

    try {
        // Validated before anything is read or written, so a malformed body
        // cannot leave the prompt half-updated.
        const parsed = await parseRequestBody(request, updatePromptRequestSchema);
        if (!parsed.ok) return parsed.response;

        const { name, sections, variables, num } = parsed.data;

        // Check if the prompt exists
        const checkStmt = db.prepare('SELECT id FROM prompts WHERE id = ?');
        const existingPrompt = checkStmt.get(id);
        if (!existingPrompt) {
            return errorResponse('Prompt not found', 404);
        }

        const currentTimestamp = new Date().toISOString();
        
        // Fetch current prompt data to merge if only partial data is sent
        const currentPromptStmt = db.prepare(`
            SELECT name, sections, COALESCE(variables, '{}') as variables, num FROM prompts WHERE id = ?
        `);
        const currentPromptData = currentPromptStmt.get(id) as { name: string; sections: string; variables: string; num: number | null };

        const updatedName = name ?? currentPromptData.name;
        const updatedSectionsJson = sections ? JSON.stringify(sections) : currentPromptData.sections;
        const updatedVariablesJson = variables ? JSON.stringify(variables) : currentPromptData.variables;
        const updatedNum = num ?? currentPromptData.num;

        const stmt = db.prepare(
            'UPDATE prompts SET name = ?, sections = ?, variables = ?, num = ?, updated_at = ? WHERE id = ?'
        );
        stmt.run(updatedName, updatedSectionsJson, updatedVariablesJson, updatedNum, currentTimestamp, id);

        // Retrieve the updated prompt to return it
        const updatedPromptStmt = db.prepare(`
            SELECT id, name, sections, COALESCE(variables, '{}') as variables, num, created_at, updated_at 
            FROM prompts WHERE id = ?
        `);
        const updatedPromptRaw = updatedPromptStmt.get(id) as PromptRow | undefined;

        if (!updatedPromptRaw) {
            // Should not happen if update was successful and ID is correct
            console.error(`Failed to retrieve updated prompt ${id} after update.`);
            return errorResponse('Failed to retrieve prompt after update', 500);
        }
        
        return NextResponse.json(toPrompt(updatedPromptRaw));

    } catch (error) {
        console.error(`Error updating prompt ${id}:`, error);
        return errorResponse('Failed to update prompt', 500);
    }
}

/**
 * DELETE /api/prompts/[id]
 * Deletes a prompt by its ID.
 */
export async function DELETE(request: Request, { params }: RouteParams) {
    const { id } = await params;

    try {

        // Check if the prompt exists
        const checkStmt = db.prepare('SELECT id FROM prompts WHERE id = ?');
        const existingPrompt = checkStmt.get(id);
        if (!existingPrompt) {
            return errorResponse('Prompt not found', 404);
        }

        // Before deleting, check if this prompt is the active_prompt_id in app_config
        // If so, set active_prompt_id to null
        const appConfigStmt = db.prepare('SELECT active_prompt_id FROM app_config WHERE id = 1');
        const appConfig = appConfigStmt.get() as { active_prompt_id?: string | null } | undefined;

        if (appConfig && appConfig.active_prompt_id === id) {
            const updateAppConfigStmt = db.prepare('UPDATE app_config SET active_prompt_id = NULL, updated_at = ? WHERE id = 1');
            updateAppConfigStmt.run(new Date().toISOString());
        }

        const stmt = db.prepare('DELETE FROM prompts WHERE id = ?');
        const result = stmt.run(id);

        if (result.changes > 0) {
            return NextResponse.json({ message: 'Prompt deleted successfully' });
        } else {
            // This case should ideally be caught by the checkStmt earlier
            return errorResponse('Prompt not found or already deleted', 404);
        }
    } catch (error) {
        console.error(`Error deleting prompt ${id}:`, error);
        return errorResponse('Failed to delete prompt', 500);
    }
}
