/**
 * Settings repository
 *
 * app_config is a single row holding the application settings, the active
 * prompt, and which prompts are open as tabs. Every half is optional in an
 * update, so the merge with what is already stored lives here rather than in
 * the route.
 */

import { db } from '@/lib/db';
import type { Settings } from '@/types';

type AppConfigRow = {
  settings_json?: string;
  active_prompt_id?: string | null;
  open_prompt_ids?: string | null;
};

export type StoredConfig = {
  settings: Settings | null;
  activePromptId: string | null;
  /** The prompts open as tabs, in tab order. */
  openPromptIds: string[];
};

const readRow = (): AppConfigRow | undefined =>
  db
    .prepare('SELECT settings_json, active_prompt_id, open_prompt_ids FROM app_config WHERE id = 1')
    .get() as AppConfigRow | undefined;

/** True when a prompt with this id exists. */
const promptExists = (id: string): boolean =>
  db.prepare('SELECT id FROM prompts WHERE id = ?').get(id) !== undefined;

/**
 * Reads the open tab list, dropping anything that is no longer a prompt
 *
 * The column is JSON rather than a table of its own, so it cannot cascade the
 * way active_prompt_id does. Filtering on the way out is what keeps a deleted
 * prompt from coming back as a tab that cannot open.
 *
 * @param stored - The raw column value
 * @returns Ids of prompts that exist, in stored order, each once
 */
const readOpenPromptIds = (stored: string | null | undefined): string[] => {
  if (!stored) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    // A corrupt tab list is not worth failing a page load over.
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const ids = parsed.filter((id): id is string => typeof id === 'string' && id.length > 0);
  return [...new Set(ids)].filter(promptExists);
};

/** The stored configuration; settings is null when nothing has been saved. */
export const getConfig = (): StoredConfig => {
  const row = readRow();

  const activePromptId = row?.active_prompt_id ?? null;
  const openPromptIds = readOpenPromptIds(row?.open_prompt_ids);

  if (!row?.settings_json) {
    return { settings: null, activePromptId, openPromptIds };
  }

  try {
    return {
      settings: JSON.parse(row.settings_json) as Settings,
      activePromptId,
      openPromptIds,
    };
  } catch {
    // A corrupt settings blob should not take the application down with it.
    return { settings: null, activePromptId, openPromptIds };
  }
};

/**
 * Writes settings, the active prompt, the open tabs, or any combination
 *
 * @param update - Whichever halves are being changed
 * @param fallbackSettings - Used when nothing is stored and none is supplied
 * @returns The configuration as it now stands
 */
export const saveConfig = (
  update: { settings?: Settings; activePromptId?: string | null; openPromptIds?: string[] },
  fallbackSettings: Settings
): StoredConfig => {
  const existing = readRow();

  const settingsJson = update.settings
    ? JSON.stringify(update.settings)
    : existing?.settings_json || JSON.stringify(fallbackSettings);

  let activePromptId =
    update.activePromptId !== undefined
      ? update.activePromptId
      : (existing?.active_prompt_id ?? null);

  // Pointing at a prompt that is not there would survive a reload and confuse
  // the tab restore, so it is refused rather than stored.
  if (activePromptId && !promptExists(activePromptId)) {
    console.warn(`Active prompt ID ${activePromptId} not found in prompts table. Setting to null.`);
    activePromptId = null;
  }

  // Same rule for the tabs, and applied to a supplied list as well as a stored
  // one: a client sending an id it has just deleted should not be able to store
  // a tab that cannot open.
  const openPromptIds =
    update.openPromptIds !== undefined
      ? readOpenPromptIds(JSON.stringify(update.openPromptIds))
      : readOpenPromptIds(existing?.open_prompt_ids);

  db.prepare(
    `INSERT OR REPLACE INTO app_config (id, settings_json, active_prompt_id, open_prompt_ids, updated_at)
     VALUES (1, ?, ?, ?, ?)`
  ).run(settingsJson, activePromptId, JSON.stringify(openPromptIds), new Date().toISOString());

  return { settings: JSON.parse(settingsJson) as Settings, activePromptId, openPromptIds };
};
