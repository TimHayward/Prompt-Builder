import { v4 as uuidv4 } from 'uuid';
import { Section } from '@/types';
import { extractVariablesFromSections } from '@/utils/variableUtils';

const SECTION_TYPE_MAP: Record<string, Section['type']> = {
  role: 'role',
  context: 'context',
  task: 'instruction',
  constraints: 'instruction',
  constraint: 'instruction',
  style: 'style',
  'output format': 'format',
  output: 'format',
  format: 'format',
};

export const derivePromptName = (filename: string): string => {
  return filename
    .replace(/^Prompt - /i, '')
    .replace(/\.md$/i, '')
    .trim();
};

export const parseMarkdownSections = (content: string): Section[] => {
  const lines = content.split(/\r?\n/);
  const sections: Section[] = [];
  const headingRegex = /^([A-Za-z][A-Za-z ]{0,30}):\s*(.*)$/;

  let current: Section | null = null;

  for (const line of lines) {
    const match = line.match(headingRegex);

    if (match) {
      if (current) {
        current.content = current.content.trim();
        sections.push(current);
      }

      const heading = match[1].trim();
      current = {
        id: uuidv4(),
        name: heading,
        content: match[2].trim(),
        type: SECTION_TYPE_MAP[heading.toLowerCase()] ?? 'instruction',
        open: true,
        dirty: false,
      };
      continue;
    }

    if (current) {
      current.content = current.content ? `${current.content}\n${line}` : line;
    }
  }

  if (current) {
    current.content = current.content.trim();
    sections.push(current);
  }

  return sections;
};

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
