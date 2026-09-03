/**
 * M3: an export carries its own format version, so Prompt Builder can read the
 * exports it wrote before.
 */
import { describe, expect, it } from 'vitest';
import {
  BACKUP_FORMAT_VERSION,
  BackupFormatError,
  backupSchema,
  describeBackup,
  migrateBackup,
  type Backup,
} from '@/domain/backup';

const backup = (overrides: Partial<Backup> = {}): Backup => ({
  schemaVersion: BACKUP_FORMAT_VERSION,
  prompts: [],
  components: [],
  settings: null,
  ...overrides,
});

const promptIn = (name: string) => ({
  id: `prompt-${name}`,
  num: 1,
  name,
  description: '',
  isFavourite: false,
  tags: [],
  lastUsedAt: null,
  sections: [],
});

describe('reading a backup', () => {
  it('accepts one this version wrote', () => {
    expect(migrateBackup(backup()).schemaVersion).toBe(BACKUP_FORMAT_VERSION);
  });

  it('refuses one from a newer Prompt Builder, saying so', () => {
    const newer = backup({ schemaVersion: BACKUP_FORMAT_VERSION + 1 });

    expect(() => migrateBackup(newer)).toThrow(BackupFormatError);
    expect(() => migrateBackup(newer)).toThrow(/newer version/);
  });

  it('rejects a file that is not a backup', () => {
    expect(backupSchema.safeParse({ prompts: [] }).success).toBe(false);
    expect(backupSchema.safeParse({ nothing: 'like it' }).success).toBe(false);
  });

  it('fills in what an older export could have omitted', () => {
    // Every field added since the format was defined has a default, so a file
    // written before it existed still reads.
    const parsed = backupSchema.parse({
      schemaVersion: 1,
      prompts: [{ id: 'p1', num: 1, name: 'Bare' }],
      components: [{ id: 'c1', parentId: null, name: 'Folder', itemType: 'folder' }],
    });

    expect(parsed.prompts[0]).toMatchObject({ description: '', isFavourite: false, tags: [] });
    expect(parsed.components[0]).toMatchObject({ content: null, expanded: false, sortOrder: 0 });
    expect(parsed.settings).toBeNull();
  });

  it('keeps the sections a prompt carries', () => {
    const parsed = backupSchema.parse({
      schemaVersion: 1,
      prompts: [
        {
          id: 'p1',
          num: 1,
          name: 'Assessment',
          sections: [
            { id: 's1', name: 'Task', content: 'Assess {{!customer}}.', type: 'instruction' },
          ],
        },
      ],
      components: [],
    });

    expect(parsed.prompts[0].sections[0].content).toBe('Assess {{!customer}}.');
  });
});

describe('describing a backup before restoring it', () => {
  it('counts prompts and components', () => {
    const described = describeBackup(
      backup({
        prompts: [promptIn('One'), promptIn('Two')],
        components: [
          {
            id: 'f1',
            parentId: null,
            name: 'Folder',
            itemType: 'folder',
            content: null,
            componentType: null,
            expanded: false,
            sortOrder: 0,
          },
          {
            id: 'c1',
            parentId: 'f1',
            name: 'Role',
            itemType: 'component',
            content: 'x',
            componentType: 'role',
            expanded: false,
            sortOrder: 0,
          },
        ],
      })
    );

    // Folders are not counted: they hold components rather than being them.
    expect(described).toBe('2 prompts and 1 component');
  });

  it('reads naturally for one of each', () => {
    expect(describeBackup(backup({ prompts: [promptIn('Only')] }))).toBe(
      '1 prompt and 0 components'
    );
  });
});
