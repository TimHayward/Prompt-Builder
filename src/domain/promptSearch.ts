/**
 * Prompt search and filtering
 *
 * Pure functions over the prompts already in memory. The whole library is
 * loaded on start — it is one row per prompt, sections included — so searching
 * it here is instant and needs no round trip. SQLite's FTS5 was considered and
 * left alone: it would mean a shadow table and triggers kept in step with every
 * write, to search a list that fits in a variable.
 *
 * Everything here is case-insensitive, and matches on a substring rather than a
 * whole word, so "sec" finds "Security".
 */

import type { Prompt } from '@/types';
import { extractVariableSpecsFromSections } from '@/utils/variableUtils';

/** Which prompts the browser is showing. */
export type PromptFilter = 'all' | 'favourites' | 'recent';

/** Where a prompt matched, for showing why it is in the results. */
export type MatchField = 'name' | 'description' | 'tag' | 'section' | 'variable';

export type PromptMatch = {
  prompt: Prompt;
  /** The fields that matched, in the order listed above. */
  fields: MatchField[];
};

/** Prompts used within this many days count as recent. */
export const RECENT_DAYS = 14;

const contains = (haystack: string, needle: string) =>
  haystack.toLowerCase().includes(needle.toLowerCase());

/**
 * Where a prompt matches a query
 * @param prompt - The prompt to test
 * @param query - Text the user typed; already trimmed and non-empty
 * @returns Each field that matched, empty when none did
 */
const matchFields = (prompt: Prompt, query: string): MatchField[] => {
  const fields: MatchField[] = [];

  if (contains(prompt.name, query)) fields.push('name');
  if (contains(prompt.description, query)) fields.push('description');
  if (prompt.tags.some(tag => contains(tag, query))) fields.push('tag');

  const inSections = prompt.sections.some(
    section => contains(section.name, query) || contains(section.content, query)
  );
  if (inSections) fields.push('section');

  // Variable names are worth searching: they are how a prompt says what it
  // needs, and are often what someone remembers about it. Both the key and the
  // label count — a labelled choice list is known by its label.
  const variables = extractVariableSpecsFromSections(prompt.sections);
  if (variables.some(spec => contains(spec.key, query) || contains(spec.label, query))) {
    fields.push('variable');
  }

  return fields;
};

/**
 * Whether a prompt was used recently enough to show under "Recent"
 * @param prompt - The prompt to test
 * @param now - The moment to measure from, injectable for tests
 */
export const isRecent = (prompt: Prompt, now: Date = new Date()): boolean => {
  if (!prompt.lastUsedAt) return false;

  const used = Date.parse(prompt.lastUsedAt);
  if (Number.isNaN(used)) return false;

  return now.getTime() - used <= RECENT_DAYS * 24 * 60 * 60 * 1000;
};

/**
 * Orders prompts for one filter
 *
 * Recent puts the latest use first; the other two keep the tab order, so the
 * browser reads the same way round as the tabs above it.
 */
const sortFor = (filter: PromptFilter, prompts: Prompt[]): Prompt[] => {
  if (filter !== 'recent') return prompts;

  return [...prompts].sort((a, b) => (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? ''));
};

/**
 * The prompts a filter and query select
 * @param prompts - Every prompt loaded
 * @param options - The active filter, the query, and any tag being filtered on
 * @returns Matches, each carrying the fields that matched
 */
export const searchPrompts = (
  prompts: Prompt[],
  options: { filter?: PromptFilter; query?: string; tag?: string | null; now?: Date } = {}
): PromptMatch[] => {
  const { filter = 'all', query = '', tag = null, now } = options;
  const trimmed = query.trim();

  const inFilter = prompts.filter(prompt => {
    if (filter === 'favourites' && !prompt.isFavourite) return false;
    if (filter === 'recent' && !isRecent(prompt, now)) return false;
    if (tag && !prompt.tags.includes(tag)) return false;
    return true;
  });

  return sortFor(filter, inFilter)
    .map(prompt => ({ prompt, fields: trimmed ? matchFields(prompt, trimmed) : [] }))
    .filter(match => !trimmed || match.fields.length > 0);
};

/**
 * Every tag in use, sorted, each appearing once
 * @param prompts - Every prompt loaded
 */
export const collectTags = (prompts: Prompt[]): string[] =>
  [...new Set(prompts.flatMap(prompt => prompt.tags))].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' })
  );

/**
 * Adds a tag to a list, ignoring blanks and repeats
 * @param tags - The tags already on the prompt
 * @param candidate - What the user typed
 * @returns The new list, or the original when nothing should change
 */
export const addTag = (tags: string[], candidate: string): string[] => {
  const tag = candidate.trim();

  // A tag differing only in case is the same tag; keeping both would split a
  // group in two for no reason the user can see.
  if (!tag || tags.some(existing => existing.toLowerCase() === tag.toLowerCase())) return tags;

  return [...tags, tag];
};
