/**
 * Prompt analysis
 *
 * Deterministic checks over a prompt: how big it is, and what looks wrong with
 * it. Nothing here calls a model — every finding is a rule someone can read,
 * disagree with, and predict.
 *
 * All of it measures the resolved prompt, the text the clipboard would get,
 * because that is what a model is actually given.
 */

import type { Prompt, Section } from '@/types';
import { SECTION_TYPE_LABELS } from '@/lib/sectionTypes';
import { extractVariableSpecsFromSections } from '@/utils/variableUtils';

/** Section types that say what the answer should look like. */
const OUTPUT_TYPES = new Set(['format', 'output', 'expectations', 'expectation']);

/**
 * Estimates the tokens a text costs
 *
 * A rule of thumb, not a tokeniser: every provider splits text differently, and
 * pulling in one provider's tokeniser would tie an estimate to a model the app
 * deliberately knows nothing about. Each whitespace-separated word is charged
 * at four characters per token, which is close enough for prose and errs high
 * on code and punctuation.
 *
 * @param text - The resolved text
 * @returns An approximate token count
 */
export const estimateTokens = (text: string): number => {
  const words = text.split(/\s+/).filter(Boolean);

  return words.reduce((total, word) => total + Math.max(1, Math.ceil(word.length / 4)), 0);
};

export type PromptStatistics = {
  characters: number;
  words: number;
  sections: number;
  variables: number;
  estimatedTokens: number;
};

/**
 * Counts what a prompt amounts to
 * @param resolvedText - The text the clipboard would get
 * @param sections - The sections it was built from
 * @returns The counts the statistics panel shows
 */
export const promptStatistics = (
  resolvedText: string,
  sections: Pick<Section, 'content'>[]
): PromptStatistics => ({
  characters: resolvedText.length,
  words: resolvedText.split(/\s+/).filter(Boolean).length,
  // Empty sections contribute nothing to the resolved text, so they are not
  // counted as part of it.
  sections: sections.filter(section => section.content.trim()).length,
  variables: extractVariableSpecsFromSections(sections).length,
  estimatedTokens: estimateTokens(resolvedText),
});

/** How much a finding matters. */
export type LintSeverity = 'warning' | 'suggestion';

export type LintFinding = {
  /** Stable identifier for the rule, so a finding can be styled or suppressed. */
  rule:
    | 'unpopulated-variable'
    | 'missing-linked-component'
    | 'duplicate-section'
    | 'no-output-format'
    | 'conflicting-instructions';
  severity: LintSeverity;
  message: string;
  /** The section the finding is about, when it is about one. */
  sectionId?: string;
};

export type LintInput = {
  prompt: Pick<Prompt, 'sections'>;
  /** The working values entered for this use. */
  values: Record<string, string>;
  /** Ids of every component in the library, for the linked-section check. */
  componentIds: Set<string>;
};

/**
 * Pairs of words that pull in opposite directions.
 *
 * Deliberately small and literal. A prompt asking for both a concise and a
 * comprehensive answer is usually an edit that went half-finished, and that is
 * worth mentioning; anything cleverer than a word list would be guessing, and
 * the item asks for deterministic rules rather than model analysis.
 */
const OPPOSING_TERMS: [string[], string[]][] = [
  [
    ['concise', 'brief', 'short', 'succinct', 'terse'],
    ['comprehensive', 'detailed', 'thorough', 'exhaustive', 'in-depth'],
  ],
  [
    ['formal', 'professional'],
    ['casual', 'informal', 'conversational'],
  ],
  [
    ['bullet points', 'bulleted', 'a list'],
    ['prose', 'paragraphs', 'narrative'],
  ],
];

/** The terms from one side of a pair that appear in a text. */
const termsPresent = (text: string, terms: string[]): string[] =>
  terms.filter(term => new RegExp(`\\b${term}\\b`, 'i').test(text));

/**
 * Checks a prompt against the deterministic rules
 *
 * @param input - The prompt, this use's values, and the library's component ids
 * @returns Every finding, warnings first
 */
export const lintPrompt = ({ prompt, values, componentIds }: LintInput): LintFinding[] => {
  const findings: LintFinding[] = [];
  const filled = prompt.sections.filter(section => section.content.trim());

  // A variable with neither a value nor a default resolves to nothing, which is
  // allowed but rarely intended.
  extractVariableSpecsFromSections(prompt.sections).forEach(spec => {
    if (values[spec.key] || spec.defaultValue) return;

    findings.push({
      rule: 'unpopulated-variable',
      severity: spec.required ? 'warning' : 'suggestion',
      message: spec.required
        ? `${spec.label} is required and has no value.`
        : `${spec.label} has no value, so it will resolve to nothing.`,
    });
  });

  // A section that follows a component the library no longer has will never
  // update again, and nothing else says so.
  prompt.sections.forEach(section => {
    if (!section.linked || !section.linkedComponentId) return;
    if (componentIds.has(section.linkedComponentId)) return;

    findings.push({
      rule: 'missing-linked-component',
      severity: 'warning',
      message: `"${section.name}" follows a component that is no longer in the library.`,
      sectionId: section.id,
    });
  });

  // The same text twice is almost always a paste that was meant to replace.
  const seen = new Map<string, Section>();
  filled.forEach(section => {
    const key = section.content.trim();
    const first = seen.get(key);

    if (first) {
      findings.push({
        rule: 'duplicate-section',
        severity: 'warning',
        message: `"${section.name}" says exactly what "${first.name}" says.`,
        sectionId: section.id,
      });
      return;
    }

    seen.set(key, section);
  });

  if (filled.length > 0 && !filled.some(section => OUTPUT_TYPES.has(section.type))) {
    const named = [...OUTPUT_TYPES].map(type => SECTION_TYPE_LABELS[type as never] ?? type);

    findings.push({
      rule: 'no-output-format',
      severity: 'suggestion',
      message: `Nothing says what the answer should look like. Add a ${named.slice(0, 2).join(' or ')} section.`,
    });
  }

  const wholePrompt = filled.map(section => section.content).join('\n');
  OPPOSING_TERMS.forEach(([left, right]) => {
    const first = termsPresent(wholePrompt, left);
    const second = termsPresent(wholePrompt, right);

    if (first.length === 0 || second.length === 0) return;

    findings.push({
      rule: 'conflicting-instructions',
      severity: 'suggestion',
      message: `This prompt asks for both "${first[0]}" and "${second[0]}".`,
    });
  });

  // Warnings first: they are the ones worth acting on.
  return [
    ...findings.filter(finding => finding.severity === 'warning'),
    ...findings.filter(finding => finding.severity === 'suggestion'),
  ];
};
