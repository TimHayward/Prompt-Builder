/**
 * One prompt fixture, shared by the tests
 *
 * A Prompt has grown fields twice — description and isFavourite, then tags and
 * lastUsedAt — and each time every test that built one by hand stopped
 * compiling. The defaults live here so a new field is added once; a test still
 * spells out whatever it actually depends on.
 */

import type { Prompt } from '@/types';

/**
 * Builds a prompt, filling in anything the caller does not care about
 * @param overrides - The fields this test depends on
 */
export const buildPrompt = (overrides: Partial<Prompt> = {}): Prompt => ({
  id: 'prompt-1',
  num: 1,
  name: 'Test prompt',
  description: '',
  isFavourite: false,
  tags: [],
  lastUsedAt: null,
  sections: [],
  variables: {},
  ...overrides,
});
