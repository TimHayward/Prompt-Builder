/**
 * Prompt mutations
 *
 * Every change a user can make to a prompt, as a pure function from one prompt
 * to the next. No React, no persistence: the context decides when to apply one
 * and what to do with the result, and these decide what the result is.
 *
 * Returning the prompt unchanged is how a mutation says "nothing to do" — the
 * caller can compare by reference.
 */

import { v4 as uuidv4 } from 'uuid';
import type { ComponentType, Prompt, Section, SectionTypeValue } from '@/types';

/** Builds an empty section of the given type. */
export const newSection = (type: SectionTypeValue, name = 'New Section'): Section => ({
  id: uuidv4(),
  name,
  content: '',
  type,
  open: true,
  dirty: false,
});

/**
 * Builds a section from a library component
 *
 * Inserted as a copy: the origin is remembered, but later edits to the
 * component do not reach this section unless the user links it.
 */
export const sectionFromComponent = (component: ComponentType): Section => ({
  id: uuidv4(),
  name: component.name,
  content: component.content || '',
  type: component.componentType || 'instruction',
  open: true,
  dirty: false,
  linkedComponentId: component.id,
  linked: false,
  originalContent: component.content || '',
});

export const renamePrompt = (prompt: Prompt, name: string): Prompt => ({ ...prompt, name });

/** Sets what the prompt is for. */
export const describePrompt = (prompt: Prompt, description: string): Prompt => ({
  ...prompt,
  description,
});

/** Marks or unmarks a favourite. */
export const toggleFavourite = (prompt: Prompt): Prompt => ({
  ...prompt,
  isFavourite: !prompt.isFavourite,
});

/** Replaces the prompt's tags. */
export const setTags = (prompt: Prompt, tags: string[]): Prompt => ({ ...prompt, tags });

/** Records that the prompt has just been used. */
export const markUsed = (prompt: Prompt, at: string): Prompt => ({ ...prompt, lastUsedAt: at });

export const appendSection = (prompt: Prompt, section: Section): Prompt => ({
  ...prompt,
  sections: [...prompt.sections, section],
});

export const insertSectionAt = (prompt: Prompt, section: Section, index: number): Prompt => {
  const sections = [...prompt.sections];
  sections.splice(index, 0, section);
  return { ...prompt, sections };
};

export const removeSection = (prompt: Prompt, sectionId: string): Prompt => ({
  ...prompt,
  sections: prompt.sections.filter(section => section.id !== sectionId),
});

/**
 * Applies changes to one section
 *
 * An edit marks the section dirty unless the caller says otherwise, which is
 * how saving a section back to its component clears the flag.
 */
export const updateSectionIn = (
  prompt: Prompt,
  sectionId: string,
  updates: Partial<Omit<Section, 'id'>>
): Prompt => ({
  ...prompt,
  sections: prompt.sections.map(section =>
    section.id === sectionId ? { ...section, ...updates, dirty: updates.dirty ?? true } : section
  ),
});

/** Flips a section's open state. Editor-only: it is not part of the prompt. */
export const toggleSection = (prompt: Prompt, sectionId: string): Prompt => ({
  ...prompt,
  sections: prompt.sections.map(section =>
    section.id === sectionId ? { ...section, open: !section.open } : section
  ),
});

/** Moves a section one place up or down; unchanged at either end. */
export const moveSection = (
  prompt: Prompt,
  sectionId: string,
  direction: 'up' | 'down'
): Prompt => {
  const index = prompt.sections.findIndex(section => section.id === sectionId);
  if (index === -1) return prompt;

  const newIndex = direction === 'up' ? index - 1 : index + 1;
  if (newIndex < 0 || newIndex >= prompt.sections.length) return prompt;

  const sections = [...prompt.sections];
  const [moved] = sections.splice(index, 1);
  sections.splice(newIndex, 0, moved);
  return { ...prompt, sections };
};

/** Moves a section to an explicit position, as a drag does. */
export const moveSectionToIndex = (prompt: Prompt, sectionId: string, newIndex: number): Prompt => {
  const oldIndex = prompt.sections.findIndex(section => section.id === sectionId);
  if (oldIndex === -1) return prompt;

  const sections = [...prompt.sections];
  const [moved] = sections.splice(oldIndex, 1);
  sections.splice(newIndex, 0, moved);
  return { ...prompt, sections };
};

/** Pulls a linked component's current text into the section that follows it. */
export const applyComponentToSection = (
  prompt: Prompt,
  sectionId: string,
  component: ComponentType
): Prompt =>
  updateSectionIn(prompt, sectionId, {
    content: component.content || '',
    type: component.componentType,
    linkedComponentId: component.id,
    name: component.name, // The section takes the component's name too
    dirty: true,
  });

/**
 * Copies a prompt's sections for a duplicate
 *
 * New ids, and no editor state carried over: a duplicate is a fresh prompt that
 * happens to start with the same text.
 */
export const copySectionsForDuplicate = (sections: Section[]): Section[] =>
  sections.map(section => ({
    ...section,
    id: uuidv4(),
    dirty: false,
    editingHeader: false,
    editingHeaderTempName: undefined,
    editingHeaderTempType: undefined,
  }));
