import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/db';
import { parsePromptMarkdown } from '@/utils/markdownParser';
import { ingestPromptRequestSchema } from '@/types/contracts';
import { toPrompt, type PromptRow } from '@/lib/promptRows';
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

    const now = new Date().toISOString();
    let promptId = '';
    let statusCode: 200 | 201 = 201;

    const runUpsert = db.transaction(() => {
      // ── 1. Upsert prompts table ──────────────────────────────────────────
      const existing = db
        .prepare('SELECT id FROM prompts WHERE name = ?')
        .get(promptName) as { id: string } | undefined;

      if (existing) {
        // variables stays empty: values entered for a use live in the prompt's
        // workspace, not on the prompt.
        db.prepare('UPDATE prompts SET sections = ?, variables = ?, updated_at = ? WHERE id = ?').run(
          JSON.stringify(sections),
          '{}',
          now,
          existing.id,
        );
        promptId = existing.id;
        statusCode = 200;
      } else {
        const nextNumRow = db.prepare('SELECT COALESCE(MAX(num), 0) + 1 AS next_num FROM prompts').get() as {
          next_num: number;
        };
        const newPromptId = uuidv4();
        db.prepare(
          'INSERT INTO prompts (id, name, sections, variables, num, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ).run(
          newPromptId,
          promptName,
          JSON.stringify(sections),
          '{}',
          nextNumRow.next_num,
          now,
          now,
        );
        promptId = newPromptId;
        statusCode = 201;
      }

      // ── 2. Upsert component_library: folder + one component per section ──
      const existingFolder = db
        .prepare(
          "SELECT id FROM component_library WHERE name = ? AND item_type = 'folder' AND parent_id IS NULL",
        )
        .get(promptName) as { id: string } | undefined;

      let folderId: string;
      if (existingFolder) {
        // Remove old children so they are rebuilt fresh from the current markdown
        db.prepare('DELETE FROM component_library WHERE parent_id = ?').run(existingFolder.id);
        db.prepare('UPDATE component_library SET updated_at = ? WHERE id = ?').run(now, existingFolder.id);
        folderId = existingFolder.id;
      } else {
        folderId = uuidv4();
        db.prepare(
          'INSERT INTO component_library (id, parent_id, name, item_type, content, component_type, is_expanded, created_at, updated_at) VALUES (?, NULL, ?, ?, NULL, NULL, 1, ?, ?)',
        ).run(folderId, promptName, 'folder', now, now);
      }

      const insertComponent = db.prepare(
        'INSERT INTO component_library (id, parent_id, name, item_type, content, component_type, is_expanded, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)',
      );
      for (const section of sections) {
        const componentContent = section.content
          ? `${section.name}: ${section.content}`
          : `${section.name}:`;
        insertComponent.run(
          uuidv4(),
          folderId,
          `${section.name} - ${promptName}`,
          'component',
          componentContent,
          section.type,
          now,
          now,
        );
      }
    });

    runUpsert();

    const promptRaw = db
      .prepare(`
        SELECT id, name, sections, COALESCE(variables, '{}') as variables, num, created_at, updated_at
        FROM prompts
        WHERE id = ?
      `)
      .get(promptId) as PromptRow | undefined;

    if (!promptRaw) {
      return errorResponse('Failed to retrieve prompt after upsert', 500);
    }

    return NextResponse.json(toPrompt(promptRaw), { status: statusCode });
  } catch (error) {
    console.error('Error ingesting prompt:', error);


    return errorResponse('Failed to ingest prompt', 500);
  }
}
