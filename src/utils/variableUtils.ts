/**
 * Variable Utilities
 * Functions for extracting and managing prompt variables ({{variable}})
 *
 * One grammar, every part optional:
 *
 *   {{ [!] [label:] name-or-options [=default] [|help] }}
 *
 *   {{tone}}                          free text
 *   {{mail/teams/calendar}}           choice list
 *   {{channel: mail/teams/calendar}}  labelled choice list
 *   {{!customer}}                     required
 *   {{tone: formal/technical=formal}} with a default working value
 *   {{customer|Who is being assessed}} with help text
 *
 * The optional parts are stripped in that order — required marker, help text,
 * default — before the label and options are read, so each is unambiguous.
 */

/**
 * Matches every {{...}} token; group 1 is the raw inner text.
 * Global, so use it only with matchAll/replace (neither leaves lastIndex
 * advanced) — never with .test() or .exec().
 */
export const VARIABLE_TOKEN_REGEX = /\{\{([^}]+)\}\}/g;

/**
 * Tokens opening with one of these are not variables. Reserved for future
 * syntax, e.g. {{> Component Name}} component references.
 *
 * '!' was reserved here until it was given its meaning: it now marks a variable
 * as required.
 */
const RESERVED_SIGILS = ['>', '#'];

/** Marks a variable the prompt expects to be filled in. */
const REQUIRED_SIGIL = '!';

/** Separates help text from the rest of the token. */
const HELP_SEPARATOR = '|';

/** Separates a default working value from the rest of the token. */
const DEFAULT_SEPARATOR = '=';

/**
 * Splits an optional `label:` prefix off the inner text. The label may not
 * contain `/`, which is what stops `https://example.com` parsing as a label.
 */
const LABEL_REGEX = /^([^:/]+):\s*(.+)$/;

export type VariableSpec = {
  /** Storage identity — indexes prompt.variables */
  key: string;
  /** Text shown in the Variables pane */
  label: string;
  /** Predefined choices; empty means free text only */
  options: string[];
  /** Whether the prompt expects this one to be filled in before use */
  required: boolean;
  /** Help text for the pane; empty when the token gives none */
  description: string;
  /**
   * The value to resolve with when the working value is empty.
   *
   * Deliberately not written into the working values: a default has to stay
   * distinguishable from something the user chose, so it is applied at
   * resolution and shown in the pane as a placeholder.
   */
  defaultValue: string;
};

/**
 * Splits an optional trailing part off a token body
 * @param body - What is left of the token
 * @param separator - The character introducing the trailing part
 * @returns The body without it, and the part itself (empty when absent)
 */
const splitTrailing = (body: string, separator: string): [string, string] => {
  // The first occurrence wins, so the trailing part may itself contain the
  // separator: a default of `a=b` reads, a variable named `a=b` does not.
  const at = body.indexOf(separator);
  if (at === -1) return [body, ''];

  return [body.slice(0, at).trim(), body.slice(at + 1).trim()];
};

/**
 * Splits a `/`-separated choice list
 * @param body - The token text after any label prefix
 * @returns The trimmed choices, or [] if this is not a choice list
 */
const parseOptions = (body: string): string[] => {
  const parts = body.split('/').map(part => part.trim());
  // Needs at least two choices, every one non-empty. The non-empty rule is what
  // makes `https://example.com` and `a//b` typos fall through to free text.
  if (parts.length < 2 || parts.some(part => !part)) return [];
  // A choice repeated inside one token is a typo: offering it twice means
  // nothing to the reader, and the duplicate breaks the dropdown's React keys.
  // Deduplicating here matches how the same choice is folded across tokens.
  return [...new Set(parts)];
};

/**
 * Parses the inner text of a single {{...}} token
 * @param inner - The raw text between the braces
 * @returns The variable spec, or null if the token is reserved (not a variable)
 */
export const parseVariableToken = (inner: string): VariableSpec | null => {
  const trimmed = inner.trim();
  if (!trimmed) return null;
  if (RESERVED_SIGILS.includes(trimmed[0])) return null;

  const required = trimmed[0] === REQUIRED_SIGIL;
  const withoutSigil = required ? trimmed.slice(1).trim() : trimmed;
  if (!withoutSigil) return null;

  // Help text first: it is free prose and may contain anything, including an
  // '=' that would otherwise read as a default.
  const [withoutHelp, description] = splitTrailing(withoutSigil, HELP_SEPARATOR);
  const [body, defaultValue] = splitTrailing(withoutHelp, DEFAULT_SEPARATOR);
  if (!body) return null;

  const meta = { required, description, defaultValue };

  const labelMatch = body.match(LABEL_REGEX);
  const label = labelMatch ? labelMatch[1].trim() : '';
  const options = parseOptions(labelMatch ? labelMatch[2] : body);

  // Without a real choice list the token stays a plain free-text variable keyed
  // on its whole inner text, exactly as before choice lists existed. A label
  // only takes effect alongside options, so `{{Note: see below}}` is untouched.
  if (options.length === 0) {
    return { key: body, label: body, options: [], ...meta };
  }

  if (label) {
    return { key: label, label, options, ...meta };
  }

  // Key on the canonical join so spacing is irrelevant: `{{ a / b }}` and
  // `{{a/b}}` are the same variable.
  return { key: options.join('/'), label: options.join(' / '), options, ...meta };
};

