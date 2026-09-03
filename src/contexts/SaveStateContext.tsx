'use client';

/**
 * SaveStateContext
 *
 * One place that knows whether anything is waiting to be written, in flight, or
 * failed. Saves happen in the background from three contexts — prompts, working
 * values, the component library — so without this the interface cannot honestly
 * tell the user whether their work is stored.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';

/** What the user is told, worst state first. */
export type SaveState = 'saved' | 'unsaved' | 'saving' | 'failed';

type SaveStateContextType = {
  saveState: SaveState;
  /** Something changed and a save is queued but not yet sent. */
  markUnsaved: (key: string) => void;
  /** A save for this key is in flight. */
  markSaving: (key: string) => void;
  /** That save succeeded. */
  markSaved: (key: string) => void;
  /** That save failed; stays failed until a later save for the key succeeds. */
  markFailed: (key: string) => void;
};

const SaveStateContext = createContext<SaveStateContextType | null>(null);

export const useSaveState = (): SaveStateContextType => {
  const context = useContext(SaveStateContext);
  if (!context) {
    throw new Error('useSaveState must be used within a SaveStateProvider');
  }
  return context;
};

/** Per-key state; the banner shows the most serious one in play. */
type KeyState = 'unsaved' | 'saving' | 'failed';

export const SaveStateProvider = ({ children }: { children: ReactNode }) => {
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const keyStates = useRef(new Map<string, KeyState>());

  const recompute = useCallback(() => {
    const states = Array.from(keyStates.current.values());

    // A failure outranks everything: it is the one the user must act on.
    if (states.includes('failed')) return setSaveState('failed');
    if (states.includes('saving')) return setSaveState('saving');
    if (states.includes('unsaved')) return setSaveState('unsaved');
    return setSaveState('saved');
  }, []);

  const setKey = useCallback(
    (key: string, state: KeyState | null) => {
      if (state === null) {
        keyStates.current.delete(key);
      } else {
        keyStates.current.set(key, state);
      }
      recompute();
    },
    [recompute]
  );

  const value = useMemo(
    () => ({
      saveState,
      markUnsaved: (key: string) => setKey(key, 'unsaved'),
      markSaving: (key: string) => setKey(key, 'saving'),
      markSaved: (key: string) => setKey(key, null),
      markFailed: (key: string) => setKey(key, 'failed'),
    }),
    [saveState, setKey]
  );

  return <SaveStateContext.Provider value={value}>{children}</SaveStateContext.Provider>;
};
