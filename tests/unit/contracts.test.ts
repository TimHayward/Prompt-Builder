/**
 * The contracts are what stands between a malformed payload and the database,
 * so these check both that valid bodies pass and that the shapes the old
 * `body as Partial<Prompt>` cast would have waved through are rejected.
 */
import { describe, expect, it } from 'vitest';
import {
  createPromptRequestSchema,
  ingestPromptRequestSchema,
  saveLibraryRequestSchema,
  updatePromptRequestSchema,
  updateSettingsRequestSchema,
} from '@/types/contracts';

const section = {
  id: 's1',
  name: 'Role',
  content: 'You are a helpful assistant',
  type: 'instruction',
  open: true,
  dirty: false,
};

describe('createPromptRequestSchema', () => {
  it('accepts a prompt with sections and variables', () => {
    const result = createPromptRequestSchema.safeParse({
      name: 'My prompt',
      sections: [section],
      variables: { tone: 'formal' },
      num: 1,
    });

    expect(result.success).toBe(true);
  });

  it('rejects a missing name', () => {
    const result = createPromptRequestSchema.safeParse({ sections: [] });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(['name']);
  });

  it('rejects a section with an unknown type', () => {
    const result = createPromptRequestSchema.safeParse({
      name: 'My prompt',
      sections: [{ ...section, type: 'not-a-section-type' }],
    });

    expect(result.success).toBe(false);
  });

  it('rejects variable values that are not strings', () => {
    const result = createPromptRequestSchema.safeParse({
      name: 'My prompt',
      variables: { tone: 42 },
    });

    expect(result.success).toBe(false);
  });
});

describe('updatePromptRequestSchema', () => {
  it('accepts a partial update', () => {
    expect(updatePromptRequestSchema.safeParse({ name: 'Renamed' }).success).toBe(true);
  });

  it('rejects a body that changes nothing', () => {
    const result = updatePromptRequestSchema.safeParse({});

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe('No fields to update provided');
  });
});

describe('saveLibraryRequestSchema', () => {
  it('accepts a nested tree and defaults deletedIds to empty', () => {
    const result = saveLibraryRequestSchema.safeParse({
      tree: [
        {
          id: 'root',
          name: 'Components',
          type: 'folder',
          expanded: true,
          children: [
            {
              id: 'c1',
              name: 'A component',
              type: 'component',
              content: 'body',
              componentType: 'instruction',
            },
          ],
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.data?.deletedIds).toEqual([]);
  });

  it('rejects a tree whose nodes are not folders or components', () => {
    const result = saveLibraryRequestSchema.safeParse({
      tree: [{ id: 'x', name: 'x', type: 'mystery' }],
    });

    expect(result.success).toBe(false);
  });
});

describe('ingestPromptRequestSchema', () => {
  it('rejects blank filename or content', () => {
    expect(ingestPromptRequestSchema.safeParse({ filename: '   ', content: 'x' }).success).toBe(
      false
    );
    expect(ingestPromptRequestSchema.safeParse({ filename: 'a.md', content: '  ' }).success).toBe(
      false
    );
  });
});

describe('updateSettingsRequestSchema', () => {
  it('accepts an activePromptId on its own, including null', () => {
    expect(updateSettingsRequestSchema.safeParse({ activePromptId: 'p1' }).success).toBe(true);
    expect(updateSettingsRequestSchema.safeParse({ activePromptId: null }).success).toBe(true);
  });

  it('accepts openPromptIds on its own, including an empty strip', () => {
    expect(updateSettingsRequestSchema.safeParse({ openPromptIds: ['p1', 'p2'] }).success).toBe(
      true
    );
    // Closing the last tab is a legitimate state to record.
    expect(updateSettingsRequestSchema.safeParse({ openPromptIds: [] }).success).toBe(true);
  });

  it('rejects a blank id in openPromptIds', () => {
    expect(updateSettingsRequestSchema.safeParse({ openPromptIds: [''] }).success).toBe(false);
  });

  it('rejects an empty body', () => {
    expect(updateSettingsRequestSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a theme outside the allowed set', () => {
    const result = updateSettingsRequestSchema.safeParse({
      settings: {
        autoSave: true,
        defaultPromptName: 'New Prompt',
        defaultSectionType: 'instruction',
        theme: 'sepia',
        markdownPromptingEnabled: false,
        systemPrompt: '',
      },
    });

    expect(result.success).toBe(false);
  });
});
