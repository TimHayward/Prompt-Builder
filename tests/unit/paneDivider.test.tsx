/**
 * The divider between the editor and a side pane.
 *
 * jsdom has no layout, so what is worth testing here is the arithmetic and the
 * wiring: that a drag turns pointer positions into the right widths, that the
 * direction is inverted for the pane on the far side of the editor, and that
 * hiding a pane takes the drag surface out of use rather than leaving it live
 * over nothing.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import PaneDivider from '@/components/PaneDivider';
import { KEYBOARD_STEP, MIN_PANE_WIDTH, type PaneSide } from '@/domain/paneLayout';

// Typed rather than bare vi.fn(): an untyped mock is not assignable to the
// component's own prop types, so tsc rejects the render below.
type Handlers = {
  onResize: Mock<(width: number) => void>;
  onToggle: Mock<() => void>;
  onReset: Mock<() => void>;
};

const renderDivider = (
  overrides: { side?: PaneSide; width?: number; max?: number; collapsed?: boolean } = {}
): Handlers => {
  const handlers: Handlers = {
    onResize: vi.fn<(width: number) => void>(),
    onToggle: vi.fn<() => void>(),
    onReset: vi.fn<() => void>(),
  };
  const side = overrides.side ?? 'sidebar';

  render(
    <PaneDivider
      side={side}
      label={side === 'sidebar' ? 'Library' : 'Variables'}
      width={overrides.width ?? 360}
      max={overrides.max ?? 576}
      collapsed={overrides.collapsed ?? false}
      {...handlers}
    />
  );

  return handlers;
};

const grip = () => screen.getByRole('separator');

/** A press, a move and a release, as a pointer device reports them. */
const drag = (from: number, to: number) => {
  fireEvent.pointerDown(grip(), { clientX: from, button: 0, pointerId: 1 });
  fireEvent.pointerMove(grip(), { clientX: to, pointerId: 1 });
  fireEvent.pointerUp(grip(), { clientX: to, pointerId: 1 });
};

afterEach(cleanup);

describe('dragging', () => {
  it('widens the sidebar as the pointer moves right', () => {
    const { onResize } = renderDivider({ side: 'sidebar', width: 360 });

    drag(360, 500);

    expect(onResize).toHaveBeenCalledWith(500);
  });

  it('narrows the sidebar as the pointer moves left', () => {
    const { onResize } = renderDivider({ side: 'sidebar', width: 360 });

    drag(360, 280);

    expect(onResize).toHaveBeenCalledWith(280);
  });

  it('inverts for the variables pane, which grows the other way', () => {
    const { onResize } = renderDivider({ side: 'variables', width: 360 });

    // The pointer moving left makes the pane on the right wider.
    drag(1000, 900);

    expect(onResize).toHaveBeenCalledWith(460);
  });

  it('reports every step of the drag, so the pane follows the pointer', () => {
    const { onResize } = renderDivider({ width: 300 });

    fireEvent.pointerDown(grip(), { clientX: 300, button: 0, pointerId: 1 });
    fireEvent.pointerMove(grip(), { clientX: 320, pointerId: 1 });
    fireEvent.pointerMove(grip(), { clientX: 340, pointerId: 1 });
    fireEvent.pointerUp(grip(), { clientX: 340, pointerId: 1 });

    expect(onResize.mock.calls.map(([w]) => w)).toEqual([320, 340]);
  });

  it('measures from where the drag began, not from the last move', () => {
    // Both moves are absolute against the start, so a drag out and back returns
    // to the original width rather than drifting.
    const { onResize } = renderDivider({ width: 300 });

    fireEvent.pointerDown(grip(), { clientX: 300, button: 0, pointerId: 1 });
    fireEvent.pointerMove(grip(), { clientX: 400, pointerId: 1 });
    fireEvent.pointerMove(grip(), { clientX: 300, pointerId: 1 });

    expect(onResize).toHaveBeenLastCalledWith(300);
  });

  it('ignores a move that no press started', () => {
    const { onResize } = renderDivider();

    fireEvent.pointerMove(grip(), { clientX: 900, pointerId: 1 });

    expect(onResize).not.toHaveBeenCalled();
  });

  it('stops following the pointer once released', () => {
    const { onResize } = renderDivider({ width: 300 });

    drag(300, 350);
    onResize.mockClear();
    fireEvent.pointerMove(grip(), { clientX: 800, pointerId: 1 });

    expect(onResize).not.toHaveBeenCalled();
  });

  it('ignores a press from a button other than the primary one', () => {
    const { onResize } = renderDivider();

    fireEvent.pointerDown(grip(), { clientX: 360, button: 2, pointerId: 1 });
    fireEvent.pointerMove(grip(), { clientX: 500, pointerId: 1 });

    expect(onResize).not.toHaveBeenCalled();
  });
});

