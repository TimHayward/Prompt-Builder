/**
 * I3, I5 and I6: finding a prompt in a library too big for the tabs.
 *
 * The acceptance names the fields search has to cover, so there is a case per
 * field, plus the filters and the tag rules they rest on.
 */
import { describe, expect, it } from 'vitest';
import type { Prompt, Section } from '@/types';
import { buildPrompt } from '../support/buildPrompt';
import { RECENT_DAYS, addTag, collectTags, isRecent, searchPrompts } from '@/domain/promptSearch';

const section = (overrides: Partial<Section> = {}): Section => ({
  id: 's1',
  name: 'Instruction',
  content: 'Write something.',
  type: 'instruction',
  open: true,
  dirty: false,
  ...overrides,
});

const prompt = (overrides: Partial<Prompt> = {}): Prompt =>
  buildPrompt({ name: 'Announcement', sections: [section()], ...overrides });

/** Days before now, as the column stores it. */
const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

const names = (matches: { prompt: Prompt }[]) => matches.map(match => match.prompt.name);

describe('searching across a prompt', () => {
  const library = [
    prompt({ id: 'p1', name: 'Security review' }),
    prompt({ id: 'p2', name: 'Second', description: 'A security posture summary' }),
    prompt({ id: 'p3', name: 'Third', tags: ['Security'] }),
    prompt({
      id: 'p4',
      name: 'Fourth',
      sections: [section({ name: 'Security context' })],
    }),
    prompt({
      id: 'p5',
      name: 'Fifth',
      sections: [section({ content: 'Assess the security of the tenant.' })],
    }),
    prompt({
      id: 'p6',
      name: 'Sixth',
      sections: [section({ content: 'Report on {{security_area}} this week.' })],
    }),
    prompt({ id: 'p7', name: 'Unrelated', description: 'Nothing to do with it' }),
  ];

  it('finds a match in every field the acceptance names', () => {
    const matched = searchPrompts(library, { query: 'security' });

    expect(names(matched)).toEqual([
      'Security review',
      'Second',
      'Third',
      'Fourth',
      'Fifth',
      'Sixth',
    ]);
  });

  it('says where each one matched', () => {
    const byId = (id: string) =>
      searchPrompts(library, { query: 'security' }).find(match => match.prompt.id === id)?.fields;

    expect(byId('p1')).toEqual(['name']);
    expect(byId('p2')).toEqual(['description']);
    expect(byId('p3')).toEqual(['tag']);
    expect(byId('p4')).toEqual(['section']);
    expect(byId('p6')).toEqual(['section', 'variable']);
  });

  it('ignores case', () => {
    expect(names(searchPrompts(library, { query: 'SECURITY REV' }))).toEqual(['Security review']);
  });

  it('matches part of a word', () => {
    expect(names(searchPrompts(library, { query: 'ecurit' }))).toHaveLength(6);
  });

  it('returns everything when nothing is typed', () => {
    expect(searchPrompts(library, { query: '   ' })).toHaveLength(library.length);
  });

  it('finds a labelled variable by its label', () => {
    const labelled = [
      prompt({ sections: [section({ content: 'Send via {{channel: mail/teams}}.' })] }),
    ];

    expect(searchPrompts(labelled, { query: 'channel' })).toHaveLength(1);
  });
});

describe('filtering', () => {
  const library = [
    prompt({ id: 'p1', name: 'Starred', isFavourite: true }),
    prompt({ id: 'p2', name: 'Plain' }),
    prompt({ id: 'p3', name: 'Used today', lastUsedAt: daysAgo(0) }),
    prompt({ id: 'p4', name: 'Used last week', lastUsedAt: daysAgo(7) }),
    prompt({ id: 'p5', name: 'Used long ago', lastUsedAt: daysAgo(RECENT_DAYS + 1) }),
  ];

  it('shows only favourites', () => {
    expect(names(searchPrompts(library, { filter: 'favourites' }))).toEqual(['Starred']);
  });

  it('shows only recent use, latest first', () => {
    expect(names(searchPrompts(library, { filter: 'recent' }))).toEqual([
      'Used today',
      'Used last week',
    ]);
  });

  it('keeps the tab order otherwise', () => {
    expect(names(searchPrompts(library, { filter: 'all' }))).toEqual([
      'Starred',
      'Plain',
      'Used today',
      'Used last week',
      'Used long ago',
    ]);
  });

  it('narrows to one tag', () => {
    const tagged = [
      prompt({ id: 'p1', name: 'Tagged', tags: ['Security', 'M365'] }),
      prompt({ id: 'p2', name: 'Other', tags: ['Writing'] }),
    ];

    expect(names(searchPrompts(tagged, { tag: 'Security' }))).toEqual(['Tagged']);
  });

  it('combines a tag with a query', () => {
    const tagged = [
      prompt({ id: 'p1', name: 'Tenant review', tags: ['Security'] }),
      prompt({ id: 'p2', name: 'Tenant notes', tags: ['Writing'] }),
    ];

    expect(names(searchPrompts(tagged, { tag: 'Security', query: 'tenant' }))).toEqual([
      'Tenant review',
    ]);
  });
});

describe('what counts as recent', () => {
  it('excludes a prompt never used', () => {
    expect(isRecent(prompt())).toBe(false);
  });

  it('excludes an unreadable timestamp rather than throwing', () => {
    expect(isRecent(prompt({ lastUsedAt: 'not a date' }))).toBe(false);
  });

  it('includes the last day inside the window', () => {
    expect(isRecent(prompt({ lastUsedAt: daysAgo(RECENT_DAYS - 0.5) }))).toBe(true);
  });

  it('excludes the day past it', () => {
    expect(isRecent(prompt({ lastUsedAt: daysAgo(RECENT_DAYS + 0.5) }))).toBe(false);
  });
});

describe('tags', () => {
  it('lists each one once, sorted', () => {
    const library = [
      prompt({ id: 'p1', tags: ['Writing', 'Security'] }),
      prompt({ id: 'p2', tags: ['Security', 'M365'] }),
    ];

    expect(collectTags(library)).toEqual(['M365', 'Security', 'Writing']);
  });

  it('adds a new one', () => {
    expect(addTag(['Security'], 'Writing')).toEqual(['Security', 'Writing']);
  });

  it('trims what was typed', () => {
    expect(addTag([], '  Security  ')).toEqual(['Security']);
  });

  it('ignores a blank', () => {
    const tags = ['Security'];
    expect(addTag(tags, '   ')).toBe(tags);
  });

  it('ignores one that differs only in case', () => {
    const tags = ['Security'];
    expect(addTag(tags, 'security')).toBe(tags);
  });
});
