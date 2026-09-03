'use client';

/**
 * ActionBar component
 * Copy buttons and actions for prompt output
 */

import React from 'react';
import { usePromptContext } from '@/contexts/PromptContext';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { compilePrompt } from '@/utils/compilePrompt';
import { useToast } from '@/contexts/ToastContext';
import { useClipboard } from '@/hooks/useClipboard';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import AddIcon from '@mui/icons-material/Add';

interface ActionBarProps {
  activePromptId: string | null;
  systemPrompt: string;
  markdownEnabled: boolean;
}

const ActionBar: React.FC<ActionBarProps> = ({ activePromptId, systemPrompt, markdownEnabled }) => {
  const { prompts, addNewSectionForEditing, markPromptUsed } = usePromptContext();
  const { getWorkingValues } = useWorkspaceContext();
  const { copyToClipboard, status, isSupported } = useClipboard();
  const { showToast } = useToast();

  // Copy prompt to clipboard
  const copyPrompt = async () => {
    if (!activePromptId) return;

    // Get the active prompt
    const activePrompt = prompts.find(p => p.id === activePromptId);
    if (!activePrompt) return;

    // The resolved prompt is the source with this use's working values applied.
    const { text, unresolved, missingRequired } = compilePrompt({
      sections: activePrompt.sections,
      values: getWorkingValues(activePromptId),
      systemPrompt,
      markdownEnabled,
    });

    const copied = await copyToClipboard(text);

    // Only a copy that reached the clipboard counts as a use.
    if (copied) markPromptUsed(activePromptId);

    // Said after the fact rather than blocking the copy: a prompt with blanks
    // is often exactly what someone wants to paste and fill in elsewhere. A
    // variable the prompt marks required is named on its own, because the
    // prompt has said it expects one.
    if (copied && missingRequired.length > 0) {
      showToast(
        `Copied. ${missingRequired.join(', ')} ${missingRequired.length === 1 ? 'has' : 'have'} not been populated.`,
        'error'
      );
    } else if (copied && unresolved.length > 0) {
      showToast(
        `Copied. ${unresolved.length === 1 ? 'One variable was' : `${unresolved.length} variables were`} left empty: ${unresolved.join(', ')}.`,
        'success'
      );
    }
  };

  // Determine button content based on status
  const getCopyButtonContent = () => {
    switch (status) {
      case 'success':
        return (
          <>
            <CheckCircleIcon />
            <span>Copied!</span>
          </>
        );
      case 'error':
        return (
          <>
            <ErrorIcon />
            <span>Failed</span>
          </>
        );
      default:
        return (
          <>
            <ContentCopyIcon />
            <span>Copy Prompt</span>
          </>
        );
    }
  };

  // Handle adding a new section
  const handleAddNewSection = () => {
    if (activePromptId) {
      addNewSectionForEditing(activePromptId);
    }
  };

  return (
    <div className="action-bar-container">
      {' '}
      {/* Added a container div */}
      <div className="action-bar-buttons">
        {' '}
        {/* Group buttons for styling if needed */}
        <button
          className={`copy-btn ${status === 'success' ? 'success' : ''} ${status === 'error' ? 'error' : ''}`}
          onClick={copyPrompt}
          title={!isSupported ? 'Clipboard not supported' : 'Copy Prompt'}
          disabled={!isSupported || !activePromptId}
        >
          {getCopyButtonContent()}
        </button>
        <button className="new-section-btn" onClick={handleAddNewSection} title="Add New Section">
          <AddIcon />
          <span>New Section</span>
        </button>
      </div>
    </div>
  );
};

export default ActionBar;
