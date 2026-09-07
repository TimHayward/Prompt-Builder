'use client';

/**
 * usePaneLayout
 *
 * Owns the widths of the two side panes and whether either is hidden, and
 * remembers them per browser. The rules about what a legal layout is live in
 * domain/paneLayout; this decides when they are applied and where the answer is
 * kept.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clampLayout,
  clampPaneWidth,
  defaultLayout,
  defaultPaneWidth,
  parseStoredLayout,
  type PaneLayout,
  type PaneSide,
} from '@/domain/paneLayout';

/** Follows the promptBuilderSettings key AppContext already uses. */
const STORAGE_KEY = 'promptBuilderPaneLayout';

/** The width used before the window can be measured, on the server. */
const ASSUMED_VIEWPORT = 1440;

const viewportWidth = (): number =>
  typeof window === 'undefined' ? ASSUMED_VIEWPORT : window.innerWidth;

export type PaneLayoutControls = {
  layout: PaneLayout;
  /**
   * The window width, as state rather than a live read.
   *
   * Anything rendered from the viewport has to come through here. Measuring the
   * window during render gives one answer on the server and another in the
   * browser, and React rejects the tree that results — which is exactly what
   * happened to aria-valuemax on the divider. Held as state, the first render
   * agrees with the server and the real width arrives with the effect below.
   */
  viewport: number;
  /**
   * False until the stored layout has been read. Until then the caller should
   * publish no widths at all, so the first paint is the stylesheet's own
   * responsive defaults rather than a guess made without a window to measure.
   */
  hydrated: boolean;
  /** Sets one pane's width, clamped to what the window allows. */
  setPaneWidth: (side: PaneSide, width: number) => void;
  /** Hides a showing pane, or restores a hidden one. */
  togglePane: (side: PaneSide) => void;
  /** Returns one pane to its default width. */
  resetPane: (side: PaneSide) => void;
};

export const usePaneLayout = (): PaneLayoutControls => {
  // Deliberately the default rather than the stored layout: page.tsx is a
  // client component, but Next still renders it on the server, where there is
  // no localStorage and no window to measure. Reading either during render
  // would throw there or hydrate a different tree than the server sent, so the
  // stored layout is adopted in the effect below.
  //
  // These initial numbers are never published, because `hydrated` is false
  // until that effect runs and the caller withholds the widths until then. The
  // first paint is the stylesheet's own responsive defaults, which is why there
  // is no flash of a width guessed against an assumed window size.
  const [layout, setLayout] = useState<PaneLayout>(() => defaultLayout(ASSUMED_VIEWPORT));
  const [hydrated, setHydrated] = useState(false);
  // Starts at the assumption, so the server and the first client render agree,
  // and becomes the measured width in the effect below.
  const [viewport, setViewport] = useState(ASSUMED_VIEWPORT);

  // Written synchronously alongside state so a drag reads the width the last
  // move produced, not the one React has yet to render.
  const layoutRef = useRef(layout);

  const commit = useCallback((next: PaneLayout) => {
    layoutRef.current = next;
    setLayout(next);
  }, []);

  // Adopt what was stored, once there is a window to measure against.
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // Private browsing and blocked storage both throw on read. The default
      // layout is a complete answer, so this is not worth reporting.
    }

    commit(parseStoredLayout(stored, window.innerWidth));
    setViewport(window.innerWidth);
    setHydrated(true);
  }, [commit]);

  // Persist on change. Skipped until the stored layout has been adopted, or the
  // default would overwrite what the effect above is about to read.
  const hasLoaded = useRef(false);
  useEffect(() => {
    if (!hasLoaded.current) {
      hasLoaded.current = true;
      return;
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch {
      // Storage being unavailable costs the user nothing this session.
    }
  }, [layout]);

  // A window narrower than the layout was written for would leave a pane wider
  // than the screen, so both widths are brought back in range as it changes.
  useEffect(() => {
    const onResize = () => {
      setViewport(window.innerWidth);

      const next = clampLayout(layoutRef.current, window.innerWidth);
      if (
        next.sidebar !== layoutRef.current.sidebar ||
        next.variables !== layoutRef.current.variables
      ) {
        commit(next);
      }
    };

    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [commit]);

  const setPaneWidth = useCallback(
    (side: PaneSide, width: number) => {
      commit({ ...layoutRef.current, [side]: clampPaneWidth(width, viewportWidth()) });
    },
    [commit]
  );

  const togglePane = useCallback(
    (side: PaneSide) => {
      const key = side === 'sidebar' ? 'sidebarCollapsed' : 'variablesCollapsed';
      commit({ ...layoutRef.current, [key]: !layoutRef.current[key] });
    },
    [commit]
  );

  const resetPane = useCallback(
    (side: PaneSide) => {
      commit({ ...layoutRef.current, [side]: defaultPaneWidth(viewportWidth(), side) });
    },
    [commit]
  );

  return { layout, viewport, hydrated, setPaneWidth, togglePane, resetPane };
};
