/**
 * Settings repository
 *
 * app_config is a single row holding the application settings and the active
 * prompt. Both halves are optional in an update, so the merge with what is
 * already stored lives here rather than in the route.
 */

import { db } from '@/lib/db';
import type { Settings } from '@/types';

type AppConfigRow = {
  settings_json?: string;
  active_prompt_id?: string | null;
};

export type StoredConfig = {
  settings: Settings | null;
  activePromptId: string | null;
};

const readRow = (): AppConfigRow | undefined =>
  db.prepare('SELECT settings_json, active_prompt_id FROM app_config WHERE id = 1').get() as
    AppConfigRow | undefined;

/** The stored configuration; settings is null when nothing has been saved. */
export const getConfig = (): StoredConfig => {
  const row = readRow();

  if (!row?.settings_json) {
    return { settings: null, activePromptId: row?.active_prompt_id ?? null };
  }

  try {
    return {
      settings: JSON.parse(row.settings_json) as Settings,
      activePromptId: row.active_prompt_id ?? null,
    };
  } catch {
    // A corrupt settings blob should not take the application down with it.
    return { settings: null, activePromptId: row.active_prompt_id ?? null };
  }
};

/**
 * Writes settings, the active prompt, or both
 *
 * @param update - Whichever halves are being changed
 * @param fallbackSettings - Used when nothing is stored and none is supplied
 * @returns The configuration as it now stands
 */
export const saveConfig = (
  update: { settings?: Settings; activePromptId?: string | null },
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
  if (activePromptId) {
    const exists = db.prepare('SELECT id FROM prompts WHERE id = ?').get(activePromptId);
    if (!exists) {
      console.warn(
        `Active prompt ID ${activePromptId} not found in prompts table. Setting to null.`
      );
      activePromptId = null;
    }
  }

  db.prepare(
    'INSERT OR REPLACE INTO app_config (id, settings_json, active_prompt_id, updated_at) VALUES (1, ?, ?, ?)'
  ).run(settingsJson, activePromptId, new Date().toISOString());

  return { settings: JSON.parse(settingsJson) as Settings, activePromptId };
};
