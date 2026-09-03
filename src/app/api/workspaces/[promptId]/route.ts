/**
 * API Route for one Prompt Workspace (Read, Update, Clear)
 *
 * Updates here never touch the prompt itself, which is the point: entering
 * working values must leave the source prompt — and the variable definitions
 * inside it — exactly as they were.
 */
import { NextResponse } from 'next/server';
import { updateWorkspaceRequestSchema } from '@/types/contracts';
import { clearWorkspace, getWorkspace, saveWorkspace } from '@/lib/repositories/workspacesRepository';
import { promptExists } from '@/lib/repositories/promptsRepository';
import { errorResponse, parseRequestBody } from '@/lib/apiValidation';

interface RouteParams {
    // Next.js 15 hands route params to the handler as a promise.
    params: Promise<{ promptId: string }>;
}

/**
 * GET /api/workspaces/[promptId]
 * Fetches the working state for one prompt.
 */
export async function GET(request: Request, { params }: RouteParams) {
    const { promptId } = await params;

    try {
        return NextResponse.json(getWorkspace(promptId));
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

        if (!promptExists(promptId)) {
            return errorResponse('Prompt not found', 404);
        }

        return NextResponse.json(saveWorkspace(promptId, parsed.data));
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
        return NextResponse.json(clearWorkspace(promptId));
    } catch (error) {
        console.error(`Error clearing workspace ${promptId}:`, error);
        return errorResponse('Failed to clear working values', 500);
    }
}
