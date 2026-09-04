// @vitest-environment node
/**
 * Settings and working state against a real database.
 *
 * The invariant under test is C1's: a workspace holds the values for a use, and
 * writing one never touches the prompt it belongs to.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, callWithParams, useTemporaryDatabase } from './apiHarness';
import type { Prompt } from '@/types';
import type { PromptWorkspace } from '@/types/contracts';

const temp = useTemporaryDatabase();

let prompts: typeof import('@/app/api/prompts/route');
let prompt: typeof import('@/app/api/prompts/[id]/route');
let settings: typeof import('@/app/api/settings/route');
let workspaces: typeof import('@/app/api/workspaces/route');
let workspace: typeof import('@/app/api/workspaces/[promptId]/route');

beforeAll(async () => {
  prompts = await import('@/app/api/prompts/route');
  prompt = await import('@/app/api/prompts/[id]/route');
  settings = await import('@/app/api/settings/route');
  workspaces = await import('@/app/api/workspaces/route');
  workspace = await import('@/app/api/workspaces/[promptId]/route');
  await temp.assertIsolated();
}, 30000);

afterAll(temp.cleanup);

const SOURCE = 'Send via {{channel: email/Teams/WhatsApp}}.';

const createPrompt = async (name: string) =>
  (
    await call<Prompt>(prompts.POST, {
      method: 'POST',
      body: {
        name,
        sections: [{ id: 's1', name: 'Task', content: SOURCE, type: 'instruction' }],
      },
    })
  ).body;

const putValues = (promptId: string, values: Record<string, string>) =>
  callWithParams<PromptWorkspace>(workspace.PUT, {
    method: 'PUT',
    params: { promptId },
    body: { values },
  });

const readWorkspace = (promptId: string) =>
  callWithParams<PromptWorkspace>(workspace.GET, { params: { promptId } });

const readPrompt = (id: string) => callWithParams<Prompt>(prompt.GET, { params: { id } });

describe('settings', () => {
  it('returns defaults before anything is stored', async () => {
    const read = await call(settings.GET);

    expect(read.status).toBe(200);
    expect(read.body.settings.theme).toBe('dark');
    expect(read.body.activePromptId).toBeNull();
  });

  it('keeps the stored settings when only the active prompt is sent', async () => {
    const created = await createPrompt('Active one');

    await call(settings.POST, {
      method: 'POST',
      body: {
        settings: {
          autoSave: true,
          defaultPromptName: 'Custom default',
          defaultSectionType: 'role',
          theme: 'light',
          markdownPromptingEnabled: true,
          systemPrompt: 'Guide',
        },
      },
    });
    await call(settings.POST, { method: 'POST', body: { activePromptId: created.id } });

    const read = await call(settings.GET);
    expect(read.body.settings.defaultPromptName).toBe('Custom default');
    expect(read.body.settings.theme).toBe('light');
    expect(read.body.activePromptId).toBe(created.id);
  });

  it('refuses to point at a prompt that does not exist', async () => {
    const saved = await call(settings.POST, {
      method: 'POST',
      body: { activePromptId: 'no-such-prompt' },
    });

    expect(saved.body.activePromptId).toBeNull();
  });

  it('rejects a body that says nothing', async () => {
    const rejected = await call(settings.POST, { method: 'POST', body: {} });

    expect(rejected.status).toBe(400);
  });
});

describe('open tabs', () => {
  it('are empty until a tab is recorded', async () => {
    const read = await call(settings.GET);

    expect(read.body.openPromptIds).toEqual([]);
  });

  it('round-trip in the order they were sent', async () => {
    const first = await createPrompt('Tab one');
    const second = await createPrompt('Tab two');

    await call(settings.POST, {
      method: 'POST',
      body: { openPromptIds: [second.id, first.id] },
    });

    // Tab order is the user's arrangement, so it is stored as given.
    expect((await call(settings.GET)).body.openPromptIds).toEqual([second.id, first.id]);
  });

  it('drop ids for prompts that do not exist', async () => {
    const kept = await createPrompt('Still here');

    const saved = await call(settings.POST, {
      method: 'POST',
      body: { openPromptIds: [kept.id, 'no-such-prompt'] },
    });

    // A JSON column cannot cascade, so the repository filters instead — a tab
    // that cannot open is worse than a tab that is missing.
    expect(saved.body.openPromptIds).toEqual([kept.id]);
  });

  it('lose a tab when its prompt is deleted', async () => {
    const doomed = await createPrompt('Doomed tab');
    const kept = await createPrompt('Kept tab');
    await call(settings.POST, {
      method: 'POST',
      body: { openPromptIds: [doomed.id, kept.id] },
    });

    await callWithParams(prompt.DELETE, { method: 'DELETE', params: { id: doomed.id } });

    expect((await call(settings.GET)).body.openPromptIds).toEqual([kept.id]);
  });

  it('keep the stored tabs when only the settings are sent', async () => {
    const open = await createPrompt('Untouched tab');
    await call(settings.POST, { method: 'POST', body: { openPromptIds: [open.id] } });

    await call(settings.POST, {
      method: 'POST',
      body: {
        settings: {
          autoSave: true,
          defaultPromptName: 'New Prompt',
          defaultSectionType: 'instruction',
          theme: 'dark',
          markdownPromptingEnabled: false,
          systemPrompt: 'Guide',
        },
      },
    });

    expect((await call(settings.GET)).body.openPromptIds).toEqual([open.id]);
  });
});

describe('working values', () => {
  it('are empty for a prompt that has never been used', async () => {
    const created = await createPrompt('Unused');

    const read = await readWorkspace(created.id);

    expect(read.status).toBe(200);
    expect(read.body).toEqual({ promptId: created.id, values: {}, sectionOverrides: {} });
  });

  it('survive a reload without changing the prompt', async () => {
    const created = await createPrompt('Used');
    const before = await readPrompt(created.id);

    await putValues(created.id, { channel: 'Teams' });

    expect((await readWorkspace(created.id)).body.values).toEqual({ channel: 'Teams' });
    // C1: the source is byte-identical after a value is entered.
    const after = await readPrompt(created.id);
    expect(after.body.sections).toEqual(before.body.sections);
    expect(after.body.variables).toEqual(before.body.variables);
  });

  it('clear without disturbing the variable definition', async () => {
    const created = await createPrompt('Cleared');
    await putValues(created.id, { channel: 'Teams' });

    const cleared = await callWithParams(workspace.DELETE, {
      method: 'DELETE',
      params: { promptId: created.id },
    });

    expect(cleared.status).toBe(200);
    expect((await readWorkspace(created.id)).body.values).toEqual({});
    // C2: the choice list lives in the section text, so it is still there.
    expect((await readPrompt(created.id)).body.sections[0].content).toBe(SOURCE);
  });

  it('are listed for every prompt that has them', async () => {
    const first = await createPrompt('Listed one');
    const second = await createPrompt('Listed two');
    await putValues(first.id, { channel: 'email' });
    await putValues(second.id, { channel: 'WhatsApp' });

    const listed = await call<PromptWorkspace[]>(workspaces.GET);
    const byId = new Map(listed.body.map(w => [w.promptId, w.values]));

    expect(byId.get(first.id)).toEqual({ channel: 'email' });
    expect(byId.get(second.id)).toEqual({ channel: 'WhatsApp' });
  });

  it('refuse to attach to a prompt that does not exist', async () => {
    const rejected = await callWithParams(workspace.PUT, {
      method: 'PUT',
      params: { promptId: 'no-such-prompt' },
      body: { values: { a: 'b' } },
    });

    expect(rejected.status).toBe(404);
  });

  it('go away with the prompt they belong to', async () => {
    const created = await createPrompt('Doomed');
    await putValues(created.id, { channel: 'Teams' });

    await callWithParams(prompt.DELETE, { method: 'DELETE', params: { id: created.id } });

    // ON DELETE CASCADE, which only fires because the connection sets
    // foreign_keys = ON.
    const listed = await call<PromptWorkspace[]>(workspaces.GET);
    expect(listed.body.map(w => w.promptId)).not.toContain(created.id);
  });
});
