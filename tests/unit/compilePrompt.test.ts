/**
 * The compiler decides what a prompt resolves to, so this covers the cases F3
 * lists — order, system prompt, formatting, every kind of variable — plus D4's
 * rule for variables left blank.
 */
import { describe, expect, it } from 'vitest';
import { compilePrompt, type CompilableSection } from '@/utils/compilePrompt';

const section = (
  name: string,
  content: string,
  type: CompilableSection['type'] = 'instruction'
): CompilableSection => ({ name, content, type });

const lines = (text: string) => text.split('\n');

describe('sections', () => {
  it('joins them in order, separated by a blank line', () => {
    const { text } = compilePrompt({
      sections: [section('One', 'First'), section('Two', 'Second'), section('Three', 'Third')],
    });

    expect(lines(text)).toEqual(['First', '', 'Second', '', 'Third']);
  });

  it('follows the order it is given, not the order of the names', () => {
    const { text } = compilePrompt({
      sections: [section('Z', 'last-named'), section('A', 'first-named')],
    });

    expect(text.indexOf('last-named')).toBeLessThan(text.indexOf('first-named'));
  });

  it('drops a section with no content', () => {
    const { text } = compilePrompt({
      sections: [section('One', 'First'), section('Empty', '   '), section('Two', 'Second')],
    });

    expect(lines(text)).toEqual(['First', '', 'Second']);
  });

  it('returns empty text for a prompt with nothing in it', () => {
    expect(compilePrompt({ sections: [] }).text).toBe('');
  });
});

describe('markdown prompting', () => {
  it('adds a typed heading to each section', () => {
    const { text } = compilePrompt({
      sections: [section('Senior Reviewer', 'Be careful.', 'role')],
      markdownEnabled: true,
    });

    expect(lines(text)).toEqual(['# Role: Senior Reviewer', '', 'Be careful.']);
  });

  it('prepends the system prompt above the sections', () => {
    const { text } = compilePrompt({
      sections: [section('Task', 'Do the thing.')],
      systemPrompt: 'System guide',
      markdownEnabled: true,
    });

    expect(lines(text)).toEqual(['System guide', '', '# Instruction: Task', '', 'Do the thing.']);
  });

  it('does not add a second heading to a section that already has one', () => {
    // Sections imported from Markdown keep their own heading line.
    const { text } = compilePrompt({
      sections: [section('Senior Reviewer', '# Role: Senior Reviewer\nBe careful.', 'role')],
      markdownEnabled: true,
    });

    expect(lines(text)).toEqual(['# Role: Senior Reviewer', 'Be careful.']);
  });

  it('still adds a heading when the content only has a sub-heading', () => {
    const { text } = compilePrompt({
      sections: [section('Task', '## Details\nDo the thing.')],
      markdownEnabled: true,
    });

    expect(lines(text)).toEqual(['# Instruction: Task', '', '## Details', 'Do the thing.']);
  });

  it('omits headings and system prompt when it is off', () => {
    const { text } = compilePrompt({
      sections: [section('Senior Reviewer', 'Be careful.', 'role')],
      systemPrompt: 'System guide',
      markdownEnabled: false,
    });

    expect(text).toBe('Be careful.');
  });

  it('emits real line breaks, never escaped ones', () => {
    const { text } = compilePrompt({
      sections: [section('One', 'First'), section('Two', 'Second')],
      systemPrompt: 'System guide',
      markdownEnabled: true,
    });

    expect(text).not.toContain(String.fromCharCode(92));
  });
});

describe('variables', () => {
  it('substitutes a free-text variable', () => {
    const { text } = compilePrompt({
      sections: [section('Task', 'Review {{customer}}.')],
      values: { customer: 'Contoso' },
    });

    expect(text).toBe('Review Contoso.');
  });

  it('substitutes a choice variable by its key', () => {
    const { text } = compilePrompt({
      sections: [section('Task', 'Send by {{channel: email/Teams}}.')],
      values: { channel: 'Teams' },
    });

    expect(text).toBe('Send by Teams.');
  });

  it('accepts a custom value outside the choice list', () => {
    const { text } = compilePrompt({
      sections: [section('Task', 'Send by {{channel: email/Teams}}.')],
      values: { channel: 'carrier pigeon' },
    });

    expect(text).toBe('Send by carrier pigeon.');
  });

  it('substitutes the same variable across sections', () => {
    const { text } = compilePrompt({
      sections: [section('One', 'For {{customer}}'), section('Two', '{{customer}} again')],
      values: { customer: 'Contoso' },
    });

    expect(lines(text)).toEqual(['For Contoso', '', 'Contoso again']);
  });
});

describe('variables left blank', () => {
  it('resolves them to nothing and names them', () => {
    const { text, unresolved } = compilePrompt({
      sections: [section('Task', 'Review {{technology}} for {{customer}}.')],
      values: { technology: 'Intune' },
    });

    expect(text).toBe('Review Intune for .');
    expect(unresolved).toEqual(['customer']);
  });

  it('treats an empty value the same as a missing one', () => {
    const missing = compilePrompt({ sections: [section('T', 'Hi {{name}}')] });
    const emptied = compilePrompt({ sections: [section('T', 'Hi {{name}}')], values: { name: '' } });

    expect(missing.text).toBe(emptied.text);
    expect(missing.unresolved).toEqual(emptied.unresolved);
  });

  it('names each blank variable once across the whole prompt', () => {
    const { unresolved } = compilePrompt({
      sections: [section('One', '{{a}} {{b}}'), section('Two', '{{a}} {{c}}')],
    });

    expect(unresolved).toEqual(['a', 'b', 'c']);
  });

  it('reports nothing when every variable is populated', () => {
    const { unresolved } = compilePrompt({
      sections: [section('T', '{{a}} and {{b}}')],
      values: { a: '1', b: '2' },
    });

    expect(unresolved).toEqual([]);
  });
});

describe('the compiled result', () => {
  it('is the same text for the same input, so preview and clipboard cannot differ', () => {
    const options = {
      sections: [section('Role', 'You are {{role}}.', 'role'), section('Task', 'Do {{task}}.')],
      values: { role: 'a reviewer', task: 'the review' },
      systemPrompt: 'System guide',
      markdownEnabled: true,
    };

    // Whatever the preview renders and whatever the copy button writes are two
    // calls to this function; the same call must give the same answer.
    expect(compilePrompt(options).text).toBe(compilePrompt(options).text);
  });
});
