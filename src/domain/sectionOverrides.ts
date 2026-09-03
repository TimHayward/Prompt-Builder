/**
 * Temporary section overrides
 *
 * A change made for the current use of a prompt, rather than to the prompt
 * itself. Overrides live in the workspace beside the working values, keyed by
 * section id, and are applied on the way to the compiler — never written back
 * into the stored sections.
 */

import type { Section } from '@/types';

/** Section text changed for this use only, keyed by section id. */
export type SectionOverrides = Record<string, string>;

/**
 * The text a section resolves with
 * @param section - The stored section
 * @param overrides - Everything changed for this use
 */
export const effectiveContent = (
  section: Pick<Section, 'id' | 'content'>,
  overrides: SectionOverrides
): string => overrides[section.id] ?? section.content;

/**
 * Applies the overrides so the compiler sees what this use asks for
 * @param sections - The prompt's stored sections
 * @param overrides - Everything changed for this use
 * @returns The sections with overridden text substituted, order untouched
 */
export const applySectionOverrides = <T extends Pick<Section, 'id' | 'content'>>(
  sections: T[],
  overrides: SectionOverrides
): T[] => {
  // Nothing changed for this use is the common case, and it should cost nothing.
  if (Object.keys(overrides).length === 0) return sections;

  return sections.map(section =>
    section.id in overrides ? { ...section, content: overrides[section.id] } : section
  );
};

/**
 * Records a change made for this use
 *
 * Text identical to the source is not an override: keeping one would leave the
 * section marked as changed when it says exactly what the prompt says.
 *
 * @param overrides - Everything changed for this use so far
 * @param section - The stored section being edited
 * @param text - What the user has typed
 * @returns The new overrides
 */
export const setOverride = (
  overrides: SectionOverrides,
  section: Pick<Section, 'id' | 'content'>,
  text: string
): SectionOverrides => {
  const { [section.id]: _removed, ...rest } = overrides;

  return text === section.content ? rest : { ...rest, [section.id]: text };
};

/**
 * Drops one section's override, returning it to what the prompt says
 * @param overrides - Everything changed for this use
 * @param sectionId - The section to revert
 */
export const clearOverride = (overrides: SectionOverrides, sectionId: string): SectionOverrides => {
  const { [sectionId]: _removed, ...rest } = overrides;
  return rest;
};

/** How many sections this use has changed. */
export const countOverrides = (overrides: SectionOverrides): number =>
  Object.keys(overrides).length;
