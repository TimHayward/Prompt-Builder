/**
 * K1: a change made for the current use, not to the prompt.
 *
 * These cover the rules the overrides rest on; the guarantee that the stored
 * prompt is never written is checked against the real contexts in
 * workingPrompt.test.tsx.
 */
import { describe, expect, it } from 'vitest';
import {
  applySectionOverrides,
  clearOverride,
  countOverrides,
  effectiveContent,
  setOverride,
} from '@/domain/sectionOverrides';
import type { Section } from '@/types';

const section = (id: string, content: string): Section => ({
  id,
  name: id,
  content,
  type: 'instruction',
  open: true,
  dirty: false,
});

const COMPREHENSIVE = 'Produce a comprehensive assessment.';
const CONCISE = 'Produce a concise assessment.';

describe('the text a section resolves with', () => {
  it('is the source when this use has changed nothing', () => {
    expect(effectiveContent(section('s1', COMPREHENSIVE), {})).toBe(COMPREHENSIVE);
  });

  it('is the override once there is one', () => {
    expect(effectiveContent(section('s1', COMPREHENSIVE), { s1: CONCISE })).toBe(CONCISE);
  });

  it('is an empty override, not the source behind it', () => {
    // Emptying a section for this use is a real intent, distinct from not
    // having changed it.
    expect(effectiveContent(section('s1', COMPREHENSIVE), { s1: '' })).toBe('');
  });
});

describe('applying overrides to a prompt', () => {
  const sections = [section('s1', COMPREHENSIVE), section('s2', 'Second.')];

  it('substitutes only what changed, in the same order', () => {
    const applied = applySectionOverrides(sections, { s1: CONCISE });

    expect(applied.map(s => s.content)).toEqual([CONCISE, 'Second.']);
    expect(applied.map(s => s.id)).toEqual(['s1', 's2']);
  });

  it('leaves the stored sections alone', () => {
    applySectionOverrides(sections, { s1: CONCISE });

    expect(sections[0].content).toBe(COMPREHENSIVE);
  });

  it('returns the same array when nothing changed', () => {
    expect(applySectionOverrides(sections, {})).toBe(sections);
  });

  it('ignores an override for a section that no longer exists', () => {
    const applied = applySectionOverrides(sections, { 'gone-away': 'orphan' });

    expect(applied.map(s => s.content)).toEqual([COMPREHENSIVE, 'Second.']);
  });
});

describe('recording a change', () => {
  it('stores what was typed', () => {
    expect(setOverride({}, section('s1', COMPREHENSIVE), CONCISE)).toEqual({ s1: CONCISE });
  });

  it('drops the override when the text matches the source again', () => {
    // Typing your way back to what the prompt says is not a change.
    expect(setOverride({ s1: CONCISE }, section('s1', COMPREHENSIVE), COMPREHENSIVE)).toEqual({});
  });

  it('leaves other sections alone', () => {
    const overrides = setOverride({ s2: 'kept' }, section('s1', COMPREHENSIVE), CONCISE);

    expect(overrides).toEqual({ s2: 'kept', s1: CONCISE });
  });

  it('keeps an emptied section as a change', () => {
    expect(setOverride({}, section('s1', COMPREHENSIVE), '')).toEqual({ s1: '' });
  });
});

describe('reverting', () => {
  it('removes one section, keeping the rest', () => {
    expect(clearOverride({ s1: CONCISE, s2: 'kept' }, 's1')).toEqual({ s2: 'kept' });
  });

  it('does nothing for a section that was never changed', () => {
    expect(clearOverride({ s2: 'kept' }, 's1')).toEqual({ s2: 'kept' });
  });

  it('counts what this use has changed', () => {
    expect(countOverrides({})).toBe(0);
    expect(countOverrides({ s1: CONCISE, s2: 'other' })).toBe(2);
  });
});
