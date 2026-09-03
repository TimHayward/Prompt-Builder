// @vitest-environment node
/**
 * Prompt CRUD against a real database.
 *
 * These also cover F4's reload half: a mutation is written through the API and
 * then read back, which is what the mocked unit tests cannot show.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, callWithParams, useTemporaryDatabase, type ApiResult } from './apiHarness';
import type { Prompt, StoredSection } from '@/types';

const temp = useTemporaryDatabase();

let prompts: typeof import('@/app/api/prompts/route');
let prompt: typeof import('@/app/api/prompts/[id]/route');

beforeAll(async () => {
  // Imported after the temp directory is set, so the first query opens it there.
  prompts = await import('@/app/api/prompts/route');
  prompt = await import('@/app/api/prompts/[id]/route');
  await temp.assertIsolated();
  // Generous: a cold run transforms next/server and better-sqlite3 first.
}, 30000);

afterAll(temp.cleanup);

const section = (id: string, content = id): StoredSection => ({
  id,
  name: id,
  content,
  type: 'instruction',
});

const createPrompt = async (name: string, sections: StoredSection[] = [], num?: number) =>
  call<Prompt>(prompts.POST, { method: 'POST', body: { name, sections, num } });

const readPrompt = (id: string) => callWithParams<Prompt>(prompt.GET, { params: { id } });

const listPrompts = () => call<Prompt[]>(prompts.GET);

const sectionIds = (result: ApiResult<Prompt>) => result.body.sections.map(s => s.id);

describe('creating a prompt', () => {
  it('stores it and reads it back', async () => {
    const created = await createPrompt('First prompt', [section('s1', 'Hello')], 1);

    expect(created.status).toBe(201);
    expect(created.body.name).toBe('First prompt');

    const reloaded = await readPrompt(created.body.id);
    expect(reloaded.status).toBe(200);
    expect(reloaded.body.sections).toEqual([section('s1', 'Hello')]);
  });

  it('rejects a prompt with no name, and stores nothing', async () => {
    const before = await listPrompts();

    const rejected = await call(prompts.POST, { method: 'POST', body: { sections: [] } });

    expect(rejected.status).toBe(400);
    expect(rejected.body.error).toBe('Prompt name is required');
    expect((await listPrompts()).body).toHaveLength(before.body.length);
  });

  it('rejects malformed JSON', async () => {
    const rejected = await call(prompts.POST, { method: 'POST', body: '{ not json' });

    expect(rejected.status).toBe(400);
    expect(rejected.body.error).toBe('Invalid JSON format in request body');
  });

  it('drops editor state a client sends with a section', async () => {
    const created = await call<Prompt>(prompts.POST, {
      method: 'POST',
      body: {
        name: 'With editor state',
        sections: [{ ...section('s1'), open: false, dirty: true, editingHeader: true }],
      },
    });

    const stored = (await readPrompt(created.body.id)).body.sections[0];
    expect(stored).not.toHaveProperty('open');
    expect(stored).not.toHaveProperty('dirty');
    expect(stored).not.toHaveProperty('editingHeader');
  });
});

describe('listing prompts', () => {
  it('orders by num, then oldest first, with unnumbered prompts last', async () => {
    await createPrompt('Numbered ten', [], 10);
    await createPrompt('Unnumbered');
    await createPrompt('Numbered two', [], 2);

    const listed = await listPrompts();
    const named = listed.body.map(p => `${p.num}:${p.name}`);

    // The two created at the top of this file come first (num 1 and null).
    expect(named).toContain('2:Numbered two');
    expect(named.indexOf('2:Numbered two')).toBeLessThan(named.indexOf('10:Numbered ten'));
    expect(named.indexOf('10:Numbered ten')).toBeLessThan(named.indexOf('null:Unnumbered'));
  });

  it('gives the same order on every read', async () => {
    const first = await listPrompts();
    const second = await listPrompts();

    expect(second.body.map(p => p.id)).toEqual(first.body.map(p => p.id));
  });
});

describe('updating a prompt', () => {
  it('rejects a body that changes nothing', async () => {
    const created = await createPrompt('Unchanged');

    const rejected = await callWithParams(prompt.PUT, {
      method: 'PUT',
      params: { id: created.body.id },
      body: {},
    });

    expect(rejected.status).toBe(400);
    expect(rejected.body.error).toBe('No fields to update provided');
  });

  it('404s for a prompt that does not exist', async () => {
    const missing = await callWithParams(prompt.PUT, {
      method: 'PUT',
      params: { id: 'no-such-prompt' },
      body: { name: 'Ghost' },
    });

    expect(missing.status).toBe(404);
  });
});

describe('prompt metadata', () => {
  it('is empty on a new prompt', async () => {
    const created = await createPrompt('Fresh');

    expect(created.body.description).toBe('');
    expect(created.body.isFavourite).toBe(false);
  });

  it('survives a reload', async () => {
    const created = await createPrompt('Described');

    await callWithParams(prompt.PUT, {
      method: 'PUT',
      params: { id: created.body.id },
      body: { description: 'Weekly client update', isFavourite: true },
    });

    const reloaded = await readPrompt(created.body.id);
    expect(reloaded.body.description).toBe('Weekly client update');
    expect(reloaded.body.isFavourite).toBe(true);
  });

  it('is left alone by an update that does not mention it', async () => {
    const created = await createPrompt('Marked');

    await callWithParams(prompt.PUT, {
      method: 'PUT',
      params: { id: created.body.id },
      body: { description: 'Keep me', isFavourite: true },
    });
    // A section edit is the common case, and it must not clear the metadata.
    await callWithParams(prompt.PUT, {
      method: 'PUT',
      params: { id: created.body.id },
      body: { sections: [section('s1', 'New text')] },
    });

    const reloaded = await readPrompt(created.body.id);
    expect(reloaded.body.description).toBe('Keep me');
    expect(reloaded.body.isFavourite).toBe(true);
  });

  it('can be unmarked', async () => {
    const created = await createPrompt('Unmarked');

    await callWithParams(prompt.PUT, {
      method: 'PUT',
      params: { id: created.body.id },
      body: { isFavourite: true },
    });
    await callWithParams(prompt.PUT, {
      method: 'PUT',
      params: { id: created.body.id },
      body: { isFavourite: false },
    });

    expect((await readPrompt(created.body.id)).body.isFavourite).toBe(false);
  });
});

describe('a reordered prompt after reload', () => {
  it('comes back in the new order', async () => {
    const created = await createPrompt('Reorder me', [section('a'), section('b'), section('c')]);
    const id = created.body.id;

    await callWithParams(prompt.PUT, {
      method: 'PUT',
      params: { id },
      body: { sections: [section('b'), section('c'), section('a')] },
    });

    expect(sectionIds(await readPrompt(id))).toEqual(['b', 'c', 'a']);
  });

  it('keeps a section inserted in the middle', async () => {
    const created = await createPrompt('Insert into me', [section('a'), section('c')]);
    const id = created.body.id;

    await callWithParams(prompt.PUT, {
      method: 'PUT',
      params: { id },
      body: { sections: [section('a'), section('b'), section('c')] },
    });

    expect(sectionIds(await readPrompt(id))).toEqual(['a', 'b', 'c']);
  });

  it('keeps a deletion deleted', async () => {
    const created = await createPrompt('Delete from me', [section('a'), section('b')]);
    const id = created.body.id;

    await callWithParams(prompt.PUT, {
      method: 'PUT',
      params: { id },
      body: { sections: [section('a')] },
    });

    expect(sectionIds(await readPrompt(id))).toEqual(['a']);
  });

  it('keeps an edit to a section', async () => {
    const created = await createPrompt('Edit me', [section('a', 'before')]);
    const id = created.body.id;

    await callWithParams(prompt.PUT, {
      method: 'PUT',
      params: { id },
      body: { sections: [section('a', 'after')] },
    });

    expect((await readPrompt(id)).body.sections[0].content).toBe('after');
  });

  it('keeps both prompts when two are updated in turn', async () => {
    const a = await createPrompt('Prompt A', [section('a', 'original')]);
    const b = await createPrompt('Prompt B', [section('b', 'original')]);

    await callWithParams(prompt.PUT, {
      method: 'PUT',
      params: { id: a.body.id },
      body: { sections: [section('a', 'edit A')] },
    });
    await callWithParams(prompt.PUT, {
      method: 'PUT',
      params: { id: b.body.id },
      body: { sections: [section('b', 'edit B')] },
    });

    expect((await readPrompt(a.body.id)).body.sections[0].content).toBe('edit A');
    expect((await readPrompt(b.body.id)).body.sections[0].content).toBe('edit B');
  });
});

describe('deleting a prompt', () => {
  it('removes it, and says so only once', async () => {
    const created = await createPrompt('Temporary');
    const id = created.body.id;

    const deleted = await callWithParams(prompt.DELETE, { method: 'DELETE', params: { id } });
    const again = await callWithParams(prompt.DELETE, { method: 'DELETE', params: { id } });

    expect(deleted.status).toBe(200);
    expect(again.status).toBe(404);
    expect((await readPrompt(id)).status).toBe(404);
  });
});
