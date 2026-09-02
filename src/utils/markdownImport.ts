/**
 * Markdown import utilities
 *
 * Framework detection and type resolution for the interactive import. The
 * document is split by the shared parser in markdownSections.ts, so this path
 * and the server ingest route see exactly the same sections.
 */

import {
  FRAMEWORKS,
  DEFAULT_FRAMEWORK_ID,
  Framework,
  FrameworkId,
  SectionTypeValue,
} from "@/lib/frameworks";
import { parseMarkdownSections, type ParsedSection } from "@/utils/markdownSections";

export type ParsedHeaderSection = ParsedSection;

export { suggestSectionType } from "@/lib/sectionTypes";

/**
 * Split markdown content into sections. See markdownSections.ts for the rules;
 * kept as a named re-export so the import modal's call site stays descriptive.
 */
export const parseMarkdownByHeaders = (content: string): ParsedHeaderSection[] =>
  parseMarkdownSections(content);

// Cross-framework type equivalences, used to map a suggested type onto the
// closest available type within a chosen framework.
const EQUIVALENTS: Partial<Record<SectionTypeValue, SectionTypeValue[]>> = {
  task: ["instruction", "instructions"],
  instruction: ["task", "instructions"],
  instructions: ["task", "instruction"],
  format: ["output"],
  output: ["format"],
  goal: ["end-goal", "expectations", "expectation"],
  "end-goal": ["goal"],
  expectations: ["expectation", "goal"],
  expectation: ["expectations", "goal"],
  constraints: ["narrowing"],
  narrowing: ["constraints"],
  context: ["input", "source"],
  input: ["context"],
  source: ["context"],
  steps: ["instructions", "instruction"],
};

export interface ResolvedType {
  type: SectionTypeValue;
  matched: boolean;
}

/**
 * Resolve a suggested type to a type available within the given framework.
 * Falls back to the framework's first type with `matched: false` when nothing
 * lines up, so the UI can flag the row for the user to set manually.
 */
export const resolveTypeForFramework = (
  suggested: SectionTypeValue | null,
  framework: Framework
): ResolvedType => {
  const types = framework.types as readonly SectionTypeValue[];
  if (suggested && types.includes(suggested)) {
    return { type: suggested, matched: true };
  }
  if (suggested) {
    const equivalents = EQUIVALENTS[suggested] ?? [];
    for (const eq of equivalents) {
      if (types.includes(eq)) {
        return { type: eq, matched: true };
      }
    }
  }
  return { type: types[0], matched: false };
};

/**
 * Pick the framework whose types best cover the parsed headers.
 * Ties resolve to the earlier framework (Standard first); no matches at all
 * falls back to the default framework.
 */
export const detectFramework = (sections: ParsedHeaderSection[]): FrameworkId => {
  let best: FrameworkId = DEFAULT_FRAMEWORK_ID;
  let bestScore = -1;

  for (const framework of FRAMEWORKS) {
    let score = 0;
    for (const section of sections) {
      if (resolveTypeForFramework(section.suggestedType, framework).matched) {
        score++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = framework.id;
    }
  }

  return best;
};
