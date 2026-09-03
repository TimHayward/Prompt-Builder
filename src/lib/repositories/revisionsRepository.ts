/**
 * Revisions repository
 *
 * Keeps the previous text of a prompt or a component recoverable.
 *
 * Two rules shape what is stored, because saving is automatic and a revision
 * per keystroke would be worth nothing:
 *
 * - **Coalescing.** A revision records what something looked like *before* an
 *   editing session, and one session produces one revision. A save whose
 *   newest revision is younger than COALESCE_WINDOW_MS adds nothing, so a
 *   burst of typing leaves a single entry: the state you started from.
 * - **A cap.** Only the newest MAX_REVISIONS are kept per item. History is a
 *   safety net for recent mistakes, not an archive.
 *
 * Working values are never part of this. A revision holds the source — a
 * prompt's name and sections, or a component's name and text — and nothing
 * about how one use of it was filled in.
 */

import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/db';
import type { StoredSection } from '@/types';

/** Saves closer together than this belong to the same editing session. */
export const COALESCE_WINDOW_MS = 5 * 60 * 1000;

/** How many revisions are kept for one prompt or component. */
export const MAX_REVISIONS = 20;

export type RevisionKind = 'prompt' | 'component';

/** One entry in a history list. */
export type RevisionSummary = {
  id: string;
  name: string;
  createdAt: string;
};

/** A revision with the text it holds. */
export type PromptRevision = RevisionSummary & { sections: StoredSection[] };
export type ComponentRevision = RevisionSummary & { content: string };

type TableConfig = {
  table: string;
  key: string;
  /** The column holding the text this kind of revision preserves. */
  body: string;
};

const TABLES: Record<RevisionKind, TableConfig> = {
  prompt: { table: 'prompt_revisions', key: 'prompt_id', body: 'sections' },
  component: { table: 'component_revisions', key: 'component_id', body: 'content' },
};

/** When the newest revision was taken, or null when there are none. */
const newestAt = (kind: RevisionKind, entityId: string): string | null => {
  const { table, key } = TABLES[kind];
  const row = db
    .prepare(`SELECT created_at FROM ${table} WHERE ${key} = ? ORDER BY created_at DESC LIMIT 1`)
    .get(entityId) as { created_at: string } | undefined;

  return row?.created_at ?? null;
};

/** The text of the newest revision, for skipping one that would repeat it. */
const newestBody = (kind: RevisionKind, entityId: string): string | null => {
  const { table, key, body } = TABLES[kind];
  const row = db
    .prepare(
      `SELECT ${body} AS body FROM ${table} WHERE ${key} = ? ORDER BY created_at DESC LIMIT 1`
    )
    .get(entityId) as { body: string } | undefined;

  return row?.body ?? null;
};

/**
 * Whether a save should leave a revision behind
 *
 * @param kind - What is being edited
 * @param entityId - Its id
 * @param body - The text as it stands *before* this save
 * @param now - The moment of the save, injectable for tests
 */
export const shouldRecord = (
  kind: RevisionKind,
  entityId: string,
  body: string,
  now: Date = new Date()
): boolean => {
  // Nothing to recover: the first save of something empty is not history.
  if (!body.trim() || body === '[]') return false;

  // The same text again says nothing the newest revision does not already say.
  if (newestBody(kind, entityId) === body) return false;

  const latest = newestAt(kind, entityId);
  if (!latest) return true;

  const age = now.getTime() - Date.parse(latest);

  return Number.isNaN(age) || age > COALESCE_WINDOW_MS;
};

/** Drops everything past the cap, oldest first. */
const prune = (kind: RevisionKind, entityId: string) => {
  const { table, key } = TABLES[kind];

  db.prepare(
    `DELETE FROM ${table}
      WHERE ${key} = ?
        AND id NOT IN (
          SELECT id FROM ${table} WHERE ${key} = ? ORDER BY created_at DESC LIMIT ?
        )`
  ).run(entityId, entityId, MAX_REVISIONS);
};

/**
 * Records what something looked like before the save about to happen
 *
 * Call it with the *current* stored state, before writing the new one. Does
 * nothing when the save belongs to an editing session already recorded.
 *
 * @returns Whether a revision was written
 */
export const recordRevision = (
  kind: RevisionKind,
  entityId: string,
  previous: { name: string; body: string },
  now: Date = new Date()
): boolean => {
  if (!shouldRecord(kind, entityId, previous.body, now)) return false;

  const { table, key, body } = TABLES[kind];

  db.prepare(
    `INSERT INTO ${table} (id, ${key}, name, ${body}, created_at) VALUES (?, ?, ?, ?, ?)`
  ).run(uuidv4(), entityId, previous.name, previous.body, now.toISOString());

  prune(kind, entityId);

  return true;
};

/** Every revision of one item, newest first. */
export const listRevisions = (kind: RevisionKind, entityId: string): RevisionSummary[] => {
  const { table, key } = TABLES[kind];

  return db
    .prepare(
      `SELECT id, name, created_at AS createdAt FROM ${table} WHERE ${key} = ? ORDER BY created_at DESC`
    )
    .all(entityId) as RevisionSummary[];
};

/** One prompt revision, with the sections it holds. */
export const getPromptRevision = (revisionId: string): PromptRevision | undefined => {
  const row = db
    .prepare(
      'SELECT id, name, sections, created_at AS createdAt FROM prompt_revisions WHERE id = ?'
    )
    .get(revisionId) as (RevisionSummary & { sections: string }) | undefined;

  if (!row) return undefined;

  try {
    return { ...row, sections: JSON.parse(row.sections) as StoredSection[] };
  } catch {
    // A revision that cannot be read is worse than useless if it throws here;
    // the caller reports it as missing.
    return undefined;
  }
};

/** One component revision, with the text it holds. */
export const getComponentRevision = (revisionId: string): ComponentRevision | undefined =>
  db
    .prepare(
      'SELECT id, name, content, created_at AS createdAt FROM component_revisions WHERE id = ?'
    )
    .get(revisionId) as ComponentRevision | undefined;

/** Whether a revision belongs to the item it is being asked for. */
export const revisionBelongsTo = (
  kind: RevisionKind,
  entityId: string,
  revisionId: string
): boolean => {
  const { table, key } = TABLES[kind];

  return (
    db.prepare(`SELECT id FROM ${table} WHERE id = ? AND ${key} = ?`).get(revisionId, entityId) !==
    undefined
  );
};
