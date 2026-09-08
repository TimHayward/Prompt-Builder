/**
 * Framework component usage
 *
 * Answers "would removing this framework component orphan anything?".
 *
 * Deliberately not `findComponentUsage` in componentLinks: that answers a
 * different question. It matches a section's `linkedComponentId` — which
 * library component a section came from — whereas this matches a section's
 * `type`, which is the framework component it *is*. The two are unrelated
 * fields that happen to hold ids.
 */

import type { ComponentType, FolderType, Prompt, TreeNode } from '@/types';

export type TypeUsage = {
  /** Prompt sections whose type is this component. */
  sections: number;
  /** Names of the prompts holding them, each once. */
  prompts: string[];
  /** Library components saved as this type. */
  libraryComponents: number;
};

/** Every component in the library tree, at any depth. */
const flattenComponents = (nodes: TreeNode[]): ComponentType[] =>
  nodes.flatMap(node =>
    node.type === 'folder' ? flattenComponents(node.children) : [node as ComponentType]
  );

/**
 * Counts what a framework component is used by
 *
 * @param prompts - Every prompt currently loaded
 * @param tree - The component library
 * @param typeId - The framework component's id, as stored on a section
 */
export const findTypeUsage = (prompts: Prompt[], tree: FolderType[], typeId: string): TypeUsage => {
  const usage: TypeUsage = { sections: 0, prompts: [], libraryComponents: 0 };

  prompts.forEach(prompt => {
    const matching = prompt.sections.filter(section => section.type === typeId).length;
    if (matching === 0) return;

    usage.sections += matching;
    usage.prompts.push(prompt.name);
  });

  usage.libraryComponents = flattenComponents(tree).filter(
    component => component.componentType === typeId
  ).length;

  return usage;
};

/** Whether anything at all uses the component. */
export const isTypeInUse = (usage: TypeUsage): boolean =>
  usage.sections > 0 || usage.libraryComponents > 0;

/**
 * Why the component cannot be removed, or null when it can
 *
 * Names what is using it rather than only refusing: "in use" without saying
 * where leaves the user hunting through every prompt they have.
 *
 * @param usage - The result of findTypeUsage
 * @param label - What the component is called, for the message
 */
export const describeTypeUsage = (usage: TypeUsage, label: string): string | null => {
  if (!isTypeInUse(usage)) return null;

  const parts: string[] = [];

  if (usage.sections > 0) {
    const sections = usage.sections === 1 ? '1 section' : `${usage.sections} sections`;
    const where =
      usage.prompts.length === 1 ? `"${usage.prompts[0]}"` : `${usage.prompts.length} prompts`;
    parts.push(`${sections} in ${where}`);
  }

  if (usage.libraryComponents > 0) {
    parts.push(
      usage.libraryComponents === 1
        ? '1 library component'
        : `${usage.libraryComponents} library components`
    );
  }

  return `"${label}" is still used by ${parts.join(' and ')}, so it cannot be removed.`;
};
