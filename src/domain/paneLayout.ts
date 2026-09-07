/**
 * Side pane layout
 *
 * The widths of the Library and Variables panes, and whether either is hidden.
 * Pure functions over plain numbers: the rules about what a legal layout is
 * belong here rather than in the pointer handlers, so they can be reasoned
 * about and tested without a browser.
 *
 * This is chrome, not data. It is remembered per browser and deliberately kept
 * out of Settings, whose contents travel inside a library backup — a pane width
 * has no business being exported, or overwritten by someone else's import.
 */

/** Below this a pane is too narrow to use: the tree and the fields stop fitting. */
export const MIN_PANE_WIDTH = 200;

/** Neither pane may take more than this share of the window. */
export const MAX_PANE_RATIO = 0.4;

/** What a pane is worth before anyone drags it, matching the original CSS. */
export const DEFAULT_PANE_RATIO = 0.25;

/**
 * Below this width the *sidebar* gets a larger share, as the stylesheet has
 * always given it: a quarter of a small window is too narrow for a tree.
 *
 * Only the sidebar. The variables pane never had this rule, and giving it one
 * would take a narrow window's remaining room away from the editor — the
 * opposite of the point.
 */
export const NARROW_VIEWPORT = 1200;
export const NARROW_SIDEBAR_RATIO = 0.35;

/** How far one arrow-key press moves a divider. */
export const KEYBOARD_STEP = 16;

export type PaneLayout = {
  /** Width of the Library pane in pixels, whether or not it is showing. */
  sidebar: number;
  /** Width of the Variables pane in pixels, whether or not it is showing. */
  variables: number;
  sidebarCollapsed: boolean;
  variablesCollapsed: boolean;
};

/** Which pane a divider governs. */
export type PaneSide = 'sidebar' | 'variables';

/**
 * The widest a pane may be for a given window
 *
 * Never below the minimum: on a very narrow window the floor wins, because a
 * maximum under the minimum would make every width illegal.
 */
export const maxPaneWidth = (viewportWidth: number): number =>
  Math.max(MIN_PANE_WIDTH, Math.round(viewportWidth * MAX_PANE_RATIO));

/** The arithmetic alone, so the two exports below cannot circle each other. */
const bound = (width: number, viewportWidth: number): number =>
  Math.min(Math.max(Math.round(width), MIN_PANE_WIDTH), maxPaneWidth(viewportWidth));

/**
 * A pane's width before anyone has moved it
 *
 * Deliberately the same arithmetic the stylesheet's own fallbacks express —
 * 25vw, and 35vw for the sidebar under NARROW_VIEWPORT. Keeping the two in step
 * is what stops the panes jumping between the first paint, which CSS governs,
 * and the moment this takes over.
 *
 * @param viewportWidth - The current window width
 * @param side - Which pane; only the sidebar widens on a narrow window
 */
export const defaultPaneWidth = (viewportWidth: number, side: PaneSide = 'variables'): number => {
  const narrow = side === 'sidebar' && viewportWidth < NARROW_VIEWPORT;
  return bound(viewportWidth * (narrow ? NARROW_SIDEBAR_RATIO : DEFAULT_PANE_RATIO), viewportWidth);
};

/**
 * Holds a width within what the window allows
 *
 * @param width - The width being asked for, from a drag, a key press or storage
 * @param viewportWidth - The current window width
 * @returns A width between MIN_PANE_WIDTH and the maximum for this window
 */
export const clampPaneWidth = (width: number, viewportWidth: number): number =>
  // A non-finite width means something upstream produced NaN — an empty stored
  // value, or a measurement taken before layout. The default is a better answer
  // than letting that reach a style attribute.
  Number.isFinite(width) ? bound(width, viewportWidth) : defaultPaneWidth(viewportWidth);

/** Both panes at their default width, nothing hidden. */
export const defaultLayout = (viewportWidth: number): PaneLayout => ({
  sidebar: defaultPaneWidth(viewportWidth, 'sidebar'),
  variables: defaultPaneWidth(viewportWidth, 'variables'),
  sidebarCollapsed: false,
  variablesCollapsed: false,
});

/** Re-clamps both widths, for a window that has since been resized. */
export const clampLayout = (layout: PaneLayout, viewportWidth: number): PaneLayout => ({
  ...layout,
  sidebar: clampPaneWidth(layout.sidebar, viewportWidth),
  variables: clampPaneWidth(layout.variables, viewportWidth),
});

/**
 * Reads a stored layout
 *
 * Anything unreadable gives the default rather than throwing: a layout is a
 * convenience, and a corrupt one must not stop the application rendering.
 * Widths are re-clamped on the way in, because the window may be smaller than
 * it was when they were written — otherwise a pane restores wider than the
 * screen it has to fit on.
 *
 * @param raw - What localStorage held, or null when it held nothing
 * @param viewportWidth - The current window width
 */
export const parseStoredLayout = (raw: string | null, viewportWidth: number): PaneLayout => {
  const fallback = defaultLayout(viewportWidth);
  if (!raw) return fallback;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fallback;
  }

  if (typeof parsed !== 'object' || parsed === null) return fallback;
  const stored = parsed as Partial<Record<keyof PaneLayout, unknown>>;

  // Each field is taken only if it is the right type, so a partial or
  // half-written blob contributes what it can and defaults the rest.
  const width = (value: unknown, fall: number) =>
    typeof value === 'number' ? clampPaneWidth(value, viewportWidth) : fall;
  const flag = (value: unknown) => value === true;

  return {
    sidebar: width(stored.sidebar, fallback.sidebar),
    variables: width(stored.variables, fallback.variables),
    sidebarCollapsed: flag(stored.sidebarCollapsed),
    variablesCollapsed: flag(stored.variablesCollapsed),
  };
};

/**
 * The width a pane occupies on screen
 *
 * Collapsed is zero rather than a small number: both panes set overflow hidden,
 * so nothing of them shows, and the divider beside them stays put as the way
 * back.
 */
export const renderedWidth = (layout: PaneLayout, side: PaneSide): number => {
  const collapsed = side === 'sidebar' ? layout.sidebarCollapsed : layout.variablesCollapsed;
  return collapsed ? 0 : layout[side];
};
