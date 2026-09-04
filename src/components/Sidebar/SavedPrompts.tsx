'use client';

/**
 * SavedPrompts component
 *
 * The library of prompts, as opposed to the ones open in tabs. Closing a tab no
 * longer destroys anything, so this is where a prompt is reached for again —
 * and the only place one is deleted, which is why the delete here confirms.
 *
 * Matching is delegated to the same searchPrompts the Find-a-Prompt browser
 * uses, so a filter typed here behaves the way search does everywhere else.
 */

import React, { useMemo, useState } from 'react';
import StarIcon from '@mui/icons-material/Star';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { usePromptContext } from '@/contexts/PromptContext';
import { searchPrompts } from '@/domain/promptSearch';

const SavedPrompts: React.FC = () => {
  const { prompts, openPromptIds, activePromptId, openPrompt, deletePrompt } = usePromptContext();
  const [query, setQuery] = useState('');

  const matches = useMemo(
    () => searchPrompts(prompts, { filter: 'all', query, tag: null }),
    [prompts, query]
  );

  const confirmDelete = (event: React.MouseEvent, promptId: string, name: string) => {
    event.stopPropagation();

    const message =
      `Delete "${name}"? This removes the prompt and any working values ` +
      'saved for it. This action cannot be undone.';

    if (window.confirm(message)) {
      deletePrompt(promptId);
    }
  };

  return (
    <div className="saved-prompts">
      <header>
        <h2>Saved Prompts</h2>
      </header>

      <div className="saved-prompts-filter">
        <input
          type="text"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Filter prompts"
          aria-label="Filter saved prompts"
        />
      </div>

      <ul className="saved-prompts-list">
        {matches.map(({ prompt }) => {
          const isOpen = openPromptIds.includes(prompt.id);
          const isActive = prompt.id === activePromptId;

          return (
            <li
              key={prompt.id}
              className={`saved-prompt${isOpen ? ' is-open' : ''}${isActive ? ' is-active' : ''}`}
            >
              <button
                type="button"
                className="saved-prompt-open"
                onClick={() => openPrompt(prompt.id)}
                title={isOpen ? `Go to ${prompt.name}` : `Open ${prompt.name}`}
              >
                {/* Says which prompts are already in the tab strip, so opening
                    one is not a guess about whether it is there. */}
                <span className="saved-prompt-open-mark" aria-hidden="true">
                  {isOpen ? '●' : ''}
                </span>
                {prompt.isFavourite && (
                  <StarIcon
                    sx={{ fontSize: 14 }}
                    className="saved-prompt-star"
                    titleAccess="Favourite"
                  />
                )}
                <span className="saved-prompt-name">{prompt.name}</span>
              </button>

              <div className="saved-prompt-actions">
                <button
                  type="button"
                  className="action-btn delete-btn"
                  onClick={event => confirmDelete(event, prompt.id, prompt.name)}
                  title="Delete Prompt"
                  aria-label={`Delete ${prompt.name}`}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {matches.length === 0 && (
        <p className="saved-prompts-empty">
          {prompts.length === 0 ? 'No prompts saved yet.' : 'No prompt matches that.'}
        </p>
      )}
    </div>
  );
};

export default SavedPrompts;
