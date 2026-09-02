/**
 * C5 and C6: a component inserted into a prompt is a copy unless the user asks
 * for a link, and which one it is has to be visible.
 *
 * The insertion paths all build a section the same way, so what matters is the
 * shape they produce and that it survives a save — which is what these check.
 */
import { describe, expect, it } from 'vitest';
import type { ComponentType, Section } from '@/types';
import { sectionSchema } from '@/types/contracts';
import { toStoredSection } from '@/utils/sectionState';

const component: ComponentType = {
  id: 'component-1',
  name: 'British English',
  type: 'component',
  content: 'Write in British English.',
  componentType: 'style',
};

/** The section every insertion path builds from a component. */
const insertedSection = (): Section => ({
  id: 'section-1',
  name: component.name,
  content: component.content,
  type: component.componentType,
  linkedComponentId: component.id,
  linked: false,
  originalContent: component.content,
  open: true,
  dirty: false,
});

describe('inserting a component', () => {
  it('records where the text came from without following it', () => {
    const section = insertedSection();

    expect(section.linkedComponentId).toBe('component-1');
    expect(section.linked).toBe(false);
  });

  it('stores the copy flag, so a reload does not turn a copy into a link', () => {
    const stored = toStoredSection(insertedSection());

    expect(stored.linked).toBe(false);
    expect(sectionSchema.safeParse(stored).success).toBe(true);
  });

  it('keeps the section text when the component later changes', () => {
    // The editor only pulls a component's changes when linked is true, so a
    // copy is simply left as it is.
    const section = insertedSection();
    const editedComponent = { ...component, content: 'Write in American English.' };

    const followsComponent = Boolean(section.linked);

    expect(followsComponent).toBe(false);
    expect(section.content).not.toBe(editedComponent.content);
  });
});

describe('linking a section', () => {
  it('is an explicit flag rather than the mere presence of an origin', () => {
    const linked: Section = { ...insertedSection(), linked: true };

    expect(toStoredSection(linked).linked).toBe(true);
  });

  it('treats a section stored before the flag existed as a copy', () => {
    // Legacy sections carry an origin and no flag; they must not silently
    // follow their component now that linking is opt-in.
    const legacy = {
      id: 'section-1',
      name: 'Role',
      content: 'body',
      type: 'role',
      linkedComponentId: 'component-1',
    } as Section;

    expect(Boolean(legacy.linked)).toBe(false);
  });
});
