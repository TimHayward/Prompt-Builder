/**
 * Section type registry
 *
 * The data half of the framework registry: type keys, labels, framework
 * membership, and the header phrasings that map onto a type. Deliberately free
 * of React and MUI so the API routes and the Markdown parser can share one
 * registry with the UI instead of keeping their own copies — frameworks.ts adds
 * the icons and colours on top of this.
 */

export const SECTION_TYPE_LABELS = {
  // Legacy values — stored in existing DBs, must not be renamed
  instruction: "Instruction",
  role: "Role",
  context: "Context",
  format: "Format",
  style: "Style",
  // Framework-specific values
  task: "Task",
  constraints: "Constraints",
  output: "Output",
  goal: "Goal",
  source: "Source",
  expectations: "Expectations",
  input: "Input",
  steps: "Steps",
  expectation: "Expectation",
  instructions: "Instructions",
  "end-goal": "End Goal",
  narrowing: "Narrowing",
} as const;

export type SectionTypeValue = keyof typeof SECTION_TYPE_LABELS;

export const ALL_TYPE_VALUES = Object.keys(SECTION_TYPE_LABELS) as SectionTypeValue[];

export const DEFAULT_TYPE: SectionTypeValue = 'instruction';

export const isValidSectionType = (value: unknown): value is SectionTypeValue =>
  typeof value === 'string' && value in SECTION_TYPE_LABELS;

export interface FrameworkDefinition {
  id: string;
  label: string;
  /** Ordered as displayed in the Type dropdown */
  types: readonly SectionTypeValue[];
}

export const FRAMEWORK_DEFINITIONS = [
  { id: 'standard', label: 'Standard', types: ['instruction', 'role', 'context', 'format', 'style'] },
  { id: 'rctcso', label: 'R-C-T-C-S-O', types: ['role', 'context', 'task', 'constraints', 'style', 'output'] },
  { id: 'gcse', label: 'GCSE', types: ['goal', 'context', 'source', 'expectations'] },
  { id: 'rise', label: 'RISE', types: ['role', 'input', 'steps', 'expectation'] },
  { id: 'risen', label: 'RISEN', types: ['role', 'instructions', 'steps', 'end-goal', 'narrowing'] },
] as const satisfies readonly FrameworkDefinition[];

export type FrameworkId = (typeof FRAMEWORK_DEFINITIONS)[number]['id'];

export const DEFAULT_FRAMEWORK_ID: FrameworkId = 'standard';

/**
 * Header phrasings that are not a type key or label. Everything else is derived,
 * so a new type needs no entry here unless people write it another way.
 */
const HEADER_ALIASES: Record<string, SectionTypeValue> = {
  'output format': 'format',
  outputs: 'output',
  constraint: 'constraints',
  'end goal': 'end-goal',
  endgoal: 'end-goal',
  persona: 'role',
  background: 'context',
  objective: 'goal',
  tone: 'style',
  inputs: 'input',
  sources: 'source',
  step: 'steps',
  // The ingest format's own phrasings
  task: 'task',
  constraints: 'constraints',
};

/** Normalised header text → section type, built from keys, labels and aliases. */
const TYPE_LOOKUP: Record<string, SectionTypeValue> = (() => {
  const map: Record<string, SectionTypeValue> = {};
  ALL_TYPE_VALUES.forEach(key => {
    map[key.toLowerCase()] = key;
    map[SECTION_TYPE_LABELS[key].toLowerCase()] = key;
  });
  return Object.assign(map, HEADER_ALIASES);
})();

/** Strips markdown emphasis, a trailing colon, and case from a header. */
export const normalizeHeader = (header: string): string =>
  header
    .trim()
    .toLowerCase()
    .replace(/[:：]\s*$/, '')
    .replace(/[*_`#]/g, '')
    .trim();

/**
 * Maps a header to a section type
 * @param header - The raw header text
 * @returns The type, or null when nothing in the registry matches
 */
export const suggestSectionType = (header: string): SectionTypeValue | null =>
  TYPE_LOOKUP[normalizeHeader(header)] ?? null;
