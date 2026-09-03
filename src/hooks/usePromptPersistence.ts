'use client';

/**
 * usePromptPersistence
 *
 * Owns when prompts are written: the per-prompt debounce, the save-state
 * reporting, and what the user is told when a write fails. The context decides
 * what changed; this decides how it reaches the database.
 *
 * Debounced per prompt id, because saving prompt B must never cancel a pending
 * save of prompt A — one shared timer used to do exactly that.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useToast } from '@/contexts/ToastContext';
import { useSaveState } from '@/contexts/SaveStateContext';
import { describeApiFailure } from '@/lib/apiClient';
import { debounce, debounceKeyed } from '@/utils/debounce';
import { saveActivePromptId, savePrompt } from '@/api/promptsApi';
import type { Prompt } from '@/types';

const SAVE_DELAY_MS = 1000;

export type PromptPersistence = {
  /** Queues a save for this prompt, replacing any already queued for it. */
  queueSave: (prompt: Prompt) => void;
  /** Drops a queued save, e.g. for a prompt being deleted. */
  cancelSave: (promptId: string) => void;
  /** Queues a write of which prompt is open. */
  queueActivePromptId: (promptId: string | null) => void;
};

/**
 * @param isReady - Whether the app has loaded; saves are ignored before then
 * @param suppressActivePromptId - True while a new prompt is being created, so
 *   the intermediate id is not written
 */
export const usePromptPersistence = (
  isReady: () => boolean,
  suppressActivePromptId: () => boolean
): PromptPersistence => {
  const { showToast } = useToast();
  const saveState = useSaveState();

  // The savers are built once, so they reach the current callbacks by ref.
  const showToastRef = useRef(showToast);
  const saveStateRef = useRef(saveState);
  const isReadyRef = useRef(isReady);
  const suppressRef = useRef(suppressActivePromptId);

  useEffect(() => {
    showToastRef.current = showToast;
    saveStateRef.current = saveState;
    isReadyRef.current = isReady;
    suppressRef.current = suppressActivePromptId;
  }, [showToast, saveState, isReady, suppressActivePromptId]);

  const savePromptDebounced = useMemo(
    () =>
      debounceKeyed(
        async (prompt: Prompt) => {
          if (!isReadyRef.current()) return;

          const saveKey = `prompt:${prompt.id}`;
          saveStateRef.current.markSaving(saveKey);

          try {
            await savePrompt(prompt);
            saveStateRef.current.markSaved(saveKey);
          } catch (error) {
            // An autosave that fails silently is the worst case: the editor
            // looks saved while the change exists only in this tab.
            saveStateRef.current.markFailed(saveKey);
            console.error(`Failed to update prompt ${prompt.id}:`, error);
            showToastRef.current(describeApiFailure(error, `Could not save "${prompt.name}".`));
          }
        },
        SAVE_DELAY_MS,
        prompt => prompt.id
      ),
    []
  );

  const saveActiveDebounced = useMemo(
    () =>
      debounce(async (promptId: string | null) => {
        if (!isReadyRef.current() || suppressRef.current()) return;

        try {
          await saveActivePromptId(promptId);
        } catch (error) {
          console.error('Failed to save active prompt ID:', error);
          showToastRef.current(
            describeApiFailure(error, 'Could not remember which prompt is open.')
          );
        }
      }, SAVE_DELAY_MS),
    []
  );

  // Pending saves are per prompt, so drop them all rather than leaking timers.
  useEffect(() => () => savePromptDebounced.cancelAll(), [savePromptDebounced]);

  return useMemo(
    () => ({
      queueSave: (prompt: Prompt) => {
        // Queued now, sent when the debounce elapses: the interface should say
        // "unsaved" for that gap rather than implying the change is stored.
        saveStateRef.current.markUnsaved(`prompt:${prompt.id}`);
        savePromptDebounced(prompt);
      },
      cancelSave: (promptId: string) => {
        savePromptDebounced.cancel(promptId);
        saveStateRef.current.markSaved(`prompt:${promptId}`);
      },
      queueActivePromptId: (promptId: string | null) => saveActiveDebounced(promptId),
    }),
    [savePromptDebounced, saveActiveDebounced]
  );
};
