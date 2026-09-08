/**
 * Whether a framework component can be removed.
 *
 * This is the guard against the one edit that can orphan data. A section stores
 * a component's id, so deleting the component leaves that section pointing at
 * nothing — it would still render, with the default label and colour, quietly
 * losing what the section was for.
 */
import { describe, expect, it } from 'vitest';
import { describeTypeUsage, findTypeUsage, isTypeInUse } from '@/domain/frameworkUsage';
import type { ComponentType, FolderType, Prompt, Section } from '@/types';
import { buildPrompt } from '../support/buildPrompt';

const section = (id: string, type: string): Section => ({
  id,
  name: id,
  content: 'text',
  type,
  open: true,
  dirty: false,
});

const component = (id: string, componentType: string): ComponentType => ({
  id,
  name: id,
  type: 'component',
  content: 'text',
  componentType,
});

const folder = (id: string, children: (FolderType | ComponentType)[] = []): FolderType => ({
  id,
  name: id,
  type: 'folder',
  children,
  expanded: true,
});

const EMPTY_TREE: FolderType[] = [folder('root')];
const NO_PROMPTS: Prompt[] = [];

describe('findTypeUsage', () => {
  it('finds nothing for a component nobody uses', () => {
    const usage = findTypeUsage(NO_PROMPTS, EMPTY_TREE, 'audience');

    expect(usage).toEqual({ sections: 0, prompts: [], libraryComponents: 0 });
    expect(isTypeInUse(usage)).toBe(false);
  });

  it('counts sections and names the prompts holding them', () => {
    const prompts = [
      buildPrompt({ id: 'p1', name: 'Incident report', sections: [section('s1', 'role')] }),
      buildPrompt({
        id: 'p2',
        name: 'Handover',
        sections: [section('s2', 'role'), section('s3', 'role')],
      }),
    ];

    const usage = findTypeUsage(prompts, EMPTY_TREE, 'role');

    expect(usage.sections).toBe(3);
    expect(usage.prompts).toEqual(['Incident report', 'Handover']);
  });

  it('names a prompt once however many of its sections match', () => {
    const prompts = [
      buildPrompt({
        id: 'p1',
        name: 'Handover',
        sections: [section('s1', 'role'), section('s2', 'role')],
      }),
    ];

    expect(findTypeUsage(prompts, EMPTY_TREE, 'role').prompts).toEqual(['Handover']);
  });

  it('ignores prompts using other components', () => {
    const prompts = [
      buildPrompt({ id: 'p1', name: 'Other', sections: [section('s1', 'context')] }),
    ];

    expect(isTypeInUse(findTypeUsage(prompts, EMPTY_TREE, 'role'))).toBe(false);
  });

  it('counts library components at any depth', () => {
    const tree = [
      folder('root', [
        component('c1', 'role'),
        folder('nested', [component('c2', 'role'), component('c3', 'style')]),
      ]),
    ];

    expect(findTypeUsage(NO_PROMPTS, tree, 'role').libraryComponents).toBe(2);
  });

  it('is in use when only the library uses it, with no prompt at all', () => {
    // The case that caught a wrong assumption in testing: a built-in type can
    // be used by the starter kit while no prompt mentions it.
    const tree = [folder('root', [component('c1', 'format')])];
    const usage = findTypeUsage(NO_PROMPTS, tree, 'format');

    expect(usage.sections).toBe(0);
    expect(isTypeInUse(usage)).toBe(true);
  });

  it('does not confuse a section type with the component it was copied from', () => {
    // section.type and section.linkedComponentId are unrelated fields that both
    // hold ids. Matching the wrong one is why componentLinks could not be
    // reused here.
    const prompts = [
      buildPrompt({
        id: 'p1',
        name: 'Copied',
        sections: [{ ...section('s1', 'context'), linkedComponentId: 'role' }],
      }),
    ];

    expect(isTypeInUse(findTypeUsage(prompts, EMPTY_TREE, 'role'))).toBe(false);
  });
});

describe('describeTypeUsage', () => {
  it('says nothing when the component is free to remove', () => {
    expect(describeTypeUsage(findTypeUsage(NO_PROMPTS, EMPTY_TREE, 'audience'), 'Audience')).toBe(
      null
    );
  });

  it('names the prompt when only one holds it', () => {
    const prompts = [
      buildPrompt({ id: 'p1', name: 'Incident report', sections: [section('s1', 'role')] }),
    ];

    const message = describeTypeUsage(findTypeUsage(prompts, EMPTY_TREE, 'role'), 'Role');

    expect(message).toBe(
      '"Role" is still used by 1 section in "Incident report", so it cannot be removed.'
    );
  });

  it('counts the prompts when several hold it', () => {
    const prompts = [
      buildPrompt({ id: 'p1', name: 'One', sections: [section('s1', 'role')] }),
      buildPrompt({ id: 'p2', name: 'Two', sections: [section('s2', 'role')] }),
    ];

    expect(describeTypeUsage(findTypeUsage(prompts, EMPTY_TREE, 'role'), 'Role')).toContain(
      '2 sections in 2 prompts'
    );
  });

  it('mentions the library as well as the prompts', () => {
    const prompts = [buildPrompt({ id: 'p1', name: 'One', sections: [section('s1', 'role')] })];
    const tree = [folder('root', [component('c1', 'role')])];

    expect(describeTypeUsage(findTypeUsage(prompts, tree, 'role'), 'Role')).toBe(
      '"Role" is still used by 1 section in "One" and 1 library component, so it cannot be removed.'
    );
  });

  it('mentions the library alone when no prompt uses it', () => {
    const tree = [folder('root', [component('c1', 'format'), component('c2', 'format')])];

    expect(describeTypeUsage(findTypeUsage(NO_PROMPTS, tree, 'format'), 'Format')).toBe(
      '"Format" is still used by 2 library components, so it cannot be removed.'
    );
  });
});
