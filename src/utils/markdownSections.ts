/**
 * Markdown section parsing
 *
 * The one parser both import paths use — the interactive import modal and the
 * /api/prompts/ingest route — so the same document always yields the same
 * sections. It applies one set of heading rules, respects fenced code blocks,
 * and maps headings to types through the section type registry.
 */

import { suggestSectionType, type SectionTypeValue } from '@/lib/sectionTypes';

export interface ParsedSection {
  /** Display name, taken from the heading with any type prefix removed. */
  name: string;
  /** The section's lines, heading included, so the document round-trips. */
  content: string;
  /** The type the heading maps to, or null when nothing matches. */
  suggestedType: SectionTypeValue | null;
}

/** A top-level ATX heading: `# Role`. `##`+ is ordinary content. */
const ATX_HEADING = /^#(?!#)\s*(.+)$/;

/**
 * A `Label:` heading — the form the ingest format uses. Kept deliberately tight
 * (letters and spaces, short) so ordinary prose is not mistaken for a heading,
 * and the `//` guard stops a line ending in a URL — `See https://example.com` —
 * from parsing as a "See https" heading.
 */
const LABEL_HEADING = /^([A-Za-z][A-Za-z ]{0,30}):(?!\/\/)\s*(.*)$/;

const FENCE = /^\s*(```|~~~)/;

/** Splits a `type: Title` heading into its parts, when the left side is a type. */
const splitTypedHeading = (rawHeading: string): { name: string; type: SectionTypeValue | null } => {
  const colonIndex = rawHeading.indexOf(':');

  if (colonIndex > -1) {
    const left = rawHeading.slice(0, colonIndex);
    const right = rawHeading.slice(colonIndex + 1).trim();
    const leftType = suggestSectionType(left);
    if (leftType && right) {
      return { name: right, type: leftType };
    }
  }

  return {
    name: rawHeading.replace(/:\s*$/, '').trim(),
    type: suggestSectionType(rawHeading),
  };
};

/**
 * Scans the document once for one heading style
 * @param lines - The document's lines
 * @param match - Returns the heading text for a line, or null if it is content
 * @returns The sections found, each keeping its heading line in `content`
 */
const collectSections = (
  lines: string[],
  match: (line: string) => string | null
): ParsedSection[] => {
  const sections: ParsedSection[] = [];
  let current: ParsedSection | null = null;
  let inFence = false;

  const closeCurrent = () => {
    if (current) {
      current.content = current.content.trim();
      sections.push(current);
    }
  };

  const appendLine = (line: string) => {
    if (current) current.content += (current.content ? '\n' : '') + line;
  };

  for (const line of lines) {
    if (FENCE.test(line)) {
      // A fence toggles code mode; headings inside it are just text.
      inFence = !inFence;
      appendLine(line);
      continue;
    }

    const heading = inFence ? null : match(line);

    if (heading !== null) {
      closeCurrent();
      const { name, type } = splitTypedHeading(heading);
      // The heading line stays as the first line of the section, so importing a
      // document and copying it back gives the document you started with.
      current = { name, content: line, suggestedType: type };
      continue;
    }

    appendLine(line);
  }

  closeCurrent();
  return sections;
};

/**
 * Splits a Markdown document into sections
 *
 * Top-level `#` headings win. A document with none is retried with `Label:`
 * headings, which is how the ingest format writes them. Content before the
 * first heading is dropped as preamble, and a document with no headings at all
 * returns nothing, leaving the caller to decide what a single blob becomes.
 *
 * @param content - The raw Markdown
 * @returns The parsed sections, in document order
 */
export const parseMarkdownSections = (content: string): ParsedSection[] => {
  const lines = content.split(/\r?\n/);

  const byHeading = collectSections(lines, line => {
    const match = line.match(ATX_HEADING);
    return match ? match[1].trim() : null;
  });

  if (byHeading.length > 0) return byHeading;

  return collectSections(lines, line => {
    const match = line.match(LABEL_HEADING);
    return match ? match[1].trim() : null;
  });
};
