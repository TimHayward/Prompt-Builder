'use client';

/**
 * RevisionHistoryModal component
 *
 * What a prompt or component said before its recent edits, what a chosen
 * revision would change back, and the button that does it.
 *
 * A revision is recorded when a save begins an editing session, so the list
 * reads as "what it looked like before each sitting" rather than one entry per
 * keystroke.
 */

import React, { useCallback, useEffect, useState } from 'react';
import HistoryIcon from '@mui/icons-material/History';
import ModalBase from './ModalBase';
import { useToast } from '@/contexts/ToastContext';
import { apiRequest, apiSend, describeApiFailure } from '@/lib/apiClient';
import { compareSections, describeChanges, type SectionChange } from '@/domain/revisionDiff';
import type { StoredSection } from '@/types';

type RevisionSummary = { id: string; name: string; createdAt: string };
type PromptRevision = RevisionSummary & { sections: StoredSection[] };
type ComponentRevision = RevisionSummary & { content: string };

interface RevisionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  kind: 'prompt' | 'component';
  entityId: string;
  /** What the item says now, to compare a revision against. */
  current: { name: string; sections?: StoredSection[]; content?: string };
  /** Called after a restore, so the caller can reload what it holds. */
  onRestored: () => void;
}

/** A timestamp as something readable in a list. */
const readableDate = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
};

const RevisionHistoryModal: React.FC<RevisionHistoryModalProps> = ({
  isOpen,
  onClose,
  kind,
  entityId,
  current,
  onRestored,
}) => {
  const { showToast } = useToast();
  const [revisions, setRevisions] = useState<RevisionSummary[]>([]);
  const [selected, setSelected] = useState<PromptRevision | ComponentRevision | null>(null);
  const [isLoading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRevisions(await apiRequest<RevisionSummary[]>(`/api/revisions/${kind}/${entityId}`));
    } catch (error) {
      console.error('Failed to read the revision history:', error);
      showToast(describeApiFailure(error, 'Could not read the history.'));
    } finally {
      setLoading(false);
    }
  }, [kind, entityId, showToast]);

  useEffect(() => {
    if (!isOpen) return;

    setSelected(null);
    void load();
  }, [isOpen, load]);

  const choose = async (revisionId: string) => {
    try {
      setSelected(
        await apiRequest<PromptRevision | ComponentRevision>(
          `/api/revisions/${kind}/${entityId}?revisionId=${revisionId}`
        )
      );
    } catch (error) {
      console.error('Failed to read a revision:', error);
      showToast(describeApiFailure(error, 'Could not read that revision.'));
    }
  };

  const handleRestore = async () => {
    if (!selected) return;

    try {
      await apiSend(`/api/revisions/${kind}/${entityId}`, 'POST', { revisionId: selected.id });
      // The restore is itself recorded, so this can be undone from the same
      // list; saying so is the difference between confident and nervous.
      showToast('Restored. The version you replaced is now in the history too.', 'success');
      onRestored();
      onClose();
    } catch (error) {
      console.error('Failed to restore a revision:', error);
      showToast(describeApiFailure(error, 'Could not restore that revision.'));
    }
  };

  const changes: SectionChange[] =
    selected && 'sections' in selected
      ? compareSections(selected.sections, current.sections ?? [])
      : [];

  const componentChanged =
    selected && 'content' in selected ? selected.content !== current.content : false;

  return (
    <ModalBase isOpen={isOpen} onClose={onClose} title="History" className="revision-history-modal">
      {isLoading && <p className="history-empty">Reading the history…</p>}

      {!isLoading && revisions.length === 0 && (
        <p className="history-empty">
          Nothing yet. A revision is kept each time you come back and edit this again.
        </p>
      )}

      {revisions.length > 0 && (
        <div className="history-body">
          <ul className="history-list">
            {revisions.map(revision => (
              <li key={revision.id}>
                <button
                  type="button"
                  className={selected?.id === revision.id ? 'active' : ''}
                  onClick={() => choose(revision.id)}
                >
                  <HistoryIcon sx={{ fontSize: 15 }} />
                  <span className="history-when">{readableDate(revision.createdAt)}</span>
                  <span className="history-name">{revision.name}</span>
                </button>
              </li>
            ))}
          </ul>

          <div className="history-detail">
            {!selected && <p className="history-empty">Choose a version to see what it said.</p>}

            {selected && 'sections' in selected && (
              <>
                <p className="history-summary">{describeChanges(changes)}</p>
                <ul className="history-changes">
                  {changes.map(change => (
                    <li key={change.sectionId} className={change.status}>
                      <span className="change-status">{change.status}</span>
                      <span className="change-name">{change.name}</span>
                      {change.status !== 'unchanged' && (
                        <pre className="change-text">{change.before ?? change.after}</pre>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {selected && 'content' in selected && (
              <>
                <p className="history-summary">
                  {componentChanged
                    ? 'This version differs from the current text.'
                    : 'Identical to the current text.'}
                </p>
                <pre className="change-text">{selected.content}</pre>
              </>
            )}

            {selected && (
              <div className="form-actions">
                <button type="button" onClick={onClose}>
                  Close
                </button>
                <button type="button" className="primary" onClick={handleRestore}>
                  Restore this version
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </ModalBase>
  );
};

export default RevisionHistoryModal;
