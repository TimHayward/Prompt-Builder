// @vitest-environment node
/**
 * M1, M2 and M3 against real databases.
 *
 * M2's acceptance is that a library exported from one installation and imported
 * into another is functionally equivalent, so that is what this does: it builds
 * a library in one temp database, exports it, switches the app to a second
 * empty one, imports, and compares what the API answers on each side.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { call, useTemporaryDatabase } from './apiHarness';
import { BACKUP_FORMAT_VERSION, type Backup } from '@/domain/backup';
import type { Prompt, StoredSection } from '@/types';

const temp = useTemporaryDatabase();

let prompts: typeof import('@/app/api/prompts/route');
let components: typeof import('@/app/api/components/route');
let backup: typeof import('@/app/api/backup/route');

beforeAll(async () => {
  prompts = await import('@/app/api/prompts/route');
  components = await import('@/app/api/components/route');
  backup = await import('@/app/api/backup/route');
  await temp.assertIsolated();
}, 30000);

afterAll(temp.cleanup);

const section = (id: string, content = id): StoredSection => ({
  id,
  name: id,
  content,
  type: 'instruction',
});

const listPrompts = () => call<Prompt[]>(prompts.GET);
const listComponents = () => call<Record<string, unknown>[]>(components.GET);
const exportLibrary = () => call<Backup>(backup.GET);
const importLibrary = (body: unknown) => call(backup.POST, { method: 'POST', body });

/** Builds a small library: two prompts and a folder holding a component. */
const buildLibrary = async () => {
  const first = await call<Prompt>(prompts.POST, {
    method: 'POST',
    body: {
      name: 'Tenant review',
      description: 'Security posture of a tenant',
      isFavourite: true,
      tags: ['Security', 'M365'],
      sections: [
        section('s1', 'Assess {{!customer}} in a {{tone: formal/technical=formal}} voice.'),
      ],
      num: 1,
    },
  });

  await call<Prompt>(prompts.POST, {
    method: 'POST',
    body: { name: 'Announcement', sections: [section('s2', 'Tell everyone.')], num: 2 },
  });

  await call(components.POST, {
    method: 'POST',
    body: {
      tree: [
        {
          id: 'folder-1',
          name: 'Security',
          type: 'folder',
          expanded: true,
          children: [
            {
              id: 'component-1',
              name: 'Reviewer',
              type: 'component',
              content: 'You are a careful reviewer.',
              componentType: 'role',
            },
          ],
        },
      ],
      deletedIds: [],
    },
  });

  return first.body.id;
};

describe('exporting a library', () => {
  it('carries the prompts, the components and the format version', async () => {
    await buildLibrary();

    const exported = await exportLibrary();

    expect(exported.status).toBe(200);
    expect(exported.body.schemaVersion).toBe(BACKUP_FORMAT_VERSION);
    expect(exported.body.prompts.map(p => p.name)).toEqual(['Tenant review', 'Announcement']);
    expect(exported.body.components.map(c => c.name)).toEqual(['Security', 'Reviewer']);
  });

  it('keeps a prompt whole, metadata and all', async () => {
    const exported = await exportLibrary();
    const reviewed = exported.body.prompts.find(p => p.name === 'Tenant review');

    expect(reviewed?.description).toBe('Security posture of a tenant');
    expect(reviewed?.isFavourite).toBe(true);
    expect(reviewed?.tags).toEqual(['Security', 'M365']);
    // Variable definitions live in the section text, so exporting sections
    // exports them.
    expect(reviewed?.sections[0].content).toContain('{{!customer}}');
  });

  it('says which database schema it came from', async () => {
    const exported = await exportLibrary();

    expect(exported.body.databaseVersion).toBeGreaterThan(0);
    expect(exported.body.exportedAt).toBeTruthy();
  });

  it('offers itself as a file to save', async () => {
    const exported = await exportLibrary();

    expect(exported.response.headers.get('content-disposition')).toContain('attachment');
  });

  it('leaves working values out', async () => {
    const exported = await exportLibrary();

    // Values entered belong to a use of a prompt, not to the library.
    expect(JSON.stringify(exported.body)).not.toContain('sectionOverrides');
    expect(Object.keys(exported.body)).toEqual(
      expect.arrayContaining(['prompts', 'components', 'settings'])
    );
  });
});

describe('restoring into a second installation', () => {
  it('produces an equivalent library', async () => {
    const exported = (await exportLibrary()).body;
    const before = (await listPrompts()).body;
    const componentsBefore = (await listComponents()).body;

    // A second, empty installation: a fresh directory, and the connection to
    // the first one closed so the next query opens the new file.
    const second = mkdtempSync(path.join(tmpdir(), 'prompt-builder-second-'));
    const { closeDatabase } = await import('@/lib/db');
    closeDatabase();
    process.env.PROMPT_BUILDER_DATA_DIR = second;

    try {
      expect((await listPrompts()).body).toEqual([]);

      const restored = await importLibrary(exported);
      expect(restored.status).toBe(200);

      const after = (await listPrompts()).body;
      const componentsAfter = (await listComponents()).body;

      // Functionally equivalent: the same prompts, with the same ids, sections,
      // metadata and order, and the same component tree.
      expect(after.map(p => ({ ...p, created_at: undefined, updated_at: undefined }))).toEqual(
        before.map(p => ({ ...p, created_at: undefined, updated_at: undefined }))
      );
      expect(componentsAfter.map(c => c.name)).toEqual(componentsBefore.map(c => c.name));
      expect(componentsAfter.map(c => c.parent_id)).toEqual(componentsBefore.map(c => c.parent_id));
    } finally {
      closeDatabase();
      process.env.PROMPT_BUILDER_DATA_DIR = temp.directory;
      rmSync(second, { recursive: true, force: true });
    }
  });
});

describe('restoring over an existing library', () => {
  it('replaces what was there', async () => {
    const exported = (await exportLibrary()).body;

    const emptied: Backup = { ...exported, prompts: [exported.prompts[0]], components: [] };
    const restored = await importLibrary(emptied);

    expect(restored.status).toBe(200);
    expect((await listPrompts()).body.map(p => p.name)).toEqual(['Tenant review']);
    expect((await listComponents()).body).toEqual([]);
  });

  it('leaves a restored prompt with no values entered', async () => {
    const [only] = (await listPrompts()).body;

    expect(only.variables).toEqual({});
  });
});

describe('a file that is not a backup', () => {
  it('is refused, and changes nothing', async () => {
    const before = (await listPrompts()).body;

    const refused = await importLibrary({ nothing: 'like a backup' });

    expect(refused.status).toBe(400);
    expect((await listPrompts()).body).toEqual(before);
  });

  it('is refused when written by a newer Prompt Builder', async () => {
    const exported = (await exportLibrary()).body;

    const refused = await importLibrary({ ...exported, schemaVersion: BACKUP_FORMAT_VERSION + 1 });

    expect(refused.status).toBe(400);
    expect(refused.body.error).toContain('newer version');
  });

  it('is refused when the JSON is malformed', async () => {
    const refused = await call(backup.POST, { method: 'POST', body: '{ not json' });

    expect(refused.status).toBe(400);
    expect(refused.body.error).toBe('Invalid JSON format in request body');
  });
});
