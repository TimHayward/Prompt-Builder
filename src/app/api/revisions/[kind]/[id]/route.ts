/**
 * API Route for revision history
 *
 * GET lists what a prompt or a component looked like before its recent edits;
 * POST makes one of those the current version. Working values are in neither:
 * a revision holds the source, and nothing about how one use was filled in.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse, parseRequestBody } from '@/lib/apiValidation';
import {
  getComponentRevision,
  getPromptRevision,
  listRevisions,
  revisionBelongsTo,
  type RevisionKind,
} from '@/lib/repositories/revisionsRepository';
import { getPrompt, promptExists, updatePrompt } from '@/lib/repositories/promptsRepository';
import { getLibraryItem, updateLibraryItem } from '@/lib/repositories/componentsRepository';

const kindSchema = z.enum(['prompt', 'component']);

const restoreRequestSchema = z.object({
  revisionId: z.string().min(1),
});

type Params = { params: Promise<{ kind: string; id: string }> };

/** Reads and checks the route's own parameters. */
const readParams = async (context: Params) => {
  const { kind, id } = await context.params;
  const parsed = kindSchema.safeParse(kind);

  if (!parsed.success || !id) return null;

  return { kind: parsed.data as RevisionKind, id };
};

/**
 * GET /api/revisions/:kind/:id
 * Every stored revision of one prompt or component, newest first.
 */
export async function GET(request: Request, context: Params) {
  const params = await readParams(context);
  if (!params) return errorResponse('Unknown revision kind', 400);

  try {
    const revisions = listRevisions(params.kind, params.id);
    const url = new URL(request.url);
    const wanted = url.searchParams.get('revisionId');

    // One revision's content, for showing what it said.
    if (wanted) {
      if (!revisionBelongsTo(params.kind, params.id, wanted)) {
        return errorResponse('Revision not found', 404);
      }

      const revision =
        params.kind === 'prompt' ? getPromptRevision(wanted) : getComponentRevision(wanted);

      return revision ? NextResponse.json(revision) : errorResponse('Revision not found', 404);
    }

    return NextResponse.json(revisions);
  } catch (error) {
    console.error('Error reading revisions:', error);
    return errorResponse('Failed to read the revision history', 500);
  }
}

/**
 * POST /api/revisions/:kind/:id
 * Makes a previous revision the current version.
 */
export async function POST(request: Request, context: Params) {
  const params = await readParams(context);
  if (!params) return errorResponse('Unknown revision kind', 400);

  const parsed = await parseRequestBody(request, restoreRequestSchema);
  if (!parsed.ok) return parsed.response;

  const { revisionId } = parsed.data;

  if (!revisionBelongsTo(params.kind, params.id, revisionId)) {
    return errorResponse('Revision not found', 404);
  }

  try {
    if (params.kind === 'prompt') {
      const revision = getPromptRevision(revisionId);
      if (!revision) return errorResponse('Revision not found', 404);
      if (!promptExists(params.id)) return errorResponse('Prompt not found', 404);

      // Restoring is itself a change to the source, so the repository records
      // what was current before it — a restore can be undone like any edit.
      const restored = updatePrompt(params.id, {
        name: revision.name,
        sections: revision.sections,
      });

      return restored ? NextResponse.json(restored) : errorResponse('Prompt not found', 404);
    }

    const revision = getComponentRevision(revisionId);
    if (!revision) return errorResponse('Revision not found', 404);
    if (!getLibraryItem(params.id)) return errorResponse('Component not found', 404);

    const restored = updateLibraryItem(params.id, [
      { column: 'name', value: revision.name },
      { column: 'content', value: revision.content },
    ]);

    return restored ? NextResponse.json(restored) : errorResponse('Component not found', 404);
  } catch (error) {
    console.error('Error restoring a revision:', error);
    return errorResponse('Failed to restore the revision', 500);
  }
}
