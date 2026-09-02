/**
 * The prompt compiler
 *
 * One function decides what a prompt resolves to. Everything that needs the
 * resolved text — the clipboard, the preview, anything counting or checking it
 * later — calls this, so those answers cannot drift apart.
 *
 * Pure: no React, no persistence, no clipboard.
 */

import { SECTION_TYPE_LABELS, type SectionTypeValue } from '@/lib/sectionTypes';
import { resolveVariables } from './variableUtils';

/** Blank line between the system prompt and each section. */
export const SECTION_SEPARATOR = '\n\n';

/** The part of a section the compiler reads. */
export type CompilableSection = {
  name: string;
  content: string;
  type: SectionTypeValue;
};

export type CompilePromptOptions = {
  /** Sections in the order they appear in the prompt. */
  sections: CompilableSection[];
  /** Working values for this use; missing ones resolve to nothing. */
  values?: Record<string, string>;
  /** Prepended, and section headings added, when markdown prompting is on. */
  systemPrompt?: string;
  markdownEnabled?: boolean;
};

export type CompiledPrompt = {
  /** Exactly what belongs on the clipboard. */
  text: string;
  /** Variables the prompt declares but this use left blank. */
  unresolved: string[];
};

/**
 * The heading markdown prompting promises: `# Role: Senior Reviewer`.
 * The label comes from the type registry, which is what the system prompt's
 * guide describes.
 */
const headingFor = (section: CompilableSection): string =>
  `# ${SECTION_TYPE_LABELS[section.type] ?? section.type}: ${section.name}`;

/**
 * Whether the section's text already opens with its own heading.
 *
 * Sections imported from Markdown keep their heading line, so adding one would
 * print two headings back to back.
 */
const startsWithOwnHeading = (content: string): boolean =>
  /^\s*#(?!#)/.test(content);

/**
 * Compiles a prompt into the text a user copies
 * @param options - Sections, working values and formatting settings
 * @returns The resolved text and any variables left blank
 */
export const compilePrompt = ({
  sections,
  values = {},
  systemPrompt,
  markdownEnabled = false,
}: CompilePromptOptions): CompiledPrompt => {
  const unresolved: string[] = [];

  const compiledSections = sections
    // A section with nothing in it contributes nothing, heading included.
    .filter(section => section.content.trim())
    .map(section => {
      const resolved = resolveVariables(section.content, values);
      resolved.unresolved.forEach(key => {
        if (!unresolved.includes(key)) unresolved.push(key);
      });

      // Headings are what makes the system prompt's description of the format
      // true; without markdown prompting the sections run together as prose.
      // A section that already carries its own heading keeps it rather than
      // gaining a second one.
      return markdownEnabled && !startsWithOwnHeading(resolved.text)
        ? `${headingFor(section)}${SECTION_SEPARATOR}${resolved.text}`
        : resolved.text;
    });

  const body = compiledSections.join(SECTION_SEPARATOR);

  const text = markdownEnabled && systemPrompt
    ? systemPrompt + SECTION_SEPARATOR + body
    : body;

  return { text, unresolved };
};
