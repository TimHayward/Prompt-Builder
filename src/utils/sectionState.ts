/**
 * The boundary between a stored section and the one the editor works with
 *
 * Sections carry editor state — whether they are expanded, whether they have
 * unsaved changes against their linked component, whether the header is being
 * renamed. None of that belongs in the prompt, so it is added on load and taken
 * off again on save, in one place rather than at each call site.
 */

import type { Section, SectionUiState, StoredSection } from '@/types';

/** How a section looks when a prompt is first loaded. */
const DEFAULT_UI_STATE: SectionUiState = {
  open: true,
  dirty: false,
};

/**
 * Strips editor state from a section
 * @param section - The section as the editor holds it
 * @returns Only the fields that belong on the stored prompt
 */
export const toStoredSection = (section: Section): StoredSection => {
  const stored: StoredSection = {
    id: section.id,
    name: section.name,
    content: section.content,
    type: section.type,
  };

  // Optional fields are omitted rather than stored as undefined, so the JSON
  // written to the database stays as small as the section really is.
  if (section.linkedComponentId !== undefined) {
    stored.linkedComponentId = section.linkedComponentId;
  }
  if (section.originalContent !== undefined) {
    stored.originalContent = section.originalContent;
  }

  return stored;
};

/**
 * Adds editor state to a stored section
 * @param section - A section as read from the API
 * @param uiState - Overrides for the defaults, e.g. to keep a section collapsed
 */
export const toEditorSection = (
  section: StoredSection | Section,
  uiState?: Partial<SectionUiState>
): Section => ({
  ...toStoredSection(section as Section),
  ...DEFAULT_UI_STATE,
  ...uiState,
});

/** Applies toEditorSection across a prompt's sections. */
export const toEditorSections = (sections: (StoredSection | Section)[]): Section[] =>
  sections.map(section => toEditorSection(section));

/** Applies toStoredSection across a prompt's sections. */
export const toStoredSections = (sections: Section[]): StoredSection[] =>
  sections.map(toStoredSection);
