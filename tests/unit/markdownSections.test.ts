/**
 * B8's acceptance: the same document must produce the same prompt structure
 * whichever import path reads it. The two paths — the interactive modal via
 * markdownImport and the ingest route via markdownParser — are compared
 * directly, alongside the heading rules they now share.
 */
import { describe, expect, it } from 'vitest';
import { parseMarkdownSections } from '@/utils/markdownSections';
import { parseMarkdownByHeaders } from '@/utils/markdownImport';
import { parsePromptMarkdown } from '@/utils/markdownParser';

const ATX_DOCUMENT = [
  'Some preamble that belongs to no section.',
  '',
  '# Role',
  'You are a careful reviewer.',
  '',
  '# Context',
  'The codebase is {{language}}.',
  '',
  '# Output Format',
  'Bullet points.',
].join('\n');

const LABEL_DOCUMENT = [
  'Role: You are a careful reviewer.',
  'Context: The codebase is {{language}}.',
].join('\n');

const FENCED_DOCUMENT = [
  '# Role',
  'Explain this snippet:',
  '```md',
  '# Not a heading',
  'Context: also not a heading',
  '```',
  'Then stop.',
].join('\n');

/** The structure a prompt ends up with, for comparing the two paths. */
const structureOf = (
  sections: { name: string; content: string; type?: string; suggestedType?: string | null }[]
) =>
  sections.map(section => ({
    name: section.name,
    content: section.content,
    type: section.type ?? section.suggestedType ?? null,
  }));

describe('both import paths', () => {
  it('produce the same structure for an ATX document', () => {
    const viaModal = parseMarkdownByHeaders(ATX_DOCUMENT);
    const viaIngest = parsePromptMarkdown('Prompt - Review.md', ATX_DOCUMENT).sections;

    expect(structureOf(viaIngest)).toEqual(structureOf(viaModal));
    expect(viaIngest.map(section => section.name)).toEqual(['Role', 'Context', 'Output Format']);
    expect(viaIngest.map(section => section.type)).toEqual(['role', 'context', 'format']);
  });

  it('produce the same structure for a Label: document', () => {
    const viaModal = parseMarkdownByHeaders(LABEL_DOCUMENT);
    const viaIngest = parsePromptMarkdown('Prompt - Review.md', LABEL_DOCUMENT).sections;

    expect(structureOf(viaIngest)).toEqual(structureOf(viaModal));
    expect(viaIngest.map(section => section.name)).toEqual(['Role', 'Context']);
  });

  it('produce the same structure for a document with fenced code', () => {
    const viaModal = parseMarkdownByHeaders(FENCED_DOCUMENT);
    const viaIngest = parsePromptMarkdown('Prompt - Review.md', FENCED_DOCUMENT).sections;

    expect(structureOf(viaIngest)).toEqual(structureOf(viaModal));
    expect(viaIngest).toHaveLength(1);
  });

  it('collect the same variables the sections declare', () => {
    const { variables } = parsePromptMarkdown('Prompt - Review.md', ATX_DOCUMENT);

    expect(variables).toEqual({ language: '' });
  });
});

describe('parseMarkdownSections', () => {
  it('drops preamble before the first heading', () => {
    const sections = parseMarkdownSections(ATX_DOCUMENT);

    expect(sections[0].content.startsWith('# Role')).toBe(true);
    expect(sections.some(section => section.content.includes('preamble'))).toBe(false);
  });

  it('keeps the heading line with its section', () => {
    const [role] = parseMarkdownSections(ATX_DOCUMENT);

    expect(role.content).toBe('# Role\nYou are a careful reviewer.');
  });

  it('treats ## and deeper as content', () => {
    const sections = parseMarkdownSections('# Role\n## Sub heading\nbody');

    expect(sections).toHaveLength(1);
    expect(sections[0].content).toContain('## Sub heading');
  });

  it('ignores headings inside fenced code blocks', () => {
    const [only] = parseMarkdownSections(FENCED_DOCUMENT);

    expect(only.name).toBe('Role');
    expect(only.content).toContain('# Not a heading');
    expect(only.content).toContain('Context: also not a heading');
  });

  it('reads the compiled "# type: Title" form', () => {
    const [section] = parseMarkdownSections('# role: Senior Reviewer\nbody');

    expect(section.name).toBe('Senior Reviewer');
    expect(section.suggestedType).toBe('role');
  });

  it('leaves an unrecognised heading typeless rather than guessing', () => {
    const [section] = parseMarkdownSections('# Something Unusual\nbody');

    expect(section.name).toBe('Something Unusual');
    expect(section.suggestedType).toBeNull();
  });

  it('does not read a URL as a Label: heading', () => {
    const sections = parseMarkdownSections(
      'Role: the reviewer\nSee https://example.com for details'
    );

    expect(sections).toHaveLength(1);
    expect(sections[0].name).toBe('Role');
    expect(sections[0].content).toContain('https://example.com');
  });

  it('returns nothing for a document with no headings at all', () => {
    expect(parseMarkdownSections('just a paragraph of text')).toEqual([]);
  });
});
