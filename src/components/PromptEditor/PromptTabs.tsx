'use client';

/**
 * PromptTabs component
 *
 * Tab navigation across the prompts that are open. The strip is a working set,
 * not the library: closing a tab closes it, and the prompt stays in Saved
 * Prompts. Deleting one is a deliberate act, and lives there.
 */

import React from 'react';
import { Prompt } from '@/types';
import { usePromptContext } from '@/contexts/PromptContext';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import SearchIcon from '@mui/icons-material/Search';

interface PromptTabsProps {
  prompts: Prompt[];
  activePromptId: string | null;
  setActivePromptId: (id: string) => void;
  editingPromptName: string | null;
  editingPromptNameValue: string;
  setEditingPromptNameValue: (value: string) => void;
  startEditingPromptName: (id: string, name: string) => void;
  savePromptName: (id: string) => void;
  openBrowser: () => void;
}

const PromptTabs: React.FC<PromptTabsProps> = ({
  prompts,
  activePromptId,
  setActivePromptId,
  editingPromptName,
  editingPromptNameValue,
  setEditingPromptNameValue,
  startEditingPromptName,
  savePromptName,
  openBrowser,
}) => {
  const { addPrompt, closePrompt, duplicatePrompt } = usePromptContext(); // Add duplicatePrompt

  // Handle adding a new prompt (no blank starter section)
  const handleAddPrompt = async () => {
    // addPrompt opens the prompt it creates, so there is nothing to activate.
    await addPrompt(undefined, { sections: [] });
  };

  // Close a tab. The prompt is untouched; it stays under Saved Prompts.
  const handleClosePrompt = (promptId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    closePrompt(promptId);
  };

  // Handle duplicating the current prompt
  const handleDuplicatePrompt = () => {
    if (activePromptId === null) {
      // This case should ideally be prevented by disabling the button if no prompt is active,
      // but as a fallback, an alert can be shown or it can simply do nothing.
      alert('No active prompt to duplicate.');
      return;
    }
    // The duplicatePrompt function in the context now handles setting the new prompt as active.
    duplicatePrompt(activePromptId); // activePromptId is string | null, duplicatePrompt expects string
  };

  // Handle key presses in prompt name edit input
  const handleKeyDown = (e: React.KeyboardEvent, promptId: string) => {
    // Changed promptId to string
    if (e.key === 'Enter') {
      savePromptName(promptId);
    } else if (e.key === 'Escape') {
      // Cancel editing
      startEditingPromptName('', ''); // Pass empty strings or handle appropriately
    }
  };

  return (
    <div className="prompt-tabs">
      {prompts.map((prompt, index) => {
        // Added index to map
        const activeIndex = prompts.findIndex(p => p.id === activePromptId);
        let tabClassName = 'prompt-tab';

        if (activePromptId === prompt.id) {
          tabClassName += ' active';
        } else if (activeIndex !== -1 && index === activeIndex + 1) {
          tabClassName += ' next-tab';
        }

        return (
          <div
            key={prompt.id}
            className={tabClassName} // Use dynamically constructed class name
            onClick={() => setActivePromptId(prompt.id)}
          >
            {editingPromptName === prompt.id ? (
              <input
                type="text"
                value={editingPromptNameValue}
                onChange={e => setEditingPromptNameValue(e.target.value)}
                onKeyDown={e => handleKeyDown(e, prompt.id)}
                onBlur={() => savePromptName(prompt.id)}
                onClick={e => e.stopPropagation()}
                autoFocus
              />
            ) : (
              <>
                <span className="prompt-name">{prompt.name}</span>
                <div className="tab-actions">
                  <button
                    className="action-btn close-btn"
                    onClick={e => handleClosePrompt(prompt.id, e)}
                    title="Close Tab"
                    aria-label={`Close ${prompt.name}`}
                  >
                    <CloseIcon fontSize="small" />
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}

      <div className="prompt-tab-actions">
        <div
          className="add-prompt-tab"
          onClick={handleAddPrompt}
          title="Add New Prompt" // Added title
        >
          <AddIcon />
        </div>
        <div
          className="duplicate-prompt-tab" // New class for styling
          onClick={handleDuplicatePrompt}
          title="Duplicate Current Prompt" // Added title
        >
          <ContentCopyIcon />
        </div>
        <div
          className="find-prompt-tab"
          onClick={openBrowser}
          title="Find a Prompt"
          role="button"
          aria-label="Find a prompt"
        >
          <SearchIcon />
        </div>
      </div>
    </div>
  );
};

export default PromptTabs;
