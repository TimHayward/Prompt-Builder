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

/** Which prompts were open as tabs, and which of them was showing. */
export type OpenTabs = {
  activePromptId: string | null;
  openPromptIds: string[];
};

/** The tabs that were open last time, from app_config. */
export const fetchOpenTabs = async (): Promise<OpenTabs> => {
  const { activePromptId, openPromptIds } = await apiRequest<{
    activePromptId: string | null;
    openPromptIds?: string[];
  }>('/api/settings');

  // openPromptIds is optional on the way in: a database migrating from before
  // version 8 has no tab list yet, and the caller decides what to open instead.
  return { activePromptId, openPromptIds: openPromptIds ?? [] };
};

/** Records which prompts are open, and which one is showing. */
export const saveOpenTabs = ({ activePromptId, openPromptIds }: OpenTabs): Promise<unknown> =>
  apiSend('/api/settings', 'POST', { activePromptId, openPromptIds });

export const createPrompt = async (prompt: CreatePromptRequest): Promise<Prompt> =>
  withEditorState(await apiSend<Prompt>('/api/prompts', 'POST', prompt));

/** Saves a prompt. Only the stored half of each section is sent. */
export const savePrompt = (prompt: Prompt): Promise<unknown> => {
  const update: UpdatePromptRequest = {
    name: prompt.name,
    description: prompt.description,
    isFavourite: prompt.isFavourite,
    tags: prompt.tags,
    lastUsedAt: prompt.lastUsedAt,
    num: prompt.num,
    variables: prompt.variables,
    sections: toStoredSections(prompt.sections),
  };

  return apiSend(`/api/prompts/${prompt.id}`, 'PUT', update);
};

export const deletePrompt = (promptId: string): Promise<unknown> =>
  apiSend(`/api/prompts/${promptId}`, 'DELETE');
