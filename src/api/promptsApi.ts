/**
 * Prompts API client
 *
 * The browser's half of the prompt endpoints: where the URLs live, what is sent,
 * and what comes back. Callers work in prompts and never assemble a request.
 *
 * Editor state is stripped on the way out and restored on the way in, so a
 * caller cannot accidentally persist whether a section was expanded.
 */

import { apiRequest, apiSend } from '@/lib/apiClient';
import { toEditorSections, toStoredSections } from '@/utils/sectionState';
import type { CreatePromptRequest, UpdatePromptRequest } from '@/types/contracts';
import type { Prompt } from '@/types';

/** Adds the editor state a stored prompt does not carry. */
const withEditorState = (prompt: Prompt): Prompt => ({
  ...prompt,
  sections: toEditorSections(prompt.sections ?? []),
});

/** Every prompt, in the order the tabs should show them. */
export const fetchPrompts = async (): Promise<Prompt[]> => {
  const stored = await apiRequest<Prompt[]>('/api/prompts');
  return stored.map(withEditorState);
};

/** The prompt that was open last time, from app_config. */
export const fetchActivePromptId = async (): Promise<string | null> => {
  const { activePromptId } = await apiRequest<{ activePromptId: string | null }>('/api/settings');
  return activePromptId;
};

/** Records which prompt is open. */
export const saveActivePromptId = (activePromptId: string | null): Promise<unknown> =>
  apiSend('/api/settings', 'POST', { activePromptId });

export const createPrompt = async (prompt: CreatePromptRequest): Promise<Prompt> =>
  withEditorState(await apiSend<Prompt>('/api/prompts', 'POST', prompt));

/** Saves a prompt. Only the stored half of each section is sent. */
export const savePrompt = (prompt: Prompt): Promise<unknown> => {
  const update: UpdatePromptRequest = {
    name: prompt.name,
    num: prompt.num,
    variables: prompt.variables,
    sections: toStoredSections(prompt.sections),
  };

  return apiSend(`/api/prompts/${prompt.id}`, 'PUT', update);
};

export const deletePrompt = (promptId: string): Promise<unknown> =>
  apiSend(`/api/prompts/${promptId}`, 'DELETE');
