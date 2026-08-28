'use client';

/**
 * ActionBar component
 * Copy buttons and actions for prompt output
 */

import React from "react";
import { usePromptContext } from "@/contexts/PromptContext";
import { buildPromptText } from "@/utils/promptText";
import { useClipboard } from "@/hooks/useClipboard";
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import AddIcon from '@mui/icons-material/Add';

interface ActionBarProps {
  activePromptId: string | null; // Changed from number
  systemPrompt: string;
  markdownEnabled: boolean;
}

const ActionBar: React.FC<ActionBarProps> = ({
  activePromptId,
  systemPrompt,
  markdownEnabled
}) => {
  const { prompts, addNewSectionForEditing, getPromptVariables } = usePromptContext();
  const { copyToClipboard, status, isSupported } = useClipboard();

  // Copy prompt to clipboard
  const copyPrompt = async () => {
    if (!activePromptId) return;

    // Get the active prompt
    const activePrompt = prompts.find(p => p.id === activePromptId);
    if (!activePrompt) return;

    const promptText = buildPromptText({
      sections: activePrompt.sections,
      variables: getPromptVariables(activePromptId),
      systemPrompt,
      markdownEnabled,
    });

    await copyToClipboard(promptText);
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
    <div className="action-bar-container"> {/* Added a container div */}
      <div className="action-bar-buttons"> {/* Group buttons for styling if needed */}
        <button
          className={`copy-btn ${status === 'success' ? 'success' : ''} ${status === 'error' ? 'error' : ''}`}
          onClick={copyPrompt}
          title={!isSupported ? "Clipboard not supported" : "Copy Prompt"}
          disabled={!isSupported || !activePromptId}
        >
          {getCopyButtonContent()}
        </button>

        <button
          className="new-section-btn"
          onClick={handleAddNewSection}
          title="Add New Section"
        >
          <AddIcon />
          <span>New Section</span>
        </button>
      </div>
    </div>
  );
};

export default ActionBar;