/**
 * Variable Utilities
 * Functions for extracting and managing prompt variables ({{variable}})
 *
 * Three token forms are recognised:
 *   {{tone}}                          free text
 *   {{mail/teams/calendar}}           choice list
 *   {{channel: mail/teams/calendar}}  labelled choice list
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
 */
const RESERVED_SIGILS = ['>', '#', '!'];

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
  return parts;
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

  const labelMatch = trimmed.match(LABEL_REGEX);
  const label = labelMatch ? labelMatch[1].trim() : '';
  const options = parseOptions(labelMatch ? labelMatch[2] : trimmed);

  // Without a real choice list the token stays a plain free-text variable keyed
  // on its whole inner text, exactly as before choice lists existed. A label
  // only takes effect alongside options, so `{{Note: see below}}` is untouched.
  if (options.length === 0) {
    return { key: trimmed, label: trimmed, options: [] };
  }

  if (label) {
    return { key: label, label, options };
  }

  // Key on the canonical join so spacing is irrelevant: `{{ a / b }}` and
  // `{{a/b}}` are the same variable.
  return { key: options.join('/'), label: options.join(' / '), options };
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

/**
 * Replaces variable values in text
 *
 * Scans the tokens rather than rebuilding them from the names, so variable names
 * containing regex metacharacters are inert and `{{ tone }}` substitutes just
 * like `{{tone}}`.
 *
 * @param text - The text containing variables
 * @param variables - Object mapping variable names to their values
 * @returns Text with variables replaced with their values
 */
export const replaceVariables = (
  text: string,
  variables: Record<string, string>
): string =>
  text.replace(VARIABLE_TOKEN_REGEX, (match, inner: string) => {
    const spec = parseVariableToken(inner);
    if (!spec) return match; // Reserved token, leave it alone
    // An unknown variable stays as-is; a known but empty one drops out
    return spec.key in variables ? (variables[spec.key] || '') : match;
  });
