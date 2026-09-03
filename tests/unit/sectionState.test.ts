/**
 * C4's acceptance: UI-only state is never serialised into stored prompt
 * content. The boundary helpers are checked here; the contract test covers the
 * server half, where the schema strips the same fields if a client sends them.
 */
import { describe, expect, it } from 'vitest';
import type { Section } from '@/types';
import {
  toEditorSection,
  toEditorSections,
  toStoredSection,
  toStoredSections,
} from '@/utils/sectionState';
import { sectionSchema } from '@/types/contracts';

const editorSection = (overrides: Partial<Section> = {}): Section => ({
  id: 's1',
  name: 'Role',
  content: 'You are a reviewer',
  type: 'role',
  open: false,
  dirty: true,
  editingHeader: true,
  editingHeaderTempName: 'Half-typed name',
  editingHeaderTempType: 'context',
  ...overrides,
});

describe('toStoredSection', () => {
  it('keeps only what belongs to the prompt', () => {
    expect(toStoredSection(editorSection())).toEqual({
      id: 's1',
      name: 'Role',
      content: 'You are a reviewer',
      type: 'role',
    });
  });

  it('keeps the link to a component and its original content', () => {
    const stored = toStoredSection(
      editorSection({ linkedComponentId: 'c1', originalContent: 'as inserted' })
    );

    expect(stored.linkedComponentId).toBe('c1');
    expect(stored.originalContent).toBe('as inserted');
  });

  it('omits optional fields rather than storing undefined', () => {
    expect(Object.keys(toStoredSection(editorSection()))).toEqual([
      'id',
      'name',
      'content',
      'type',
    ]);
  });

  it('produces sections the API contract accepts', () => {
    const result = sectionSchema.safeParse(toStoredSection(editorSection()));

    expect(result.success).toBe(true);
  });
});

describe('the API contract', () => {
  it('drops editor state a client sends anyway', () => {
    const parsed = sectionSchema.parse({
      id: 's1',
      name: 'Role',
      content: 'body',
      type: 'role',
      open: false,
      dirty: true,
      editingHeader: true,
    });

    expect(parsed).not.toHaveProperty('open');
    expect(parsed).not.toHaveProperty('dirty');
    expect(parsed).not.toHaveProperty('editingHeader');
  });
});

describe('toEditorSection', () => {
  it('opens a stored section clean', () => {
    const section = toEditorSection({ id: 's1', name: 'Role', content: 'body', type: 'role' });

    expect(section.open).toBe(true);
    expect(section.dirty).toBe(false);
    expect(section.editingHeader).toBeUndefined();
  });

  it('drops editor state left over on a section read back from the API', () => {
    // Prompts saved before the split still have open/dirty in their JSON.
    const legacy = {
      id: 's1',
      name: 'Role',
      content: 'body',
      type: 'role',
      open: false,
      dirty: true,
    } as Section;

    expect(toEditorSection(legacy)).toEqual({
      id: 's1',
      name: 'Role',
      content: 'body',
      type: 'role',
      open: true,
      dirty: false,
    });
  });

  it('round-trips the sections of a prompt through both directions', () => {
    const sections = [
      editorSection(),
      editorSection({ id: 's2', name: 'Context', type: 'context' }),
    ];

    const restored = toEditorSections(toStoredSections(sections));

    expect(restored.map(section => section.id)).toEqual(['s1', 's2']);
    expect(restored.every(section => section.open && !section.dirty)).toBe(true);
  });
});
