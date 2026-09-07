'use client';

/**
 * PaneDivider
 *
 * The seam between the editor and a side pane. Drag it to resize that pane;
 * click its chevron to hide the pane, and again to bring it back.
 *
 * The divider stays where it is when its pane is hidden, so there is always
 * something to click — which is why collapsing needs no rail, no menu entry and
 * no change inside the pane itself.
 */

import React, { useCallback, useRef } from 'react';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { KEYBOARD_STEP, MIN_PANE_WIDTH, type PaneSide } from '@/domain/paneLayout';
import './PaneDivider.scss';

interface PaneDividerProps {
  /** Which pane this divider governs. */
  side: PaneSide;
  /** What the pane is called, for the labels a screen reader reads out. */
  label: string;
  /** The pane's current width, whether or not it is showing. */
  width: number;
  /**
   * The widest the pane may be, for the separator to report.
   *
   * Passed in rather than measured here: reading window.innerWidth during
   * render gave the server one number and the browser another, and React threw
   * the whole tree away over the difference.
   */
  max: number;
  collapsed: boolean;
  onResize: (width: number) => void;
  onToggle: () => void;
  /** Returns the pane to its default width; bound to a double click. */
  onReset: () => void;
}

const PaneDivider: React.FC<PaneDividerProps> = ({
  side,
  label,
  width,
  max,
  collapsed,
  onResize,
  onToggle,
  onReset,
}) => {
  // Where the drag started, and how wide the pane was then. Working in deltas
  // from these keeps the maths right wherever the divider sits, with no need to
  // know the layout's offsets.
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // Nothing to size while the pane is hidden; the chevron is the way back.
    if (collapsed || event.button !== 0) return;

    drag.current = { startX: event.clientX, startWidth: width };

    // Pointer capture keeps the moves and the release aimed at this element, so
    // there are no window listeners to leak and a fast drag cannot escape it.
    // Feature-detected because jsdom does not implement it, and an unguarded
    // call would make this component impossible to test.
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;

    const delta = event.clientX - drag.current.startX;
    // The sidebar grows as the pointer moves right; the variables pane, sitting
    // on the other side of the editor, grows as it moves left.
    onResize(drag.current.startWidth + (side === 'sidebar' ? delta : -delta));
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;

    if (typeof event.currentTarget.releasePointerCapture === 'function') {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (collapsed) return;

      // Which key widens depends on which side the pane is on, so that the key
      // always moves the divider itself in the direction pressed.
      const towards = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
      if (towards === 0) return;

      event.preventDefault();
      onResize(width + towards * KEYBOARD_STEP * (side === 'sidebar' ? 1 : -1));
    },
    [collapsed, onResize, side, width]
  );

  // The chevron points the way the pane will go: inward to hide it, back out to
  // show it again.
  const hideIcon = side === 'sidebar' ? <ChevronLeftIcon /> : <ChevronRightIcon />;
  const showIcon = side === 'sidebar' ? <ChevronRightIcon /> : <ChevronLeftIcon />;

  return (
    <div className={`pane-divider pane-divider-${side}${collapsed ? ' is-collapsed' : ''}`}>
      <div
        className="pane-divider-grip"
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize the ${label} panel`}
        aria-valuenow={collapsed ? 0 : width}
        aria-valuemin={MIN_PANE_WIDTH}
        aria-valuemax={max}
        tabIndex={collapsed ? -1 : 0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={onReset}
        onKeyDown={handleKeyDown}
      />

      <button
        type="button"
        className="pane-divider-toggle"
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-label={collapsed ? `Show ${label}` : `Hide ${label}`}
        title={collapsed ? `Show ${label}` : `Hide ${label}`}
      >
        {collapsed ? showIcon : hideIcon}
      </button>
    </div>
  );
};

export default PaneDivider;
