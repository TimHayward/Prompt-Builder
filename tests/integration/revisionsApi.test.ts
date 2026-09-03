// @vitest-environment node
/**
 * O1, O2 and O3 against a real database.
 *
 * Revisions are written by saving, coalesced into editing sessions and capped,
 * so the interesting behaviour is only visible through the routes that do the
 * saving. These drive those.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, callWithParams, useTemporaryDatabase } from './apiHarness';
import type { Prompt, StoredSection } from '@/types';
import type { RevisionSummary } from '@/lib/repositories/revisionsRepository';

const temp = useTemporaryDatabase();

let prompts: typeof import('@/app/api/prompts/route');
let promptRoute: typeof import('@/app/api/prompts/[id]/route');
let components: typeof import('@/app/api/components/route');
let componentRoute: typeof import('@/app/api/components/[id]/route');
let revisions: typeof import('@/app/api/revisions/[kind]/[id]/route');
let repository: typeof import('@/lib/repositories/revisionsRepository');

beforeAll(async () => {
  prompts = await import('@/app/api/prompts/route');
  promptRoute = await import('@/app/api/prompts/[id]/route');
  components = await import('@/app/api/components/route');
  componentRoute = await import('@/app/api/components/[id]/route');
  revisions = await import('@/app/api/revisions/[kind]/[id]/route');
  repository = await import('@/lib/repositories/revisionsRepository');
  await temp.assertIsolated();
}, 30000);

afterAll(temp.cleanup);

const section = (id: string, content: string): StoredSection => ({
  id,
  name: id,
  content,
  type: 'instruction',
});

const createPrompt = (name: string, sections: StoredSection[]) =>
  call<Prompt>(prompts.POST, { method: 'POST', body: { name, sections } });

const savePrompt = (id: string, body: Record<string, unknown>) =>
  callWithParams<Prompt>(promptRoute.PUT, { method: 'PUT', params: { id }, body });

const readPrompt = (id: string) => callWithParams<Prompt>(promptRoute.GET, { params: { id } });

const listRevisions = (kind: string, id: string) =>
  callWithParams<RevisionSummary[]>(revisions.GET, { params: { kind, id } });

const restore = (kind: string, id: string, revisionId: string) =>
  callWithParams(revisions.POST, { method: 'POST', params: { kind, id }, body: { revisionId } });

/**
 * Ages every revision of an item, so the next save counts as a new session
 * rather than being coalesced into the last one.
 */
const ageRevisions = async (table: string, key: string, id: string) => {
  const { db } = await import('@/lib/db');
  const old = new Date(Date.now() - repository.COALESCE_WINDOW_MS - 1000).toISOString();
  db.prepare(`UPDATE ${table} SET created_at = ? WHERE ${key} = ?`).run(old, id);
};

describe('a prompt gaining history', () => {
  it('has none before it is edited', async () => {
    const created = await createPrompt('First', [section('s1', 'Original text.')]);

    expect((await listRevisions('prompt', created.body.id)).body).toEqual([]);
  });

  it('records what it said before an edit', async () => {
    const created = await createPrompt('Second', [section('s1', 'Original text.')]);

    await savePrompt(created.body.id, { sections: [section('s1', 'Edited text.')] });

    const listed = (await listRevisions('prompt', created.body.id)).body;
    expect(listed).toHaveLength(1);

    const revision = await callWithParams<{ sections: StoredSection[] }>(revisions.GET, {
      params: { kind: 'prompt', id: created.body.id },
      path: `/api/revisions/prompt/${created.body.id}?revisionId=${listed[0].id}`,
    });

    expect(revision.body.sections[0].content).toBe('Original text.');
  });

  it('coalesces a burst of edits into one revision', async () => {
    const created = await createPrompt('Third', [section('s1', 'One.')]);

    await savePrompt(created.body.id, { sections: [section('s1', 'Two.')] });
    await savePrompt(created.body.id, { sections: [section('s1', 'Three.')] });
    await savePrompt(created.body.id, { sections: [section('s1', 'Four.')] });

    // One editing session, so one recoverable point: what it said before it.
    expect((await listRevisions('prompt', created.body.id)).body).toHaveLength(1);
  });

  it('starts a new revision for a later editing session', async () => {
    const created = await createPrompt('Fourth', [section('s1', 'One.')]);

    await savePrompt(created.body.id, { sections: [section('s1', 'Two.')] });
    await ageRevisions('prompt_revisions', 'prompt_id', created.body.id);
    await savePrompt(created.body.id, { sections: [section('s1', 'Three.')] });

    expect((await listRevisions('prompt', created.body.id)).body).toHaveLength(2);
  });

  it('records a rename', async () => {
    const created = await createPrompt('Fifth', [section('s1', 'Text.')]);

    await savePrompt(created.body.id, { name: 'Renamed' });

    expect((await listRevisions('prompt', created.body.id)).body[0].name).toBe('Fifth');
  });

  it('records nothing for metadata alone', async () => {
    const created = await createPrompt('Sixth', [section('s1', 'Text.')]);

    await savePrompt(created.body.id, { isFavourite: true, tags: ['x'], description: 'y' });
    await savePrompt(created.body.id, { lastUsedAt: new Date().toISOString() });

    // None of that is the source, so none of it is history.
    expect((await listRevisions('prompt', created.body.id)).body).toEqual([]);
  });

  it('keeps only the newest few', async () => {
    const created = await createPrompt('Seventh', [section('s1', 'Start.')]);

    for (let index = 0; index < repository.MAX_REVISIONS + 5; index += 1) {
      await savePrompt(created.body.id, { sections: [section('s1', `Edit ${index}.`)] });
      await ageRevisions('prompt_revisions', 'prompt_id', created.body.id);
    }

    expect((await listRevisions('prompt', created.body.id)).body).toHaveLength(
      repository.MAX_REVISIONS
    );
  });
});

