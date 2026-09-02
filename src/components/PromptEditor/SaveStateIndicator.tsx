'use client';

/**
 * SaveStateIndicator component
 *
 * Says whether the user's work is stored. Reads the shared save state rather
 * than any local "I called save" flag, so it cannot claim Saved for a write
 * the server rejected.
 */

import React from 'react';
import { useSaveState, type SaveState } from '@/contexts/SaveStateContext';
import './SaveStateIndicator.scss';

const LABELS: Record<SaveState, string> = {
  saved: 'Saved',
  unsaved: 'Unsaved changes',
  saving: 'Saving…',
  failed: 'Save failed',
};

const TITLES: Record<SaveState, string> = {
  saved: 'Everything is written to the local database',
  unsaved: 'Changes are queued and will be written shortly',
  saving: 'Writing changes to the local database',
  failed: 'The last save did not complete; your changes are still in this tab',
};

const SaveStateIndicator: React.FC = () => {
  const { saveState } = useSaveState();

  return (
    <span className={`save-state save-state--${saveState}`} title={TITLES[saveState]}>
      {LABELS[saveState]}
    </span>
  );
};

export default SaveStateIndicator;
