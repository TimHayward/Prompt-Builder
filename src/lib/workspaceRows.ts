/**
 * Row mapping for prompt workspaces
 *
 * Kept out of the route files because a Next.js route module may only export
 * request handlers.
 */

import type { PromptWorkspace } from '@/types/contracts';

export type WorkspaceRow = {
  prompt_id: string;
  values_json: string;
  section_overrides_json: string;
};

/** An empty workspace, so a prompt that has never been used still reads. */
export const emptyWorkspaceRow = (promptId: string): WorkspaceRow => ({
  prompt_id: promptId,
  values_json: '{}',
  section_overrides_json: '{}',
});

/** Reads a stored JSON map, tolerating a row written by something else. */
const parseMap = (json: string): Record<string, string> => {
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

/**
 * Turns a row into the shape the client works with
 * @param row - A prompt_workspaces row
 */
export const toWorkspace = (row: WorkspaceRow): PromptWorkspace => ({
  promptId: row.prompt_id,
  values: parseMap(row.values_json),
  sectionOverrides: parseMap(row.section_overrides_json),
});