/**
 * Adds a spec to a list, or folds it into the existing entry with the same key
 * by unioning the choices in first-appearance order. Keeps the first label seen,
 * so a bare `{{channel}}` and a labelled `{{channel: mail/teams}}` share one
 * pane entry with the same value regardless of which appears first.
 */
const mergeSpec = (specs: VariableSpec[], spec: VariableSpec): void => {
  const existing = specs.find(s => s.key === spec.key);

  if (!existing) {
    specs.push({ ...spec, options: [...spec.options] });
    return;
  }

  spec.options.forEach(option => {
    if (!existing.options.includes(option)) {
      existing.options.push(option);
    }
  });

  // Marking one occurrence required makes the variable required: the prompt has
  // said it needs a value, and the other occurrences share that value.
  existing.required = existing.required || spec.required;
  // Help and default keep the first non-empty answer, as the label does.
  if (!existing.description) existing.description = spec.description;
  if (!existing.defaultValue) existing.defaultValue = spec.defaultValue;
};

/**
 * Extracts all variables from a text string
 * @param text - The text to extract variables from
 * @returns The unique variable specs, in order of first appearance
 */
export const extractVariableSpecs = (text: string): VariableSpec[] => {
  if (!text) return [];

  const specs: VariableSpec[] = [];

  for (const match of text.matchAll(VARIABLE_TOKEN_REGEX)) {
    const spec = parseVariableToken(match[1]);
    if (spec) mergeSpec(specs, spec);
  }

  return specs;
};

/**
 * Extracts variables from multiple sections
 * @param sections - Array of section objects with content property
 * @returns The unique variable specs across all sections
 */
export const extractVariableSpecsFromSections = (
  sections: Array<{ content: string }> | undefined
): VariableSpec[] => {
  if (!sections || sections.length === 0) return [];

  const allSpecs: VariableSpec[] = [];

  sections.forEach(section => {
    extractVariableSpecs(section.content).forEach(spec => mergeSpec(allSpecs, spec));
  });

  return allSpecs;
};

/**
 * Extracts all variable names from a text string
 * @param text - The text to extract variables from
 * @returns An array of unique variable names (without the braces)
 */
export const extractVariables = (text: string): string[] =>
  extractVariableSpecs(text).map(spec => spec.key);

/**
 * Extracts variable names from multiple sections
 * @param sections - Array of section objects with content property
 * @returns An array of unique variable names across all sections
 */
export const extractVariablesFromSections = (
  sections: Array<{ content: string }> | undefined
): string[] => extractVariableSpecsFromSections(sections).map(spec => spec.key);

export type ResolvedText = {
  text: string;
  /** Keys that resolved to nothing, in order of first appearance. */
  unresolved: string[];
  /** Of those, the ones the prompt marks required. */
  missingRequired: string[];
};

/**
 * Substitutes variable values into text
 *
 * Scans the tokens rather than rebuilding them from the names, so variable names
 * containing regex metacharacters are inert and `{{ tone }}` substitutes just
 * like `{{tone}}`.
 *
 * A variable with no value resolves to nothing, whether it was never given one
 * or was given an empty one: the same intent should not produce two different
 * outputs. The names are reported back so a caller can say what was left blank.
 *
 * @param text - The text containing variables
 * @param values - Working values, keyed by variable
 */
export const resolveVariables = (text: string, values: Record<string, string>): ResolvedText => {
  const unresolved: string[] = [];
  const missingRequired: string[] = [];

  const resolved = text.replace(VARIABLE_TOKEN_REGEX, (match, inner: string) => {
    const spec = parseVariableToken(inner);
    if (!spec) return match; // Reserved token, leave it alone

    // The working value wins; the source's default stands in when there is
    // none, which is what makes a default a starting point rather than a choice.
    const value = values[spec.key] || spec.defaultValue;
    if (value) return value;

    if (!unresolved.includes(spec.key)) unresolved.push(spec.key);
    if (spec.required && !missingRequired.includes(spec.key)) missingRequired.push(spec.key);
    return '';
  });

  return { text: resolved, unresolved, missingRequired };
};
