import { describe, expect, it } from 'vitest';
import { extractVariableSpecs, parseVariableToken, replaceVariables } from '@/utils/variableUtils';

describe('parseVariableToken', () => {
  it('reads a choice list', () => {
    expect(parseVariableToken('mail/teams/calendar')).toEqual({
      key: 'mail/teams/calendar',
      label: 'mail / teams / calendar',
      options: ['mail', 'teams', 'calendar'],
    });
  });

  it('drops a choice repeated inside one token', () => {
    // The dropdown renders one <option> per choice keyed on its text, so a
    // repeat would collide.
    const spec = parseVariableToken('Variables: VariableOne/VariableTwo/VariableOne');

    expect(spec?.options).toEqual(['VariableOne', 'VariableTwo']);
    expect(new Set(spec?.options).size).toBe(spec?.options.length);
  });

  it('keeps a labelled token keyed on its label', () => {
    expect(parseVariableToken('channel: mail/teams')).toEqual({
      key: 'channel',
      label: 'channel',
      options: ['mail', 'teams'],
    });
  });

  it('treats a token with no real choice list as free text', () => {
    expect(parseVariableToken('tone')).toEqual({ key: 'tone', label: 'tone', options: [] });
    expect(parseVariableToken('see https://example.com')?.options).toEqual([]);
  });
});

describe('extractVariableSpecs', () => {
  it('unions the choices of tokens sharing a key, without repeats', () => {
    const specs = extractVariableSpecs('{{channel: mail/teams}} then {{channel: teams/sms}}');

    expect(specs).toHaveLength(1);
    expect(specs[0].options).toEqual(['mail', 'teams', 'sms']);
  });
});

describe('replaceVariables', () => {
  it('substitutes a repeated-choice token by its key', () => {
    const text = 'Pick {{Variables: VariableOne/VariableTwo/VariableOne}}';

    expect(replaceVariables(text, { Variables: 'VariableTwo' })).toBe('Pick VariableTwo');
  });
});
