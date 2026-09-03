/**
 * Prompts repository
 *
 * Every SQL statement that touches the prompts table lives here, so the routes
 * deal in prompts rather than in columns and JSON blobs, and a schema change
 * has one place to land.
 */

import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/db';
import { toPrompt, type PromptRow } from '@/lib/promptRows';
import type { Prompt, StoredSection } from '@/types';

/** A prompt as the API returns it, with the row's timestamps. */
export type StoredPrompt = Prompt & { created_at?: string; updated_at?: string };

const SELECT_COLUMNS = `
    SELECT id, name, sections, COALESCE(variables, '{}') as variables, num, created_at, updated_at
    FROM prompts
`;

export type CreatePromptInput = {
  name: string;
  sections?: StoredSection[];
  variables?: Record<string, string>;
  num?: number | null;
};

export type UpdatePromptInput = {
  name?: string;
  sections?: StoredSection[];
  variables?: Record<string, string>;
  num?: number | null;
};

/**
 * Every prompt, in the order the tabs should show them
 *
 * num is nullable and SQLite sorts nulls first, so unnumbered prompts are
 * pushed to the end explicitly; the remaining keys make the order total, and
 * therefore stable across reloads.
 */
export const listPrompts = (): StoredPrompt[] => {
  const rows = db
    .prepare(`${SELECT_COLUMNS} ORDER BY num IS NULL, num, created_at, id`)
    .all() as PromptRow[];

  return rows.map(toPrompt);
};

/** One prompt, or undefined when there is no such id. */
export const getPrompt = (id: string): StoredPrompt | undefined => {
  const row = db.prepare(`${SELECT_COLUMNS} WHERE id = ?`).get(id) as PromptRow | undefined;
  return row ? toPrompt(row) : undefined;
};

export const promptExists = (id: string): boolean =>
  db.prepare('SELECT id FROM prompts WHERE id = ?').get(id) !== undefined;

/**
 * Stores a new prompt
 * @returns The prompt as stored, so the caller returns what is really there
 */
export const createPrompt = (input: CreatePromptInput): StoredPrompt | undefined => {
  const id = uuidv4();
  const now = new Date().toISOString();

  db.prepare(
    'INSERT INTO prompts (id, name, sections, variables, num, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    input.name,
    JSON.stringify(input.sections ?? []),
    JSON.stringify(input.variables ?? {}),
    input.num ?? null,
    now,
    now
  );

  return getPrompt(id);
};

/**
 * Applies a partial update, leaving untouched fields as they are
 * @returns The updated prompt, or undefined if the id is unknown
 */
export const updatePrompt = (id: string, input: UpdatePromptInput): StoredPrompt | undefined => {
  const current = db
    .prepare("SELECT name, sections, COALESCE(variables, '{}') as variables, num FROM prompts WHERE id = ?")
    .get(id) as { name: string; sections: string; variables: string; num: number | null } | undefined;

  if (!current) return undefined;

  db.prepare('UPDATE prompts SET name = ?, sections = ?, variables = ?, num = ?, updated_at = ? WHERE id = ?').run(
    input.name ?? current.name,
    input.sections ? JSON.stringify(input.sections) : current.sections,
    input.variables ? JSON.stringify(input.variables) : current.variables,
    input.num ?? current.num,
    new Date().toISOString(),
    id
  );

  return getPrompt(id);
};

/**
 * Deletes a prompt, clearing it from app_config first
 * @returns Whether a row was removed
 */
export const deletePrompt = (id: string): boolean => {
  const remove = db.transaction(() => {
    const config = db.prepare('SELECT active_prompt_id FROM app_config WHERE id = 1').get() as
      | { active_prompt_id?: string | null }
      | undefined;

    // app_config.active_prompt_id is ON DELETE SET NULL, but clearing it here
    // keeps the behaviour whether or not the pragma is on.
    if (config?.active_prompt_id === id) {
      db.prepare('UPDATE app_config SET active_prompt_id = NULL, updated_at = ? WHERE id = 1').run(
        new Date().toISOString()
      );
    }

    return db.prepare('DELETE FROM prompts WHERE id = ?').run(id).changes > 0;
  });

  return remove();
};

/** The prompt of that name, for the ingest route's upsert-by-name. */
export const findPromptByName = (name: string): { id: string } | undefined =>
  db.prepare('SELECT id FROM prompts WHERE name = ?').get(name) as { id: string } | undefined;

/** The next free ordering position. */
export const nextPromptNumber = (): number =>
  (db.prepare('SELECT COALESCE(MAX(num), 0) + 1 AS next_num FROM prompts').get() as { next_num: number }).next_num;

/**
 * Replaces a prompt's sections, or creates it when the name is new
 * @returns The prompt id and whether it was created
 */
export const upsertPromptByName = (
  name: string,
  sections: StoredSection[]
): { id: string; created: boolean } => {
  const now = new Date().toISOString();
  const existing = findPromptByName(name);

  if (existing) {
    // variables stays empty: values entered for a use live in the prompt's
    // workspace, not on the prompt.
    db.prepare('UPDATE prompts SET sections = ?, variables = ?, updated_at = ? WHERE id = ?').run(
      JSON.stringify(sections),
      '{}',
      now,
      existing.id
    );
    return { id: existing.id, created: false };
  }

  const id = uuidv4();
  db.prepare(
    'INSERT INTO prompts (id, name, sections, variables, num, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, name, JSON.stringify(sections), '{}', nextPromptNumber(), now, now);

  return { id, created: true };
};
