/**
 * N1, N2 and N3: what a prompt amounts to, and what looks wrong with it.
 *
 * Every rule here is deterministic, so each one gets a case that trips it and
 * a case that does not.
 */
import { describe, expect, it } from 'vitest';
import { estimateTokens, lintPrompt, promptStatistics } from '@/domain/promptAnalysis';
import type { Section } from '@/types';

const section = (overrides: Partial<Section> = {}): Section => ({
  id: 's1',
  name: 'Instruction',
  content: 'Write something.',
  type: 'instruction',
  open: true,
  dirty: false,
  ...overrides,
});

const lint = (
  sections: Section[],
  values: Record<string, string> = {},
  components: string[] = []
) =>
  lintPrompt({
    prompt: { sections },
    values,
    componentIds: new Set(components),
  });

const rules = (sections: Section[], values?: Record<string, string>, components?: string[]) =>
  lint(sections, values, components).map(finding => finding.rule);

describe('estimating tokens', () => {
  it('is zero for nothing', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('   ')).toBe(0);
  });

  it('charges a short word one token', () => {
    expect(estimateTokens('the')).toBe(1);
    expect(estimateTokens('a')).toBe(1);
  });

  it('charges a long word more', () => {
    // 'comprehensive' is 13 characters, so four tokens at four characters each.
    expect(estimateTokens('comprehensive')).toBe(4);
  });

  it('adds up across a sentence', () => {
    // Review 2, the 1, Intune 2, estate 2.
    expect(estimateTokens('Review the Intune estate')).toBe(7);
  });

  it('ignores how the whitespace is arranged', () => {
    expect(estimateTokens('one two')).toBe(estimateTokens('one\n\n   two'));
  });
});

describe('counting a prompt', () => {
  it('reports what the panel shows', () => {
    const sections = [
      section({ content: 'Assess {{customer}} carefully.' }),
      section({ id: 's2', content: 'Be brief.' }),
    ];

    const stats = promptStatistics('Assess Contoso carefully. Be brief.', sections);

    expect(stats).toEqual({
      characters: 35,
      words: 5,
      sections: 2,
      variables: 1,
      estimatedTokens: estimateTokens('Assess Contoso carefully. Be brief.'),
    });
  });

  it('does not count a section with nothing in it', () => {
    const sections = [section(), section({ id: 's2', content: '   ' })];

    expect(promptStatistics('Write something.', sections).sections).toBe(1);
  });

  it('counts a repeated variable once', () => {
    const sections = [section({ content: '{{customer}} and {{customer}} again' })];

    expect(promptStatistics('x', sections).variables).toBe(1);
  });
});

describe('unpopulated variables', () => {
  it('mentions one with no value', () => {
    expect(rules([section({ content: 'For {{customer}}.' })])).toContain('unpopulated-variable');
  });

  it('says nothing once it is filled', () => {
    const sections = [section({ content: 'For {{customer}}.' })];

    expect(rules(sections, { customer: 'Contoso' })).not.toContain('unpopulated-variable');
  });

  it('says nothing when the source supplies a default', () => {
    const sections = [section({ content: 'In a {{tone=formal}} voice.' })];

    expect(rules(sections)).not.toContain('unpopulated-variable');
  });

  it('warns rather than suggests when the variable is required', () => {
    const [finding] = lint([section({ content: 'For {{!customer}}.' })]);

    expect(finding.severity).toBe('warning');
    expect(finding.message).toContain('required');
  });
});

describe('a section that follows a missing component', () => {
  it('is reported', () => {
    const sections = [section({ linked: true, linkedComponentId: 'gone' })];

    expect(rules(sections, {}, [])).toContain('missing-linked-component');
  });

  it('is not reported while the component is there', () => {
    const sections = [section({ linked: true, linkedComponentId: 'component-1' })];

    expect(rules(sections, {}, ['component-1'])).not.toContain('missing-linked-component');
  });

  it('ignores a copy, which never followed anything', () => {
    const sections = [section({ linked: false, linkedComponentId: 'gone' })];

    expect(rules(sections, {}, [])).not.toContain('missing-linked-component');
  });
});

describe('duplicate sections', () => {
  it('reports the second one, naming the first', () => {
    const sections = [
      section({ id: 's1', name: 'First', content: 'Same words.' }),
      section({ id: 's2', name: 'Second', content: 'Same words.' }),
    ];

    const [finding] = lint(sections);

    expect(finding.rule).toBe('duplicate-section');
    expect(finding.sectionId).toBe('s2');
    expect(finding.message).toContain('"First"');
  });

  it('ignores a difference in surrounding whitespace only', () => {
    const sections = [
      section({ id: 's1', content: 'Same words.' }),
      section({ id: 's2', content: '  Same words.  ' }),
    ];

    expect(rules(sections)).toContain('duplicate-section');
  });

  it('says nothing about two empty sections', () => {
    const sections = [section({ id: 's1', content: '' }), section({ id: 's2', content: '' })];

    expect(rules(sections)).not.toContain('duplicate-section');
  });
});

describe('no output format', () => {
  it('is suggested when nothing says what the answer looks like', () => {
    expect(rules([section()])).toContain('no-output-format');
  });

  it('is satisfied by a format section', () => {
    const sections = [section(), section({ id: 's2', type: 'format', content: 'Bullet points.' })];

    expect(rules(sections)).not.toContain('no-output-format');
  });

  it('is satisfied by an output section', () => {
    const sections = [section(), section({ id: 's2', type: 'output', content: 'A table.' })];

    expect(rules(sections)).not.toContain('no-output-format');
  });

  it('says nothing about a prompt with no content at all', () => {
    expect(rules([section({ content: '' })])).not.toContain('no-output-format');
  });
});

describe('conflicting instructions', () => {
  it('notices a prompt asking for brief and comprehensive', () => {
    const sections = [
      section({ id: 's1', content: 'Be brief.' }),
      section({ id: 's2', content: 'Produce a comprehensive assessment.' }),
    ];

    const finding = lint(sections).find(f => f.rule === 'conflicting-instructions');

    expect(finding?.message).toBe('This prompt asks for both "brief" and "comprehensive".');
  });

  it('says nothing when only one side appears', () => {
    expect(rules([section({ content: 'Be brief.' })])).not.toContain('conflicting-instructions');
  });

  it('matches whole words only', () => {
    // "briefing" is not "brief".
    const sections = [
      section({ id: 's1', content: 'Read the briefing.' }),
      section({ id: 's2', content: 'Produce a detailed answer.' }),
    ];

    expect(rules(sections)).not.toContain('conflicting-instructions');
  });
});

describe('the order findings arrive in', () => {
  it('puts warnings before suggestions', () => {
    const sections = [
      section({ id: 's1', name: 'First', content: 'Same words.' }),
      section({ id: 's2', name: 'Second', content: 'Same words.' }),
    ];

    const severities = lint(sections).map(finding => finding.severity);

    expect(severities).toEqual([...severities].sort(a => (a === 'warning' ? -1 : 1)));
    expect(severities[0]).toBe('warning');
  });

  it('finds nothing wrong with a complete prompt', () => {
    const sections = [
      section({ content: 'Assess {{customer}}.' }),
      section({ id: 's2', type: 'format', content: 'Answer in bullet points.' }),
    ];

    expect(lint(sections, { customer: 'Contoso' })).toEqual([]);
  });
});
