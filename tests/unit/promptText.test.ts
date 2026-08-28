import { describe, expect, it } from 'vitest';
import { buildPromptText } from '@/utils/promptText';

/** A single backslash, built without one so this file stays escape-free. */
const BACKSLASH = String.fromCharCode(92);

describe('buildPromptText', () => {
  it('joins sections with a real blank line', () => {
    const text = buildPromptText({
      sections: [{ content: 'One' }, { content: 'Two' }],
    });

    expect(text.split(String.fromCharCode(10))).toEqual(['One', '', 'Two']);
    expect(text).not.toContain(BACKSLASH);
  });

  it('separates the system prompt from the prompt with real line breaks', () => {
    const text = buildPromptText({
      sections: [{ content: 'Body' }],
      systemPrompt: 'System guide',
      markdownEnabled: true,
    });

    expect(text.split(String.fromCharCode(10))).toEqual(['System guide', '', 'Body']);
    expect(text).not.toContain(BACKSLASH);
  });

  it('omits the system prompt when markdown prompting is off', () => {
    const text = buildPromptText({
      sections: [{ content: 'Body' }],
      systemPrompt: 'System guide',
      markdownEnabled: false,
    });

    expect(text).toBe('Body');
  });

  it('drops empty sections and resolves variables', () => {
    const text = buildPromptText({
      sections: [{ content: 'Hello {{name}}' }, { content: '   ' }, { content: 'Bye' }],
      variables: { name: 'Tim' },
    });

    expect(text.split(String.fromCharCode(10))).toEqual(['Hello Tim', '', 'Bye']);
  });
});
