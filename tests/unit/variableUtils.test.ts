import { describe, expect, it } from 'vitest';
import { extractVariableSpecs, parseVariableToken, resolveVariables } from '@/utils/variableUtils';

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

describe('whitespace and punctuation', () => {
  it('keys a spaced choice list the same as an unspaced one', () => {
    const spaced = parseVariableToken(' mail / teams ');
    const tight = parseVariableToken('mail/teams');

    expect(spaced).toEqual(tight);
    expect(spaced?.key).toBe('mail/teams');
  });

  it('substitutes a spaced token', () => {
    expect(resolveVariables('Send by {{ tone }}', { tone: 'email' }).text).toBe('Send by email');
  });

  it('treats a token whose name contains regex metacharacters as literal text', () => {
    const text = 'Cost {{price (in $)}} today';

    expect(parseVariableToken('price (in $)')?.key).toBe('price (in $)');
    expect(resolveVariables(text, { 'price (in $)': '£4' }).text).toBe('Cost £4 today');
  });

  it('ignores reserved tokens such as component references', () => {
    expect(parseVariableToken('> Component Name')).toBeNull();
    expect(resolveVariables('Keep {{> Component}}', {}).text).toBe('Keep {{> Component}}');
  });
});

describe('values', () => {
  it('drops a known variable whose value is empty', () => {
    expect(resolveVariables('Tone: {{tone}}!', { tone: '' }).text).toBe('Tone: !');
  });

  it('resolves a variable with no value to nothing, and reports it', () => {
    // Never given a value and given an empty one are the same intent, so they
    // produce the same text rather than one leaving {{braces}} behind.
    const never = resolveVariables('Hello {{name}}', { other: 'x' });
    const emptied = resolveVariables('Hello {{name}}', { name: '' });

    expect(never.text).toBe('Hello ');
    expect(emptied.text).toBe('Hello ');
    expect(never.unresolved).toEqual(['name']);
    expect(emptied.unresolved).toEqual(['name']);
  });

  it('reports each blank variable once, in the order they appear', () => {
    const { unresolved } = resolveVariables('{{b}} {{a}} {{b}}', {});

    expect(unresolved).toEqual(['b', 'a']);
  });

  it('reports nothing when every variable has a value', () => {
    expect(resolveVariables('Hi {{name}}', { name: 'Tim' }).unresolved).toEqual([]);
  });

  it('replaces every occurrence of the same variable', () => {
    expect(resolveVariables('{{a}} and {{a}}', { a: 'x' }).text).toBe('x and x');
  });

  it('substitutes a choice variable by its key, not its chosen option', () => {
    expect(resolveVariables('Use {{mail/teams}}', { 'mail/teams': 'teams' }).text).toBe(
      'Use teams'
    );
  });

  it('accepts a custom value that is not one of the choices', () => {
    expect(resolveVariables('Use {{mail/teams}}', { 'mail/teams': 'carrier pigeon' }).text).toBe(
      'Use carrier pigeon'
    );
  });
});

describe('extractVariableSpecs', () => {
  it('unions the choices of tokens sharing a key, without repeats', () => {
    const specs = extractVariableSpecs('{{channel: mail/teams}} then {{channel: teams/sms}}');

    expect(specs).toHaveLength(1);
    expect(specs[0].options).toEqual(['mail', 'teams', 'sms']);
  });
});

describe('resolveVariables', () => {
  it('substitutes a repeated-choice token by its key', () => {
    const text = 'Pick {{Variables: VariableOne/VariableTwo/VariableOne}}';

    expect(resolveVariables(text, { Variables: 'VariableTwo' }).text).toBe('Pick VariableTwo');
  });
});
