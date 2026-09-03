/**
 * Row mapping for prompts and library items
 *
 * SQLite hands back untyped rows with JSON in two columns. Doing the cast and
 * the parse in one named place means a route reads rows rather than asserting
 * `as any` and hoping — and a column rename becomes a compile error here rather
 * than undefined at runtime.
 *
 * Kept out of the route files because a Next.js route module may only export
 * request handlers.
 */

import type { Prompt, StoredSection } from '@/types';

/** A prompts row, as the SELECTs in the prompt routes shape it. */
export type PromptRow = {
  id: string;
  name: string;
  sections: string | null;
  variables: string | null;
  num: number | null;
  created_at?: string;
  updated_at?: string;
};

/** A component_library row, as the component routes shape it. */
export type ComponentRow = {
  id: string;
  parent_id: string | null;
  name: string;
  item_type: 'folder' | 'component';
  content: string | null;
  component_type: string | null;
  is_expanded: number | null;
  created_at?: string;
  updated_at?: string;
};

/** The library item shape the single-item routes return. */
export type ComponentResponse = Omit<ComponentRow, 'is_expanded'> & { expanded?: boolean };

/** Reads a JSON column, falling back rather than throwing on a bad value. */
const parseJson = <T>(value: string | null, fallback: T): T => {
  if (!value) return fallback;

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

/**
 * Turns a prompts row into the prompt the API returns
 * @param row - A row from one of the prompt SELECTs
 */
export const toPrompt = (
  row: PromptRow
): Prompt & { created_at?: string; updated_at?: string } => ({
  ...row,
  sections: parseJson<StoredSection[]>(row.sections, []) as Prompt['sections'],
  variables: parseJson<Record<string, string>>(row.variables, {}),
});

/**
 * Turns a component_library row into the item the API returns
 *
 * `is_expanded` is stored as 0/1 and only means anything for a folder, so it
 * becomes a boolean `expanded` there and is dropped for a component.
 */
export const toComponentResponse = (row: ComponentRow): ComponentResponse => {
  const { is_expanded, ...rest } = row;

  return row.item_type === 'folder' ? { ...rest, expanded: is_expanded === 1 } : rest;
};
