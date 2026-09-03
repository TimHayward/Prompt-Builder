/**
 * API Route for Single Prompt (Read, Update, Delete)
 * Handles fetching, updating, and deleting a single prompt by its ID.
 */
import { NextResponse } from 'next/server';
import { updatePromptRequestSchema } from '@/types/contracts';
import { deletePrompt, getPrompt, updatePrompt } from '@/lib/repositories/promptsRepository';
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
        const prompt = getPrompt(id);
        return prompt ? NextResponse.json(prompt) : errorResponse('Prompt not found', 404);
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

        const updated = updatePrompt(id, parsed.data);

        return updated ? NextResponse.json(updated) : errorResponse('Prompt not found', 404);
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
        return deletePrompt(id)
            ? NextResponse.json({ message: 'Prompt deleted successfully' })
            : errorResponse('Prompt not found', 404);
    } catch (error) {
        console.error(`Error deleting prompt ${id}:`, error);
        return errorResponse('Failed to delete prompt', 500);
    }
}