describe('restoring a prompt revision', () => {
  it('makes the previous text current again', async () => {
    const created = await createPrompt('Restorable', [section('s1', 'The good version.')]);
    await savePrompt(created.body.id, { sections: [section('s1', 'The mistake.')] });

    const [revision] = (await listRevisions('prompt', created.body.id)).body;
    const restored = await restore('prompt', created.body.id, revision.id);

    expect(restored.status).toBe(200);
    expect((await readPrompt(created.body.id)).body.sections[0].content).toBe('The good version.');
  });

  it('can itself be undone', async () => {
    const created = await createPrompt('Undoable', [section('s1', 'First.')]);
    await savePrompt(created.body.id, { sections: [section('s1', 'Second.')] });
    await ageRevisions('prompt_revisions', 'prompt_id', created.body.id);

    const [first] = (await listRevisions('prompt', created.body.id)).body;
    await restore('prompt', created.body.id, first.id);

    // The restore recorded what was current before it, so there is a way back.
    const listed = (await listRevisions('prompt', created.body.id)).body;
    expect(listed.length).toBeGreaterThan(1);

    await restore('prompt', created.body.id, listed[0].id);
    expect((await readPrompt(created.body.id)).body.sections[0].content).toBe('Second.');
  });

  it('refuses a revision belonging to another prompt', async () => {
    const mine = await createPrompt('Mine', [section('s1', 'Mine.')]);
    const theirs = await createPrompt('Theirs', [section('s1', 'Theirs.')]);
    await savePrompt(theirs.body.id, { sections: [section('s1', 'Edited.')] });

    const [theirRevision] = (await listRevisions('prompt', theirs.body.id)).body;
    const refused = await restore('prompt', mine.body.id, theirRevision.id);

    expect(refused.status).toBe(404);
  });

  it('never restores working values', async () => {
    const created = await createPrompt('Working', [section('s1', 'Use {{customer}}.')]);
    await savePrompt(created.body.id, { sections: [section('s1', 'Use {{client}}.')] });

    const [revision] = (await listRevisions('prompt', created.body.id)).body;
    const detail = await callWithParams<Record<string, unknown>>(revisions.GET, {
      params: { kind: 'prompt', id: created.body.id },
      path: `/api/revisions/prompt/${created.body.id}?revisionId=${revision.id}`,
    });

    // O2: a revision holds the source and nothing about how it was filled in.
    expect(Object.keys(detail.body).sort()).toEqual(['createdAt', 'id', 'name', 'sections']);
  });
});

describe('a component gaining history', () => {
  const saveTree = (content: string) =>
    call(components.POST, {
      method: 'POST',
      body: {
        tree: [
          {
            id: 'folder-1',
            name: 'Folder',
            type: 'folder',
            expanded: true,
            children: [
              {
                id: 'component-1',
                name: 'Reviewer',
                type: 'component',
                content,
                componentType: 'role',
              },
            ],
          },
        ],
        deletedIds: [],
      },
    });

  it('records the text a component had before an edit', async () => {
    await saveTree('You are a careful reviewer.');

    await callWithParams(componentRoute.PUT, {
      method: 'PUT',
      params: { id: 'component-1' },
      body: { content: 'You are a hasty reviewer.' },
    });

    const listed = (await listRevisions('component', 'component-1')).body;
    expect(listed).toHaveLength(1);

    const revision = await callWithParams<{ content: string }>(revisions.GET, {
      params: { kind: 'component', id: 'component-1' },
      path: `/api/revisions/component/component-1?revisionId=${listed[0].id}`,
    });

    expect(revision.body.content).toBe('You are a careful reviewer.');
  });

  it('restores it', async () => {
    const [revision] = (await listRevisions('component', 'component-1')).body;

    const restored = await restore('component', 'component-1', revision.id);

    expect(restored.status).toBe(200);
    expect(
      (
        await callWithParams<{ content: string }>(componentRoute.GET, {
          params: { id: 'component-1' },
        })
      ).body.content
    ).toBe('You are a careful reviewer.');
  });
});

describe('the route itself', () => {
  it('refuses an unknown kind', async () => {
    const refused = await callWithParams(revisions.GET, {
      params: { kind: 'nonsense', id: 'anything' },
    });

    expect(refused.status).toBe(400);
  });

  it('404s for a revision that does not exist', async () => {
    const created = await createPrompt('Absent', [section('s1', 'Text.')]);

    const missing = await restore('prompt', created.body.id, 'no-such-revision');

    expect(missing.status).toBe(404);
  });
});
