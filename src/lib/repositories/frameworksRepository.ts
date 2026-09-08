/**
 * Frameworks repository
 *
 * Frameworks and the components they are made of, which migration 9 moved out
 * of the source and into two tables so they can be edited.
 *
 * The rule the whole design rests on: **a component id is immutable, its label
 * is not.** A prompt section stores the id in its `type` column, so renaming,
 * re-describing or reordering a component reaches every prompt that uses it
 * without touching a single stored row — and can never leave one pointing at
 * something that no longer exists.
 */

import { db, runInTransaction } from '@/lib/db';

export type FrameworkComponentRow = {
  /** What a section's `type` stores. Never rewritten once created. */
  id: string;
  label: string;
  description: string;
  /** A short illustration of what belongs in this component. */
  example: string;
};

export type FrameworkRow = {
  id: string;
  label: string;
  description: string;
  /** In the order they are read, which is the order the Type dropdown shows. */
  components: FrameworkComponentRow[];
};

type FlatFramework = { id: string; label: string; description: string };
type FlatComponent = FrameworkComponentRow & { framework_id: string };

/**
 * Every framework, each with its components in order
 *
 * Two queries rather than a join: a join would repeat the framework columns per
 * component and still need grouping here, and there are five frameworks.
 */
export const getFrameworks = (): FrameworkRow[] => {
  const frameworks = db
    .prepare('SELECT id, label, description FROM frameworks ORDER BY sort_order, id')
    .all() as FlatFramework[];

  const components = db
    .prepare(
      `SELECT id, framework_id, label, description, example
       FROM framework_components
       ORDER BY framework_id, sort_order, id`
    )
    .all() as FlatComponent[];

  const byFramework = new Map<string, FrameworkComponentRow[]>();
  components.forEach(({ framework_id, ...component }) => {
    const list = byFramework.get(framework_id) ?? [];
    list.push(component);
    byFramework.set(framework_id, list);
  });

  return frameworks.map(framework => ({
    ...framework,
    components: byFramework.get(framework.id) ?? [],
  }));
};

/** One framework, or null when nothing has that id. */
export const getFramework = (id: string): FrameworkRow | null =>
  getFrameworks().find(framework => framework.id === id) ?? null;

/**
 * Writes a framework and the components it should have
 *
 * The component list is authoritative: anything absent from it is removed, and
 * the order given becomes the stored order. Ids are preserved as sent, which is
 * what keeps a rename from orphaning a section — a caller that invents a new id
 * for an existing component is renaming the wrong half.
 *
 * Deliberately not a delete-and-reinsert of the components: that would discard
 * a row and recreate it under the same id, and any future foreign key onto
 * framework_components would fire in between. Rows are upserted, then whatever
 * the caller did not mention is deleted.
 *
 * @param framework - The framework as it should now stand
 * @returns The framework as stored
 */
export const saveFramework = (framework: FrameworkRow): FrameworkRow =>
  runInTransaction(() => {
    const order =
      (
        db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS max FROM frameworks').get() as {
          max: number;
        }
      ).max + 1;

    db.prepare(
      `INSERT INTO frameworks (id, label, description, sort_order, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         label = excluded.label,
         description = excluded.description,
         updated_at = excluded.updated_at`
    ).run(framework.id, framework.label, framework.description, order, new Date().toISOString());

    const upsert = db.prepare(
      `INSERT INTO framework_components
         (id, framework_id, label, description, example, sort_order, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         framework_id = excluded.framework_id,
         label = excluded.label,
         description = excluded.description,
         example = excluded.example,
         sort_order = excluded.sort_order,
         updated_at = excluded.updated_at`
    );

    framework.components.forEach((component, index) => {
      upsert.run(
        component.id,
        framework.id,
        component.label,
        component.description,
        component.example,
        index,
        new Date().toISOString()
      );
    });

    // Anything this framework used to hold and no longer does. Scoped to this
    // framework, so a component another framework has since claimed is safe.
    const keep = framework.components.map(component => component.id);
    const placeholders = keep.map(() => '?').join(', ');
    db.prepare(
      `DELETE FROM framework_components
       WHERE framework_id = ?
         ${keep.length > 0 ? `AND id NOT IN (${placeholders})` : ''}`
    ).run(framework.id, ...keep);

    return getFramework(framework.id) as FrameworkRow;
  });

/**
 * Removes a framework and its components
 *
 * Whether anything still uses those components is not decided here — that is a
 * question about prompts, which this repository cannot see. The caller checks
 * before asking (R4).
 *
 * @returns Whether a framework with that id existed
 */
export const deleteFramework = (id: string): boolean =>
  db.prepare('DELETE FROM frameworks WHERE id = ?').run(id).changes > 0;
