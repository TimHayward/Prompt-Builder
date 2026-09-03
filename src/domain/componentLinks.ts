/**
 * Component linkage
 *
 * Answers "what would change if this component changed?". Only sections that
 * were explicitly linked follow a component; a copy keeps its origin for
 * reference and is unaffected, so both are counted separately.
 */

import type { Prompt } from '@/types';

export type ComponentUsage = {
  /** Sections that will change when the component is saved. */
  linkedSections: number;
  /** Prompts containing at least one such section. */
  linkedPrompts: string[];
  /** Sections that came from this component but no longer follow it. */
  copiedSections: number;
};

/**
 * Counts where a component is used
 * @param prompts - Every prompt currently loaded
 * @param componentId - The component about to be edited
 */
export const findComponentUsage = (prompts: Prompt[], componentId: string): ComponentUsage => {
  const usage: ComponentUsage = { linkedSections: 0, linkedPrompts: [], copiedSections: 0 };

  prompts.forEach(prompt => {
    let promptHasLink = false;

    prompt.sections.forEach(section => {
      if (section.linkedComponentId !== componentId) return;

      if (section.linked) {
        usage.linkedSections += 1;
        promptHasLink = true;
      } else {
        usage.copiedSections += 1;
      }
    });

    if (promptHasLink) usage.linkedPrompts.push(prompt.name);
  });

  return usage;
};

/**
 * The warning to show before saving, or null when nothing follows the component
 * @param usage - The result of findComponentUsage
 */
export const describeComponentUsage = (usage: ComponentUsage): string | null => {
  if (usage.linkedSections === 0) return null;

  const sections = usage.linkedSections === 1 ? '1 section' : `${usage.linkedSections} sections`;
  const prompts =
    usage.linkedPrompts.length === 1
      ? `"${usage.linkedPrompts[0]}"`
      : `${usage.linkedPrompts.length} prompts`;

  return `Saving will also change ${sections} in ${prompts}, which follow this component.`;
};
