/**
 * Markdown import utilities
 * Parses a Markdown prompt (one component per top-level `#` header) and maps
 * headers to framework section types. Kept separate from markdownParser.ts,
 * which is used by the server ingest route and must not pull in frameworks.ts
 * (and its MUI icon imports) into the server bundle.
 */

import {
  FRAMEWORKS,
  SECTION_TYPES,
  DEFAULT_FRAMEWORK_ID,
  Framework,
  FrameworkId,
  SectionTypeValue,
} from "@/lib/frameworks";

export interface ParsedHeaderSection {
  name: string;
  content: string;
  suggestedType: SectionTypeValue | null;
}

// Lookup from normalized header text -> section type, built from the registry
// (keys + labels) plus a small set of common alias phrasings.
const TYPE_LOOKUP: Record<string, SectionTypeValue> = (() => {
  const map: Record<string, SectionTypeValue> = {};
  (Object.keys(SECTION_TYPES) as SectionTypeValue[]).forEach((key) => {
    map[key.toLowerCase()] = key;
    map[SECTION_TYPES[key].label.toLowerCase()] = key;
  });
  const aliases: Record<string, SectionTypeValue> = {
    "output format": "format",
    outputs: "output",
    constraint: "constraints",
    "end goal": "end-goal",
    endgoal: "end-goal",
    persona: "role",
    background: "context",
    objective: "goal",
    tone: "style",
    inputs: "input",
    sources: "source",
    step: "steps",
  };
  Object.assign(map, aliases);
  return map;
})();

const normalizeHeader = (header: string): string =>
  header
    .trim()
    .toLowerCase()
    .replace(/[:：]\s*$/, "")
    .replace(/[*_`]/g, "")
    .trim();

export const suggestSectionType = (header: string): SectionTypeValue | null => {
  const normalized = normalizeHeader(header);
  return TYPE_LOOKUP[normalized] ?? null;
};

const HEADER_REGEX = /^#(?!#)\s*(.+)$/;
const FENCE_REGEX = /^\s*(```|~~~)/;

/**
 * Split markdown content into sections at each top-level `#` header.
 * - `##`+ headers are treated as ordinary content.
 * - Headers inside fenced code blocks are ignored.
 * - A `# type: Title` header (the app's own compiled format) is split so the
 *   left side becomes the suggested type and the right side the name.
 * - Content before the first `#` header is ignored (preamble).
 */
export const parseMarkdownByHeaders = (content: string): ParsedHeaderSection[] => {
  const lines = content.split(/\r?\n/);
  const sections: ParsedHeaderSection[] = [];
  let current: ParsedHeaderSection | null = null;
  let inFence = false;

  const pushCurrent = () => {
    if (current) {
      current.content = current.content.trim();
      sections.push(current);
    }
  };

  for (const line of lines) {
    if (FENCE_REGEX.test(line)) {
      inFence = !inFence;
      if (current) current.content += (current.content ? "\n" : "") + line;
      continue;
    }

    const match = inFence ? null : line.match(HEADER_REGEX);
    if (match) {
      pushCurrent();
      const rawHeader = match[1].trim();

      // Support "# type: Title" compiled format.
      const colonIndex = rawHeader.indexOf(":");
      let name = rawHeader;
      let suggestedType: SectionTypeValue | null = null;
      if (colonIndex > -1) {
        const left = rawHeader.slice(0, colonIndex);
        const right = rawHeader.slice(colonIndex + 1).trim();
        const leftType = suggestSectionType(left);
        if (leftType && right) {
          suggestedType = leftType;
          name = right;
        }
      }
      if (!suggestedType) {
        suggestedType = suggestSectionType(rawHeader);
      }
      // Clean a trailing colon from the display name (e.g. "# Role:" -> "Role")
      name = name.replace(/:\s*$/, "").trim();

      // Keep the original heading line as the first line of the content
      current = { name, content: line, suggestedType };
      continue;
    }

    if (current) {
      current.content += (current.content ? "\n" : "") + line;
    }
  }

  pushCurrent();
  return sections;
};

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
