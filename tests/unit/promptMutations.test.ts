/**
 * The prompt mutations, now that they are pure functions rather than closures
 * inside the context. Each one is a transformation from one prompt to the next,
 * so it can be checked without rendering anything.
 */
import { describe, expect, it } from 'vitest';
import type { ComponentType, Prompt, Section } from '@/types';
import {
  appendSection,
  applyComponentToSection,
  copySectionsForDuplicate,
  insertSectionAt,
  moveSection,
  moveSectionToIndex,
  newSection,
  removeSection,
  renamePrompt,
  sectionFromComponent,
  toggleSection,
  updateSectionIn,
} from '@/domain/promptMutations';

const section = (id: string, overrides: Partial<Section> = {}): Section => ({
  id,
  name: id,
  content: id,
  type: 'instruction',
  open: true,
  dirty: false,
  ...overrides,
});

const promptWith = (...ids: string[]): Prompt => ({
  id: 'prompt-1',
  num: 1,
  name: 'A prompt',
  description: '',
  isFavourite: false,
  tags: [],
  lastUsedAt: null,
  sections: ids.map(id => section(id)),
  variables: {},
});

const ids = (prompt: Prompt) => prompt.sections.map(s => s.id);

describe('moving a section', () => {
  it('moves it up', () => {
    expect(ids(moveSection(promptWith('a', 'b', 'c'), 'c', 'up'))).toEqual(['a', 'c', 'b']);
  });

  it('moves it down', () => {
    expect(ids(moveSection(promptWith('a', 'b', 'c'), 'a', 'down'))).toEqual(['b', 'a', 'c']);
  });

  it('leaves the prompt untouched at the top', () => {
    const prompt = promptWith('a', 'b');
    expect(moveSection(prompt, 'a', 'up')).toBe(prompt);
  });

  it('leaves the prompt untouched at the bottom', () => {
    const prompt = promptWith('a', 'b');
    expect(moveSection(prompt, 'b', 'down')).toBe(prompt);
  });

  it('leaves the prompt untouched for an unknown section', () => {
    const prompt = promptWith('a');
    expect(moveSection(prompt, 'missing', 'up')).toBe(prompt);
  });

  it('moves it to an explicit index, as a drag does', () => {
    expect(ids(moveSectionToIndex(promptWith('a', 'b', 'c'), 'a', 2))).toEqual(['b', 'c', 'a']);
  });
});

describe('adding and removing sections', () => {
  it('appends to the end', () => {
    expect(ids(appendSection(promptWith('a'), section('b')))).toEqual(['a', 'b']);
  });

  it('inserts in the middle', () => {
    expect(ids(insertSectionAt(promptWith('a', 'c'), section('b'), 1))).toEqual(['a', 'b', 'c']);
  });

  it('removes by id', () => {
    expect(ids(removeSection(promptWith('a', 'b'), 'a'))).toEqual(['b']);
  });

  it('does not change the original prompt', () => {
    const prompt = promptWith('a');
    appendSection(prompt, section('b'));
    expect(ids(prompt)).toEqual(['a']);
  });
});

describe('editing a section', () => {
  it('applies the changes and marks it dirty', () => {
    const updated = updateSectionIn(promptWith('a'), 'a', { content: 'edited' });

    expect(updated.sections[0].content).toBe('edited');
    expect(updated.sections[0].dirty).toBe(true);
  });

  it('lets the caller clear dirty, as saving to the library does', () => {
    const updated = updateSectionIn(promptWith('a'), 'a', { dirty: false });

    expect(updated.sections[0].dirty).toBe(false);
  });

  it('toggles open without touching anything else', () => {
    const toggled = toggleSection(promptWith('a'), 'a');

    expect(toggled.sections[0].open).toBe(false);
    expect(toggled.sections[0].content).toBe('a');
  });
});

describe('sections from components', () => {
  const component: ComponentType = {
    id: 'component-1',
    name: 'British English',
    type: 'component',
    content: 'Write in British English.',
    componentType: 'style',
  };

  it('inserts as a copy that remembers where it came from', () => {
    const created = sectionFromComponent(component);

    expect(created.content).toBe(component.content);
    expect(created.linkedComponentId).toBe('component-1');
    expect(created.linked).toBe(false);
  });

  it('pulls the component into a section that follows it', () => {
    const updated = applyComponentToSection(promptWith('a'), 'a', component);

    expect(updated.sections[0].name).toBe('British English');
    expect(updated.sections[0].content).toBe('Write in British English.');
    expect(updated.sections[0].type).toBe('style');
  });
});

describe('duplicating', () => {
  it('gives every section a new id and drops editor state', () => {
    const original = [
      section('a', { dirty: true, editingHeader: true, editingHeaderTempName: 'half typed' }),
    ];

    const [copy] = copySectionsForDuplicate(original);

    expect(copy.id).not.toBe('a');
    expect(copy.content).toBe('a');
    expect(copy.dirty).toBe(false);
    expect(copy.editingHeader).toBe(false);
    expect(copy.editingHeaderTempName).toBeUndefined();
  });
});

describe('renaming', () => {
  it('changes only the name', () => {
    const renamed = renamePrompt(promptWith('a'), 'New name');

    expect(renamed.name).toBe('New name');
    expect(ids(renamed)).toEqual(['a']);
  });
});

describe('newSection', () => {
  it('starts empty, open and clean', () => {
    const created = newSection('role');

    expect(created).toMatchObject({ type: 'role', content: '', open: true, dirty: false });
    expect(created.id).toBeTruthy();
  });
});
