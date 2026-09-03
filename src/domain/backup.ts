/**
 * Library backups
 *
 * A whole library as one JSON document: the prompts with their sections and the
 * variable definitions written inside them, the component tree, and the
 * settings. Working values are deliberately absent — they are what one use of a
 * prompt entered, not part of the library — so restoring a backup never carries
 * someone else's half-filled form with it.
 *
 * The format carries its own version, separate from the database's. It exists
 * so Prompt Builder can read its own older exports, not to describe a format
 * anyone else should write.
 */

import { z } from 'zod';
import { sectionSchema } from '@/types/contracts';
import { settingsSchema } from '@/types/contracts';

/**
 * The version written into every export.
 *
 * Raise this only when the shape changes, and add the step that reads the old
 * shape to `migrateBackup` at the same time.
 */
export const BACKUP_FORMAT_VERSION = 1;

/** A prompt as a backup carries it: the stored row, without its working state. */
export const backupPromptSchema = z.object({
  id: z.string().min(1),
  num: z.number().nullable(),
  name: z.string(),
  description: z.string().default(''),
  isFavourite: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  lastUsedAt: z.string().nullable().default(null),
  sections: z.array(sectionSchema).default([]),
});

/**
 * A library item as a backup carries it.
 *
 * Flat rows with a parent and a sibling position, which is how the table itself
 * holds the tree: nesting the JSON would say the same thing less directly and
 * would have to be flattened again on the way back in.
 */
export const backupComponentSchema = z.object({
  id: z.string().min(1),
  parentId: z.string().nullable(),
  name: z.string(),
  itemType: z.enum(['folder', 'component']),
  content: z.string().nullable().default(null),
  componentType: z.string().nullable().default(null),
  expanded: z.boolean().default(false),
  sortOrder: z.number().default(0),
});

export const backupSchema = z.object({
  /** The export format's own version — see BACKUP_FORMAT_VERSION. */
  schemaVersion: z.number().int().positive(),
  /** When the export was taken, for the person reading the file. */
  exportedAt: z.string().optional(),
  /** The database schema the data came from. Informational. */
  databaseVersion: z.number().int().optional(),
  prompts: z.array(backupPromptSchema),
  components: z.array(backupComponentSchema),
  settings: settingsSchema.nullable().default(null),
});

export type Backup = z.infer<typeof backupSchema>;
export type BackupPrompt = z.infer<typeof backupPromptSchema>;
export type BackupComponent = z.infer<typeof backupComponentSchema>;

/**
 * What went wrong with a file someone tried to import.
 *
 * Shape is checked by `backupSchema` at the route, like every other payload;
 * this covers what a schema cannot say, such as a file from a newer version.
 */
export class BackupFormatError extends Error {}

/**
 * Brings an older export up to the current shape
 *
 * There is only one version so far, so this has nothing to do yet; it exists as
 * the single place a future step belongs, and as the check that refuses a file
 * written by a newer Prompt Builder rather than misreading it.
 *
 * @param backup - A parsed backup
 * @returns The backup in the current shape
 */
export const migrateBackup = (backup: Backup): Backup => {
  if (backup.schemaVersion > BACKUP_FORMAT_VERSION) {
    throw new BackupFormatError(
      `This backup was written by a newer version of Prompt Builder (format ${backup.schemaVersion}, this one reads ${BACKUP_FORMAT_VERSION}).`
    );
  }

  return backup;
};

/** A one-line summary of what a backup holds, for a confirmation. */
export const describeBackup = (backup: Backup): string => {
  const prompts = backup.prompts.length === 1 ? '1 prompt' : `${backup.prompts.length} prompts`;
  const items = backup.components.filter(item => item.itemType === 'component').length;
  const components = items === 1 ? '1 component' : `${items} components`;

  return `${prompts} and ${components}`;
};