describe('keyboard', () => {
  it('moves the divider left and right by a fixed step', () => {
    const { onResize } = renderDivider({ side: 'sidebar', width: 360 });

    fireEvent.keyDown(grip(), { key: 'ArrowRight' });
    expect(onResize).toHaveBeenLastCalledWith(360 + KEYBOARD_STEP);

    fireEvent.keyDown(grip(), { key: 'ArrowLeft' });
    expect(onResize).toHaveBeenLastCalledWith(360 - KEYBOARD_STEP);
  });

  it('moves the divider itself, so the keys mean the same on either side', () => {
    const { onResize } = renderDivider({ side: 'variables', width: 360 });

    // Left on the right-hand divider widens the pane beyond it.
    fireEvent.keyDown(grip(), { key: 'ArrowLeft' });

    expect(onResize).toHaveBeenLastCalledWith(360 + KEYBOARD_STEP);
  });

  it('leaves other keys alone', () => {
    const { onResize } = renderDivider();

    fireEvent.keyDown(grip(), { key: 'ArrowUp' });
    fireEvent.keyDown(grip(), { key: 'Enter' });

    expect(onResize).not.toHaveBeenCalled();
  });
});

describe('hiding and showing', () => {
  it('offers to hide a pane that is showing', () => {
    const { onToggle } = renderDivider({ side: 'sidebar', collapsed: false });

    const button = screen.getByRole('button', { name: 'Hide Library' });
    expect(button.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('offers to show a pane that is hidden', () => {
    const { onToggle } = renderDivider({ side: 'variables', collapsed: true });

    const button = screen.getByRole('button', { name: 'Show Variables' });
    expect(button.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('does not resize a pane that is not there', () => {
    const { onResize } = renderDivider({ collapsed: true });

    drag(360, 600);
    fireEvent.keyDown(grip(), { key: 'ArrowRight' });

    expect(onResize).not.toHaveBeenCalled();
  });

  it('takes a hidden divider out of the tab order', () => {
    renderDivider({ collapsed: true });

    expect(grip().getAttribute('tabindex')).toBe('-1');
  });
});

describe('the separator itself', () => {
  it('says what it does and where it can go', () => {
    renderDivider({ side: 'sidebar', width: 360 });

    const separator = grip();
    expect(separator.getAttribute('aria-label')).toBe('Resize the Library panel');
    expect(separator.getAttribute('aria-orientation')).toBe('vertical');
    expect(separator.getAttribute('aria-valuenow')).toBe('360');
    expect(separator.getAttribute('aria-valuemin')).toBe(String(MIN_PANE_WIDTH));
    expect(separator.getAttribute('tabindex')).toBe('0');
  });

  it('reports the maximum it was given, and never measures the window itself', () => {
    // This is the hydration bug in test form. Deriving the maximum from
    // window.innerWidth here rendered one number on the server and another in
    // the browser, and React discarded the tree over the difference. The value
    // now arrives as a prop, so the same props always give the same markup.
    renderDivider({ max: 658 });

    expect(grip().getAttribute('aria-valuemax')).toBe('658');
  });

  it('reports a hidden pane as zero wide', () => {
    renderDivider({ width: 360, collapsed: true });

    expect(grip().getAttribute('aria-valuenow')).toBe('0');
  });

  it('resets the pane on a double click', () => {
    const { onReset } = renderDivider();

    fireEvent.doubleClick(grip());

    expect(onReset).toHaveBeenCalledOnce();
  });
});
