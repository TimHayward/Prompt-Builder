/**
 * The framework registry's ordering, and what depends on it.
 *
 * A framework's `types` array is display order for the Type dropdown, but three
 * call sites also read its first entry as a fallback. Moving Role to the front
 * of Standard therefore changes more than a dropdown, and these pin down which
 * of those changes were intended.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TYPE,
  defaultTypeForFramework,
  FRAMEWORKS,
  getFramework,
  getFrameworkForType,
  getTypeLabel,
} from '@/lib/frameworks';
import { resolveTypeForFramework } from '@/utils/markdownImport';

describe('the Standard framework', () => {
  it('offers its types Role first', () => {
    expect(getFramework('standard').types).toEqual([
      'role',
      'instruction',
      'context',
      'format',
      'style',
    ]);
  });

  it('reads as Role, Instruction, Context, Format, Style', () => {
    expect(getFramework('standard').types.map(getTypeLabel)).toEqual([
      'Role',
      'Instruction',
      'Context',
      'Format',
      'Style',
    ]);
  });

  it('is still the framework a legacy type resolves to', () => {
    // Standard stays first in the registry, so a prompt stored before any of
    // this still reports the framework it always did.
    ['instruction', 'role', 'context', 'format', 'style'].forEach(type => {
      expect(getFrameworkForType(type).id).toBe('standard');
    });
  });

  it('leaves the default type for a new section alone', () => {
    // The order changed; what a new section starts as did not.
    expect(DEFAULT_TYPE).toBe('instruction');
  });
});

describe("a framework's default type", () => {
  it('is the component at the top of it', () => {
    FRAMEWORKS.forEach(framework => {
      expect(defaultTypeForFramework(framework.id)).toBe(framework.types[0]);
    });
  });

  it('is Role for Standard', () => {
    expect(defaultTypeForFramework('standard')).toBe('role');
  });

  it('follows the order, so reordering a framework moves its default', () => {
    // The whole point of the rule: the default is not a separate setting to
    // keep in step, it is derived from where a component sits.
    const standard = getFramework('standard');
    expect(defaultTypeForFramework('standard')).toBe(standard.types[0]);
    expect(defaultTypeForFramework('standard')).not.toBe(DEFAULT_TYPE);
  });

  it('falls back to the first framework for an id that does not exist', () => {
    expect(defaultTypeForFramework('no-such-framework')).toBe(FRAMEWORKS[0].types[0]);
  });
});

describe('resolving a markdown header to a type', () => {
  const standard = getFramework('standard');

  it('keeps a header the parser recognised', () => {
    expect(resolveTypeForFramework('context', standard)).toEqual({
      type: 'context',
      matched: true,
    });
  });

  it('falls back to Instruction for a header it could not identify', () => {
    // The regression the reorder would otherwise have caused: unidentifiable
    // prose is far likelier to be an instruction than a role, so this must not
    // follow the dropdown's first entry.
    expect(resolveTypeForFramework(null, standard)).toEqual({
      type: 'instruction',
      matched: false,
    });
  });

  it('falls back to its own first type for a framework with no instruction type', () => {
    const gcse = getFramework('gcse');
    expect(gcse.types).not.toContain('instruction');

    expect(resolveTypeForFramework(null, gcse)).toEqual({
      type: gcse.types[0],
      matched: false,
    });
  });

  it('never reports an unmatched fallback as a match', () => {
    // matched drives the highlight that asks the user to set the type by hand.
    FRAMEWORKS.forEach(framework => {
      expect(resolveTypeForFramework(null, framework).matched).toBe(false);
    });
  });

  it('offers only types the framework actually contains', () => {
    FRAMEWORKS.forEach(framework => {
      const { type } = resolveTypeForFramework(null, framework);
      expect(framework.types as readonly string[]).toContain(type);
    });
  });
});
