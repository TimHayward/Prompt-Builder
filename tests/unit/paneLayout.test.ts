/**
 * The rules that decide what a legal pane layout is.
 *
 * These matter more than they look: a width comes from a pointer position or
 * from storage written against a window that no longer exists, so the two jobs
 * here are keeping a pane usable and never letting a stale number reach a style
 * attribute.
 */
import { describe, expect, it } from 'vitest';
import {
  clampLayout,
  clampPaneWidth,
  defaultLayout,
  defaultPaneWidth,
  maxPaneWidth,
  parseStoredLayout,
  renderedWidth,
  MAX_PANE_RATIO,
  MIN_PANE_WIDTH,
  NARROW_SIDEBAR_RATIO,
  type PaneLayout,
} from '@/domain/paneLayout';

const WIDE = 1920;
const TYPICAL = 1440;

describe('maxPaneWidth', () => {
  it('is a share of the window', () => {
    expect(maxPaneWidth(TYPICAL)).toBe(Math.round(TYPICAL * MAX_PANE_RATIO));
  });

  it('never falls below the minimum, however narrow the window', () => {
    // A maximum under the minimum would leave no width legal at all.
    expect(maxPaneWidth(320)).toBe(MIN_PANE_WIDTH);
    expect(maxPaneWidth(0)).toBe(MIN_PANE_WIDTH);
  });
});

describe('clampPaneWidth', () => {
  it('leaves a width inside the bounds alone', () => {
    expect(clampPaneWidth(400, TYPICAL)).toBe(400);
  });

  it('holds a width at the minimum', () => {
    expect(clampPaneWidth(20, TYPICAL)).toBe(MIN_PANE_WIDTH);
    expect(clampPaneWidth(-500, TYPICAL)).toBe(MIN_PANE_WIDTH);
  });

  it('holds a width at the maximum', () => {
    expect(clampPaneWidth(5000, TYPICAL)).toBe(maxPaneWidth(TYPICAL));
  });

  it('rounds, so a pointer position cannot produce a fractional width', () => {
    expect(clampPaneWidth(400.6, TYPICAL)).toBe(401);
  });

  it('falls back to the default rather than passing NaN into a style', () => {
    expect(clampPaneWidth(Number.NaN, TYPICAL)).toBe(defaultPaneWidth(TYPICAL));
    expect(clampPaneWidth(Number.POSITIVE_INFINITY, TYPICAL)).toBe(defaultPaneWidth(TYPICAL));
  });
});

describe('defaultPaneWidth', () => {
  it('is a quarter of the window, as the fixed CSS width was', () => {
    expect(defaultPaneWidth(TYPICAL, 'sidebar')).toBe(360);
    expect(defaultPaneWidth(TYPICAL, 'variables')).toBe(360);
  });

  it('gives the sidebar a larger share on a narrow window, as the CSS did', () => {
    // The stylesheet's own @media (max-width: 1200px) rule, in numbers. The two
    // have to agree or the panes jump when the hook takes over from the CSS.
    expect(defaultPaneWidth(1100, 'sidebar')).toBe(Math.round(1100 * NARROW_SIDEBAR_RATIO));
  });

  it('leaves the variables pane at a quarter, which never had that rule', () => {
    // Widening both would spend a small window's remaining room on chrome.
    expect(defaultPaneWidth(1100, 'variables')).toBe(275);
  });

  it('is still usable on a very narrow window', () => {
    expect(defaultPaneWidth(600, 'sidebar')).toBeGreaterThanOrEqual(MIN_PANE_WIDTH);
    expect(defaultPaneWidth(400, 'variables')).toBeGreaterThanOrEqual(MIN_PANE_WIDTH);
  });
});

describe('clampLayout', () => {
  it('brings both panes back in range when the window has shrunk', () => {
    const roomy: PaneLayout = {
      sidebar: 700,
      variables: 700,
      sidebarCollapsed: false,
      variablesCollapsed: true,
    };

    const cramped = clampLayout(roomy, 1000);

    expect(cramped.sidebar).toBe(maxPaneWidth(1000));
    expect(cramped.variables).toBe(maxPaneWidth(1000));
    // Re-clamping is about widths; what is hidden is the user's choice.
    expect(cramped.variablesCollapsed).toBe(true);
  });
});

describe('parseStoredLayout', () => {
  it('gives the default when nothing is stored', () => {
    expect(parseStoredLayout(null, TYPICAL)).toEqual(defaultLayout(TYPICAL));
  });

  it('gives the default for a value that is not JSON', () => {
    expect(parseStoredLayout('{not json', TYPICAL)).toEqual(defaultLayout(TYPICAL));
  });

  it('gives the default for JSON that is not an object', () => {
    expect(parseStoredLayout('42', TYPICAL)).toEqual(defaultLayout(TYPICAL));
    expect(parseStoredLayout('null', TYPICAL)).toEqual(defaultLayout(TYPICAL));
    expect(parseStoredLayout('"360"', TYPICAL)).toEqual(defaultLayout(TYPICAL));
  });

  it('reads a layout it wrote itself', () => {
    const stored: PaneLayout = {
      sidebar: 300,
      variables: 420,
      sidebarCollapsed: false,
      variablesCollapsed: true,
    };

    expect(parseStoredLayout(JSON.stringify(stored), WIDE)).toEqual(stored);
  });

  it('re-clamps a width stored against a larger window', () => {
    // Written on a 1920 screen, reopened on a 1000 one.
    const stored = JSON.stringify({ sidebar: 700, variables: 700 });

    const layout = parseStoredLayout(stored, 1000);

    expect(layout.sidebar).toBe(maxPaneWidth(1000));
    expect(layout.variables).toBe(maxPaneWidth(1000));
  });

  it('takes what it can from a partial blob and defaults the rest', () => {
    const layout = parseStoredLayout(JSON.stringify({ sidebar: 280 }), TYPICAL);

    expect(layout.sidebar).toBe(280);
    expect(layout.variables).toBe(defaultPaneWidth(TYPICAL));
    expect(layout.sidebarCollapsed).toBe(false);
  });

  it('ignores fields of the wrong type', () => {
    const layout = parseStoredLayout(
      JSON.stringify({ sidebar: 'wide', variables: null, sidebarCollapsed: 'yes' }),
      TYPICAL
    );

    expect(layout.sidebar).toBe(defaultPaneWidth(TYPICAL));
    expect(layout.variables).toBe(defaultPaneWidth(TYPICAL));
    // Only a true boolean hides a pane, so a truthy string does not.
    expect(layout.sidebarCollapsed).toBe(false);
  });
});

describe('renderedWidth', () => {
  const layout: PaneLayout = {
    sidebar: 340,
    variables: 300,
    sidebarCollapsed: true,
    variablesCollapsed: false,
  };

  it('is zero for a hidden pane', () => {
    expect(renderedWidth(layout, 'sidebar')).toBe(0);
  });

  it('is the stored width for a showing pane', () => {
    expect(renderedWidth(layout, 'variables')).toBe(300);
  });

  it('keeps a hidden pane its width, so showing it again restores the size', () => {
    expect(layout.sidebar).toBe(340);
  });
});
