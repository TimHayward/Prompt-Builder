/**
 * Tree utilities.
 *
 * listFolders answers "which folder should this go in", so what matters is that
 * it offers every folder, in display order, with a depth a picker can indent by
 * — and that it never offers a component as a destination.
 */
import { describe, expect, it } from 'vitest';
import { listFolders } from '@/utils/treeUtils';
import type { ComponentType, FolderType } from '@/types';

const component = (id: string): ComponentType => ({
  id,
  name: id,
  type: 'component',
  content: 'body',
  componentType: 'instruction',
});

const folder = (id: string, children: (FolderType | ComponentType)[] = []): FolderType => ({
  id,
  name: id,
  type: 'folder',
  children,
  expanded: true,
});

describe('listFolders', () => {
  it('lists a parent before its children, with increasing depth', () => {
    const tree = [folder('root', [folder('child', [folder('grandchild')])])];

    expect(listFolders(tree)).toEqual([
      { id: 'root', name: 'root', depth: 0 },
      { id: 'child', name: 'child', depth: 1 },
      { id: 'grandchild', name: 'grandchild', depth: 2 },
    ]);
  });

  it('skips components, which cannot hold anything', () => {
    const tree = [folder('root', [component('c1'), folder('kept'), component('c2')])];

    expect(listFolders(tree).map(choice => choice.id)).toEqual(['root', 'kept']);
  });

  it('keeps sibling order, so the picker reads like the tree', () => {
    const tree = [folder('root', [folder('b'), folder('a')])];

    expect(listFolders(tree).map(choice => choice.id)).toEqual(['root', 'b', 'a']);
  });

  it('returns nothing for an empty tree', () => {
    expect(listFolders([])).toEqual([]);
  });
});
