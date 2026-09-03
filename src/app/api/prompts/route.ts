/**
 * API Route for Prompts (List and Create)
 * Handles fetching all prompts and creating new prompts.
 */
import { NextResponse } from 'next/server';
import { createPromptRequestSchema } from '@/types/contracts';
import { createPrompt, listPrompts } from '@/lib/repositories/promptsRepository';
import { errorResponse, parseRequestBody } from '@/lib/apiValidation';

/**
 * GET /api/prompts
 * Fetches all prompts from the database.
 */
export async function GET() {
  try {
    return NextResponse.json(listPrompts());
  } catch (error) {
    console.error('Error fetching prompts:', error);
    return errorResponse('Failed to fetch prompts', 500);
  }
}

/**
 * POST /api/prompts
 * Creates a new prompt.
 */
export async function POST(request: Request) {
  try {
    const parsed = await parseRequestBody(request, createPromptRequestSchema);
    if (!parsed.ok) return parsed.response;

    const created = createPrompt(parsed.data);

    if (!created) {
      // Should not happen if the insert succeeded
      return errorResponse('Failed to create prompt or retrieve it after creation', 500);
    }

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('Error creating prompt:', error);
    return errorResponse('Failed to create prompt', 500);
  }
}
