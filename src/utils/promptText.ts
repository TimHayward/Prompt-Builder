/**
 * Prompt text assembly
 *
 * Builds the text that leaves the application: section contents joined,
 * variables resolved, and the system prompt prepended when markdown prompting
 * is on. Kept free of React so the clipboard output can be tested directly.
 */

import { replaceVariables } from './variableUtils';

/** Blank line between the system prompt and each section. */
export const SECTION_SEPARATOR = '\n\n';

export type BuildPromptTextOptions = {
  sections: Array<{ content: string }>;
  variables?: Record<string, string>;
  systemPrompt?: string;
  markdownEnabled?: boolean;
};

/**
 * Assembles the resolved prompt text for the clipboard
 * @param options - Sections to join, variable values, and system prompt settings
 * @returns The resolved prompt text
 */
export const buildPromptText = ({
  sections,
  variables,
  systemPrompt,
  markdownEnabled,
}: BuildPromptTextOptions): string => {
  let text = sections
    .map(section => section.content)
    .filter(content => content.trim()) // Remove empty sections
    .join(SECTION_SEPARATOR);

  if (variables && Object.keys(variables).length > 0) {
    text = replaceVariables(text, variables);
  }

  if (markdownEnabled && systemPrompt) {
    text = systemPrompt + SECTION_SEPARATOR + text;
  }

  return text;
};
