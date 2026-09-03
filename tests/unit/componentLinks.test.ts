/**
 * L5: editing a component that prompts follow changes those prompts too, which
 * is invisible from the component editor. These cover what the warning counts
 * and what it says.
 */
import { describe, expect, it } from 'vitest';
import type { Prompt, Section } from '@/types';
import { buildPrompt } from '../support/buildPrompt';
import { describeComponentUsage, findComponentUsage } from '@/domain/componentLinks';

const section = (id: string, overrides: Partial<Section> = {}): Section => ({
  id,
  name: id,
  content: id,
  type: 'instruction',
  open: true,
  dirty: false,
  ...overrides,
});

const promptWith = (name: string, sections: Section[]): Prompt =>
  buildPrompt({ id: `prompt-${name}`, name, sections });

const linked = (id: string) => section(id, { linkedComponentId: 'component-1', linked: true });
const copied = (id: string) => section(id, { linkedComponentId: 'component-1', linked: false });

describe('finding where a component is used', () => {
  it('counts only the sections that follow it', () => {
    const prompts = [promptWith('One', [linked('a'), copied('b'), section('c')])];

    const usage = findComponentUsage(prompts, 'component-1');

    expect(usage.linkedSections).toBe(1);
    expect(usage.copiedSections).toBe(1);
    expect(usage.linkedPrompts).toEqual(['One']);
  });

  it('names each prompt once, however many of its sections are linked', () => {
    const prompts = [
      promptWith('One', [linked('a'), linked('b')]),
      promptWith('Two', [linked('c')]),
    ];

    const usage = findComponentUsage(prompts, 'component-1');

    expect(usage.linkedSections).toBe(3);
    expect(usage.linkedPrompts).toEqual(['One', 'Two']);
  });

  it('ignores sections that came from a different component', () => {
    const prompts = [
      promptWith('One', [section('a', { linkedComponentId: 'component-2', linked: true })]),
    ];

    expect(findComponentUsage(prompts, 'component-1').linkedSections).toBe(0);
  });

  it('reports nothing for a component only ever copied', () => {
    const prompts = [promptWith('One', [copied('a'), copied('b')])];

    const usage = findComponentUsage(prompts, 'component-1');

    expect(usage.linkedSections).toBe(0);
    expect(usage.copiedSections).toBe(2);
  });
});

describe('what the user is told', () => {
  it('says nothing when no section follows the component', () => {
    const prompts = [promptWith('One', [copied('a')])];

    expect(describeComponentUsage(findComponentUsage(prompts, 'component-1'))).toBeNull();
  });

  it('names the prompt when only one is affected', () => {
    const prompts = [promptWith('Assessment', [linked('a')])];

    expect(describeComponentUsage(findComponentUsage(prompts, 'component-1'))).toBe(
      'Saving will also change 1 section in "Assessment", which follow this component.'
    );
  });

  it('counts the prompts when more than one is affected', () => {
    const prompts = [
      promptWith('One', [linked('a'), linked('b')]),
      promptWith('Two', [linked('c')]),
    ];

    expect(describeComponentUsage(findComponentUsage(prompts, 'component-1'))).toBe(
      'Saving will also change 3 sections in 2 prompts, which follow this component.'
    );
  });
});
