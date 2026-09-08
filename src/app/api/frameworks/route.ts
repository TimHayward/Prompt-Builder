/**
 * API route for frameworks
 *
 * Reads the frameworks a user can choose from, and writes one back after it has
 * been edited. Migration 9 moved these out of the source so they could be
 * edited at all.
 */
import { NextResponse } from 'next/server';
import { frameworkSchema } from '@/types/contracts';
import { getFrameworks, saveFramework } from '@/lib/repositories/frameworksRepository';
import { errorResponse, parseRequestBody } from '@/lib/apiValidation';

/**
 * GET /api/frameworks
 * Every framework, each with its components in the order they are read.
 */
export async function GET() {
  try {
    return NextResponse.json(getFrameworks());
  } catch (error) {
    console.error('Error fetching frameworks:', error);
    return errorResponse('Failed to fetch frameworks', 500);
  }
}

/**
 * POST /api/frameworks
 * Creates or replaces one framework. The component list it carries is
 * authoritative: the stored order becomes the order sent, and a component left
 * out of it is removed.
 */
export async function POST(request: Request) {
  try {
    const parsed = await parseRequestBody(request, frameworkSchema);
    if (!parsed.ok) return parsed.response;

    return NextResponse.json(saveFramework(parsed.data));
  } catch (error) {
    console.error('Error saving framework:', error);
    return errorResponse('Failed to save the framework', 500);
  }
}
