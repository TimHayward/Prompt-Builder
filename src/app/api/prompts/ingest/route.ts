/**
 * API Route for ingesting a Markdown prompt
 *
 * Upserts by prompt name: the same document ingested twice replaces its
 * sections rather than creating a second prompt, and rebuilds the matching
 * library folder from the document's sections.
 */
import { NextResponse } from 'next/server';
import { runInTransaction } from '@/lib/db';
import { parsePromptMarkdown } from '@/utils/markdownParser';
import { ingestPromptRequestSchema } from '@/types/contracts';
import { getPrompt, upsertPromptByName } from '@/lib/repositories/promptsRepository';
import { replaceIngestedFolder } from '@/lib/repositories/componentsRepository';
import { errorResponse, parseRequestBody } from '@/lib/apiValidation';

export async function POST(request: Request) {
  try {
    const parsed = await parseRequestBody(request, ingestPromptRequestSchema);
    if (!parsed.ok) return parsed.response;

    const { filename, content } = parsed.data;

    const { promptName, sections } = parsePromptMarkdown(filename, content);

    if (!promptName) {
      return errorResponse('Invalid filename for prompt name derivation', 400);
    }

    if (sections.length === 0) {
      return errorResponse('No valid sections found in markdown', 400);
    }

    let promptId = '';
    let statusCode: 200 | 201 = 201;

    // The prompt and its library folder are rebuilt together or not at all.
    runInTransaction(() => {
      const upserted = upsertPromptByName(promptName, sections);
      promptId = upserted.id;
      statusCode = upserted.created ? 201 : 200;

      replaceIngestedFolder(
        promptName,
        sections.map(section => ({
          name: `${section.name} - ${promptName}`,
          content: section.content ? `${section.name}: ${section.content}` : `${section.name}:`,
          type: section.type,
        }))
      );
    });

    const prompt = getPrompt(promptId);

    if (!prompt) {
      return errorResponse('Failed to retrieve prompt after upsert', 500);
    }

    return NextResponse.json(prompt, { status: statusCode });
  } catch (error) {
    console.error('Error ingesting prompt:', error);
    return errorResponse('Failed to ingest prompt', 500);
  }
}
