/**
 * Workspaces repository
 *
 * Working state for a prompt: the values entered for this use. Deliberately a
 * separate table from prompts, so using a prompt never rewrites it.
 */

import { db } from '@/lib/db';
import { emptyWorkspaceRow, toWorkspace, type WorkspaceRow } from '@/lib/workspaceRows';
import type { PromptWorkspace } from '@/types/contracts';

const SELECT_COLUMNS =
  'SELECT prompt_id, values_json, section_overrides_json FROM prompt_workspaces';

/** Every prompt that has working state. */
export const listWorkspaces = (): PromptWorkspace[] =>
  (db.prepare(SELECT_COLUMNS).all() as WorkspaceRow[]).map(toWorkspace);

/** One prompt's working state; an empty one when it has never been used. */
export const getWorkspace = (promptId: string): PromptWorkspace => {
  const row = db.prepare(`${SELECT_COLUMNS} WHERE prompt_id = ?`).get(promptId) as
    WorkspaceRow | undefined;

  return toWorkspace(row ?? emptyWorkspaceRow(promptId));
};

/**
 * Writes the values, the section overrides, or both
 * @param promptId - The prompt this working state belongs to
 * @param update - Whichever halves are being changed
 * @returns The working state as it now stands
 */
export const saveWorkspace = (
  promptId: string,
  update: { values?: Record<string, string>; sectionOverrides?: Record<string, string> }
): PromptWorkspace => {
  const existing =
    (db.prepare(`${SELECT_COLUMNS} WHERE prompt_id = ?`).get(promptId) as
      WorkspaceRow | undefined) ?? emptyWorkspaceRow(promptId);

  const valuesJson = update.values ? JSON.stringify(update.values) : existing.values_json;
  const overridesJson = update.sectionOverrides
    ? JSON.stringify(update.sectionOverrides)
    : existing.section_overrides_json;

  db.prepare(
    `INSERT INTO prompt_workspaces (prompt_id, values_json, section_overrides_json, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(prompt_id) DO UPDATE SET
        values_json = excluded.values_json,
        section_overrides_json = excluded.section_overrides_json,
        updated_at = excluded.updated_at`
  ).run(promptId, valuesJson, overridesJson, new Date().toISOString());

  return toWorkspace({
    prompt_id: promptId,
    values_json: valuesJson,
    section_overrides_json: overridesJson,
  });
};

/** Drops the working state, leaving the prompt untouched. */
export const clearWorkspace = (promptId: string): PromptWorkspace => {
  db.prepare('DELETE FROM prompt_workspaces WHERE prompt_id = ?').run(promptId);
  return toWorkspace(emptyWorkspaceRow(promptId));
};
