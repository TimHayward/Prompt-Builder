// @vitest-environment node
/**
 * Component library CRUD against a real database.
 *
 * The A4 semantics — upsert rather than replace, delete only what the client
 * says it deleted — only mean anything against real rows, so this is where they
 * are actually proven.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, callWithParams, useTemporaryDatabase } from './apiHarness';
import type { FolderType } from '@/types';

const temp = useTemporaryDatabase();

let components: typeof import('@/app/api/components/route');
let component: typeof import('@/app/api/components/[id]/route');

beforeAll(async () => {
  components = await import('@/app/api/components/route');
  component = await import('@/app/api/components/[id]/route');
  await temp.assertIsolated();
}, 30000);

afterAll(temp.cleanup);

/** A row as the library GET returns it. */
type LibraryRow = {
  id: string;
  parent_id: string | null;
  name: string;
  item_type: 'folder' | 'component';
  content: string | null;
  component_type: string | null;
  is_expanded: number | null;
  sort_order: number;
};

const componentNode = (id: string, name = id) => ({
  id,
  name,
  type: 'component' as const,
  content: `${name} body`,
  componentType: 'instruction' as const,
});

const folder = (id: string, children: any[] = [], expanded = true): FolderType => ({
  id,
  name: id,
  type: 'folder',
  expanded,
  children,
});

const saveLibrary = (tree: FolderType[], deletedIds: string[] = []) =>
  call(components.POST, { method: 'POST', body: { tree, deletedIds } });

const readLibrary = () => call<LibraryRow[]>(components.GET);

const idsInLibrary = async () => (await readLibrary()).body.map(row => row.id);

describe('saving the library', () => {
  it('stores a tree and reads it back with its structure', async () => {
    await saveLibrary([folder('root', [folder('child', [componentNode('c1')]), componentNode('c2')])]);

    const rows = (await readLibrary()).body;
    const byId = new Map(rows.map(row => [row.id, row]));

    expect(byId.get('root')?.parent_id).toBeNull();
    expect(byId.get('child')?.parent_id).toBe('root');
    expect(byId.get('c1')?.parent_id).toBe('child');
    expect(byId.get('c1')?.content).toBe('c1 body');
  });

  it('keeps sibling order across a save', async () => {
    await saveLibrary([folder('root', [componentNode('a'), componentNode('b'), componentNode('c')])]);

    const rows = (await readLibrary()).body;
    // Relative order only: a save upserts rather than replaces, so items stored
    // by an earlier test are still under root — which is the point of A4.
    const saved = rows.filter(row => ['a', 'b', 'c'].includes(row.id)).map(row => row.id);

    expect(saved).toEqual(['a', 'b', 'c']);
  });

  it('keeps folder expansion across a save', async () => {
    await saveLibrary([folder('root', [folder('open-one', [], true), folder('shut-one', [], false)])]);

    const rows = (await readLibrary()).body;
    const byId = new Map(rows.map(row => [row.id, row]));

    expect(byId.get('open-one')?.is_expanded).toBe(1);
    expect(byId.get('shut-one')?.is_expanded).toBe(0);
  });

  it('rejects a malformed tree without touching what is stored', async () => {
    const before = await idsInLibrary();

    const rejected = await call(components.POST, {
      method: 'POST',
      body: { tree: [{ id: 'x', name: 'x', type: 'mystery' }] },
    });

    expect(rejected.status).toBe(400);
    expect(await idsInLibrary()).toEqual(before);
  });
});

describe('a save from a stale client snapshot', () => {
  it('leaves alone an item the snapshot never knew about', async () => {
    await saveLibrary([folder('root', [componentNode('known')])]);
    const staleSnapshot = [folder('root', [componentNode('known')])];

    // Something else adds a component after this client loaded.
    await saveLibrary([folder('root', [componentNode('known'), componentNode('ingested')])]);

    // The stale client saves what it has, deleting nothing.
    await saveLibrary(staleSnapshot);

    expect(await idsInLibrary()).toContain('ingested');
  });

  it('removes only what the client says it deleted, and its descendants', async () => {
    await saveLibrary([
      folder('root', [folder('doomed', [componentNode('child-of-doomed')]), componentNode('survivor')]),
    ]);

    await saveLibrary([folder('root', [componentNode('survivor')])], ['doomed']);

    const ids = await idsInLibrary();
    expect(ids).toContain('survivor');
    expect(ids).not.toContain('doomed');
    expect(ids).not.toContain('child-of-doomed');
  });
});

describe('deleting one item', () => {
  it('cascades to its children, which needs the foreign_keys pragma', async () => {
    await saveLibrary([folder('root', [folder('parent', [componentNode('kid')])])]);

    const deleted = await callWithParams(component.DELETE, {
      method: 'DELETE',
      params: { id: 'parent' },
    });

    expect(deleted.status).toBe(200);
    const ids = await idsInLibrary();
    expect(ids).not.toContain('parent');
    expect(ids).not.toContain('kid');
    expect(ids).toContain('root');
  });

  it('404s for an item that is not there', async () => {
    const missing = await callWithParams(component.DELETE, {
      method: 'DELETE',
      params: { id: 'never-existed' },
    });

    expect(missing.status).toBe(404);
  });
});
