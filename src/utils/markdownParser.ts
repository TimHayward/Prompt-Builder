/**
 * Prompt Markdown parsing for the ingest route
 *
 * Section splitting itself lives in markdownSections.ts, which the interactive
 * import uses too, so a document ingested through the API produces the same
 * sections as the same document imported through the UI.
 */

import { v4 as uuidv4 } from 'uuid';
import { Section } from '@/types';
import { DEFAULT_TYPE } from '@/lib/sectionTypes';
import { extractVariablesFromSections } from '@/utils/variableUtils';
import { parseMarkdownSections as splitIntoSections } from '@/utils/markdownSections';

export const derivePromptName = (filename: string): string => {
  return filename
    .replace(/^Prompt - /i, '')
    .replace(/\.md$/i, '')
    .trim();
};

/**
 * Parses a document into prompt sections
 * @param content - The raw Markdown
 * @returns Sections ready to store on a prompt
 */
export const parseMarkdownSections = (content: string): Section[] =>
  splitIntoSections(content).map(section => ({
    id: uuidv4(),
    name: section.name,
    content: section.content,
    type: section.suggestedType ?? DEFAULT_TYPE,
    open: true,
    dirty: false,
  }));

export const buildVariablesObject = (sections: Section[]): Record<string, string> => {
  const variables = extractVariablesFromSections(sections);
  return variables.reduce<Record<string, string>>((acc, key) => {
    acc[key] = '';
    return acc;
  }, {});
};

export const parsePromptMarkdown = (filename: string, content: string) => {
  const promptName = derivePromptName(filename);
  const sections = parseMarkdownSections(content);
  const variables = buildVariablesObject(sections);

  return { promptName, sections, variables };
};
