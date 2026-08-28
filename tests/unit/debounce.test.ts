import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debounceKeyed } from '@/utils/debounce';

describe('debounceKeyed', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('keeps a pending call for one key when another key is called', () => {
    const save = vi.fn();
    const debounced = debounceKeyed(save, 1000, (id: string) => id);

    debounced('prompt-a');
    vi.advanceTimersByTime(200);
    debounced('prompt-b');
    vi.advanceTimersByTime(1000);

    expect(save.mock.calls.map(call => call[0]).sort()).toEqual(['prompt-a', 'prompt-b']);
  });

  it('collapses repeated calls for the same key into the last one', () => {
    const save = vi.fn();
    const debounced = debounceKeyed(save, 1000, (id: string) => id);

    debounced('prompt-a');
    vi.advanceTimersByTime(500);
    debounced('prompt-a');
    vi.advanceTimersByTime(1000);

    expect(save).toHaveBeenCalledTimes(1);
  });

  it('cancels only the requested key', () => {
    const save = vi.fn();
    const debounced = debounceKeyed(save, 1000, (id: string) => id);

    debounced('prompt-a');
    debounced('prompt-b');
    debounced.cancel('prompt-a');
    vi.advanceTimersByTime(1000);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('prompt-b');
  });

  it('cancelAll drops every pending call', () => {
    const save = vi.fn();
    const debounced = debounceKeyed(save, 1000, (id: string) => id);

    debounced('prompt-a');
    debounced('prompt-b');
    debounced.cancelAll();
    vi.advanceTimersByTime(1000);

    expect(save).not.toHaveBeenCalled();
  });
});
