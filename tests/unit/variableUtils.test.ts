import { describe, expect, it } from 'vitest';
import { extractVariableSpecs, parseVariableToken, resolveVariables } from '@/utils/variableUtils';

describe('parseVariableToken', () => {
  it('reads a choice list', () => {
    expect(parseVariableToken('mail/teams/calendar')).toEqual({
      key: 'mail/teams/calendar',
      label: 'mail / teams / calendar',
      options: ['mail', 'teams', 'calendar'],
      required: false,
      description: '',
      defaultValue: '',
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
      required: false,
      description: '',
      defaultValue: '',
    });
  });

  it('treats a token with no real choice list as free text', () => {
    expect(parseVariableToken('tone')).toEqual({
      key: 'tone',
      label: 'tone',
      options: [],
      required: false,
      description: '',
      defaultValue: '',
    });
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

describe('required variables (J2)', () => {
  it('reads the marker, and keys the variable without it', () => {
    const spec = parseVariableToken('!customer');

    expect(spec?.required).toBe(true);
    expect(spec?.key).toBe('customer');
    expect(spec?.label).toBe('customer');
  });

  it('marks a labelled choice list required', () => {
    const spec = parseVariableToken('!channel: mail/teams');

    expect(spec?.required).toBe(true);
    expect(spec?.key).toBe('channel');
    expect(spec?.options).toEqual(['mail', 'teams']);
  });

  it('shares a value with the same variable written plainly', () => {
    const specs = extractVariableSpecs('{{!customer}} and {{customer}}');

    expect(specs).toHaveLength(1);
    expect(specs[0].key).toBe('customer');
  });

  it('stays required if any occurrence says so', () => {
    expect(extractVariableSpecs('{{customer}} then {{!customer}}')[0].required).toBe(true);
  });

  it('reports the required ones left empty', () => {
    const resolved = resolveVariables('Hello {{!customer}} and {{tone}}', {});

    expect(resolved.unresolved).toEqual(['customer', 'tone']);
    expect(resolved.missingRequired).toEqual(['customer']);
  });

  it('reports nothing once it is filled', () => {
    const resolved = resolveVariables('Hello {{!customer}}', { customer: 'Contoso' });

    expect(resolved.missingRequired).toEqual([]);
    expect(resolved.text).toBe('Hello Contoso');
  });

  it('leaves a genuinely reserved token alone', () => {
    // '!' now means required, but '>' and '#' are still held back.
    expect(parseVariableToken('> Component Name')).toBeNull();
    expect(parseVariableToken('# Heading')).toBeNull();
  });

  it('is not a variable when the marker stands alone', () => {
    expect(parseVariableToken('!')).toBeNull();
  });
});

describe('variable descriptions (J3)', () => {
  it('reads help text off the token', () => {
    const spec = parseVariableToken('customer|Customer organisation being assessed');

    expect(spec?.key).toBe('customer');
    expect(spec?.description).toBe('Customer organisation being assessed');
  });

  it('keeps help text out of the resolved output', () => {
    const text = 'For {{customer|Who is being assessed}}.';

    expect(resolveVariables(text, { customer: 'Contoso' }).text).toBe('For Contoso.');
  });

  it('shares one entry with the same variable written plainly', () => {
    const specs = extractVariableSpecs('{{customer|Who it is for}} and {{customer}}');

    expect(specs).toHaveLength(1);
    expect(specs[0].description).toBe('Who it is for');
  });

  it('takes the first help text when two occurrences differ', () => {
    const specs = extractVariableSpecs('{{customer|First}} then {{customer|Second}}');

    expect(specs[0].description).toBe('First');
  });
});

describe('variable defaults (J4)', () => {
  it('reads a default off a free-text variable', () => {
    const spec = parseVariableToken('customer=Contoso');

    expect(spec?.key).toBe('customer');
    expect(spec?.defaultValue).toBe('Contoso');
  });

  it('reads a default off a labelled choice list', () => {
    const spec = parseVariableToken('tone: formal/technical=formal');

    expect(spec?.key).toBe('tone');
    expect(spec?.options).toEqual(['formal', 'technical']);
    expect(spec?.defaultValue).toBe('formal');
  });

  it('resolves with the default when nothing was entered', () => {
    expect(resolveVariables('A {{tone: formal/technical=formal}} note', {}).text).toBe(
      'A formal note'
    );
  });

  it('does not count a defaulted variable as empty', () => {
    expect(resolveVariables('A {{tone=formal}} note', {}).unresolved).toEqual([]);
  });

  it('does not count a defaulted required variable as missing', () => {
    // The prompt supplied an answer, so there is nothing to warn about.
    expect(resolveVariables('For {{!customer=Contoso}}', {}).missingRequired).toEqual([]);
  });

  it('prefers the working value over the default', () => {
    expect(resolveVariables('A {{tone=formal}} note', { tone: 'technical' }).text).toBe(
      'A technical note'
    );
  });
});

describe('the grammar together', () => {
  it('reads every part of one token', () => {
    const spec = parseVariableToken('!channel: mail/teams=mail|How the update is sent');

    expect(spec).toEqual({
      key: 'channel',
      label: 'channel',
      options: ['mail', 'teams'],
      required: true,
      description: 'How the update is sent',
      defaultValue: 'mail',
    });
  });

  it('lets help text contain an equals sign', () => {
    // Help is split off first, so its prose cannot be read as a default.
    const spec = parseVariableToken('customer|Written as name=value');

    expect(spec?.description).toBe('Written as name=value');
    expect(spec?.defaultValue).toBe('');
  });

  it('leaves prompts written before the grammar grew exactly as they were', () => {
    expect(parseVariableToken('tone')?.key).toBe('tone');
    expect(parseVariableToken('mail/teams')?.key).toBe('mail/teams');
    expect(parseVariableToken('channel: mail/teams')?.key).toBe('channel');
    expect(parseVariableToken('Note: see below')?.key).toBe('Note: see below');
    expect(parseVariableToken('see https://example.com')?.options).toEqual([]);
    expect(resolveVariables('Keep {{> Component}}', {}).text).toBe('Keep {{> Component}}');
  });
});
