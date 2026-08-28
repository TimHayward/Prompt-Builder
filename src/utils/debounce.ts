// src/utils/debounce.ts
export function debounce<F extends (...args: any[]) => any>(func: F, waitFor: number) {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const debounced = (...args: Parameters<F>) => {
    if (timeout !== null) {
      clearTimeout(timeout);
      timeout = null;
    }
    timeout = setTimeout(() => func(...args), waitFor);
  };

  return debounced as (...args: Parameters<F>) => ReturnType<F>;
}

export type KeyedDebounced<F extends (...args: any[]) => any> = {
  (...args: Parameters<F>): void;
  /** Drops a pending call for one key, e.g. when its record is deleted. */
  cancel: (key: string) => void;
  /** Drops every pending call, e.g. on unmount. */
  cancelAll: () => void;
};

/**
 * Debounces per key rather than globally, so a call for one key never cancels
 * a pending call for another. Editing prompt A and then prompt B inside the
 * debounce window must leave both saves scheduled.
 *
 * @param func - The function to debounce
 * @param waitFor - Debounce window in milliseconds
 * @param keyFor - Derives the debounce key from the call arguments
 */
export function debounceKeyed<F extends (...args: any[]) => any>(
  func: F,
  waitFor: number,
  keyFor: (...args: Parameters<F>) => string
): KeyedDebounced<F> {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const debounced = (...args: Parameters<F>) => {
    const key = keyFor(...args);
    const pending = timers.get(key);
    if (pending !== undefined) clearTimeout(pending);

    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        func(...args);
      }, waitFor)
    );
  };

  debounced.cancel = (key: string) => {
    const pending = timers.get(key);
    if (pending !== undefined) {
      clearTimeout(pending);
      timers.delete(key);
    }
  };

  debounced.cancelAll = () => {
    timers.forEach(timer => clearTimeout(timer));
    timers.clear();
  };

  return debounced;
}
