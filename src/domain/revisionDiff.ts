/**
 * Comparing a revision with what is current
 *
 * Section-level rather than character-level: a prompt is a list of named
 * sections, so "Task changed, Format was removed" says more about what happened
 * than a run of highlighted words would, and needs no diff library.
 */

import type { StoredSection } from '@/types';

export type SectionChange = {
  status: 'added' | 'removed' | 'changed' | 'unchanged';
  /** The section's name as it reads now, or as it read in the revision. */
  name: string;
  sectionId: string;
  /** What the revision holds, absent when the section did not exist then. */
  before?: string;
  /** What the prompt says now, absent when the section has since gone. */
  after?: string;
};

/**
 * Compares a revision's sections with the current ones
 *
 * Matched on section id, so moving a section is not a change to it and
 * rewriting one is not an add plus a remove.
 *
 * @param before - The sections the revision holds
 * @param after - The sections as they are now
 * @returns One entry per section, in the order they read now, then the removed
 */
export const compareSections = (
  before: Pick<StoredSection, 'id' | 'name' | 'content'>[],
  after: Pick<StoredSection, 'id' | 'name' | 'content'>[]
): SectionChange[] => {
  const previous = new Map(before.map(section => [section.id, section]));

  const changes: SectionChange[] = after.map(section => {
    const was = previous.get(section.id);

    if (!was) {
      return { status: 'added', name: section.name, sectionId: section.id, after: section.content };
    }

    const same = was.content === section.content && was.name === section.name;

    return {
      status: same ? 'unchanged' : 'changed',
      name: section.name,
      sectionId: section.id,
      before: was.content,
      after: section.content,
    };
  });

  const current = new Set(after.map(section => section.id));

  before
    .filter(section => !current.has(section.id))
    .forEach(section => {
      changes.push({
        status: 'removed',
        name: section.name,
        sectionId: section.id,
        before: section.content,
      });
    });

  return changes;
};

/** A sentence saying what restoring a revision would do. */
export const describeChanges = (changes: SectionChange[]): string => {
  const count = (status: SectionChange['status']) =>
    changes.filter(change => change.status === status).length;

  const parts = [
    count('changed') && `${count('changed')} changed`,
    // Read from the revision's side: a section added since then goes away when
    // it is restored.
    count('added') && `${count('added')} added since`,
    count('removed') && `${count('removed')} removed since`,
  ].filter(Boolean);

  return parts.length === 0 ? 'Identical to the current prompt.' : `Sections: ${parts.join(', ')}.`;
};
