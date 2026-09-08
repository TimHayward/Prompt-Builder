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
  instruction: 'Instruction',
  role: 'Role',
  context: 'Context',
  format: 'Format',
  style: 'Style',
  // Framework-specific values
  task: 'Task',
  constraints: 'Constraints',
  output: 'Output',
  goal: 'Goal',
  source: 'Source',
  expectations: 'Expectations',
  input: 'Input',
  steps: 'Steps',
  expectation: 'Expectation',
  instructions: 'Instructions',
  'end-goal': 'End Goal',
  narrowing: 'Narrowing',
} as const;

/** The keys of the built-in label map, for indexing it. */
type BuiltInTypeKey = keyof typeof SECTION_TYPE_LABELS;

/**
 * A section's type: the id of a framework component.
 *
 * A plain string rather than a union of the built-in keys. Frameworks are
 * editable data since migration 9, so the set of valid types is a table someone
 * can add to, and a compile-time union could only ever describe what shipped.
 *
 * The built-in keys keep their own type above for indexing `SECTION_TYPE_LABELS`,
 * and `isValidSectionType` still answers whether a value is one of them. What
 * is gone is the compiler refusing an unknown string — deliberately, since the
 * point is to accept types the user invented. `getTypeMeta` answers for
 * anything it does not recognise, so an unknown type degrades to the default
 * label and colour rather than breaking the prompt holding it.
 */
export type SectionTypeValue = string;

/** The built-in types, in the order they were declared. */
export const ALL_TYPE_VALUES = Object.keys(SECTION_TYPE_LABELS) as BuiltInTypeKey[];

export const DEFAULT_TYPE: SectionTypeValue = 'instruction';

export const isValidSectionType = (value: unknown): value is SectionTypeValue =>
  typeof value === 'string' && value in SECTION_TYPE_LABELS;

/**
 * The built-in label for a type, or undefined when it is not a built-in one
 *
 * Callers that want to print a type choose their own fallback: the compiler
 * prints the raw id, which preserves what a user-created component is called,
 * where the UI prefers `getTypeLabel`'s default so nothing renders blank.
 *
 * Once the framework editor lands this becomes a lookup over the loaded
 * frameworks; the signature is already what that needs.
 */
export const builtInTypeLabel = (type: string): string | undefined =>
  (SECTION_TYPE_LABELS as Record<string, string>)[type];

export interface FrameworkDefinition {
  id: string;
  label: string;
  /** Ordered as displayed in the Type dropdown */
  types: readonly SectionTypeValue[];
}

export const FRAMEWORK_DEFINITIONS = [
  {
    id: 'standard',
    // Role first: who the model is answering as is decided before what it is
    // being asked for. This is display order only — the type keys are what
    // prompts store, and they are untouched.
    label: 'Standard',
    types: ['role', 'instruction', 'context', 'format', 'style'],
  },
  {
    id: 'rctcso',
    label: 'R-C-T-C-S-O',
    types: ['role', 'context', 'task', 'constraints', 'style', 'output'],
  },
  { id: 'gcse', label: 'GCSE', types: ['goal', 'context', 'source', 'expectations'] },
  { id: 'rise', label: 'RISE', types: ['role', 'input', 'steps', 'expectation'] },
  {
    id: 'risen',
    label: 'RISEN',
    types: ['role', 'instructions', 'steps', 'end-goal', 'narrowing'],
  },
] as const satisfies readonly FrameworkDefinition[];

export type FrameworkId = (typeof FRAMEWORK_DEFINITIONS)[number]['id'];

export const DEFAULT_FRAMEWORK_ID: FrameworkId = 'standard';

/**
 * A framework's default type: the component at the top of it
 *
 * The order of a framework's types is meaningful — it is the order they are
 * read in, and the order the Type dropdown shows — so whatever sits at the top
 * is what choosing that framework should land on. Standard therefore defaults
 * to Role. Derived rather than stored, so reordering a framework moves its
 * default with it instead of leaving a second value to keep in step.
 *
 * Deliberately distinct from DEFAULT_TYPE, which is not a framework's default
 * but the fallback for text nothing could identify — an unrecognisable heading
 * is far likelier to be an instruction than a role. The two happened to be the
 * same value until Role moved to the front of Standard.
 *
 * Lives here rather than in frameworks.ts so the API route's defaults can use
 * it without pulling MUI icons into the server bundle.
 */
export const defaultTypeForFramework = (id: string): SectionTypeValue => {
  const framework =
    FRAMEWORK_DEFINITIONS.find(candidate => candidate.id === id) ?? FRAMEWORK_DEFINITIONS[0];
  return framework.types[0];
};

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
