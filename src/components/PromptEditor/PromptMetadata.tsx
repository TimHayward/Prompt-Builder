'use client';

/**
 * PromptMetadata component
 *
 * The two things a library needs once it outgrows a row of tabs: a line saying
 * what the prompt is for, and a mark on the ones reached for often. Both write
 * through the ordinary prompt update, so the existing autosave carries them.
 */

import React from 'react';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import { usePromptContext } from '@/contexts/PromptContext';
import type { Prompt } from '@/types';

interface PromptMetadataProps {
  prompt: Prompt;
}

const PromptMetadata: React.FC<PromptMetadataProps> = ({ prompt }) => {
  const { updatePromptDescription, togglePromptFavourite } = usePromptContext();

  return (
    <div className="prompt-metadata">
      <button
        type="button"
        className={`favourite-toggle${prompt.isFavourite ? ' is-favourite' : ''}`}
        onClick={() => togglePromptFavourite(prompt.id)}
        // The label says what the click will do, so a screen reader announces
        // the action rather than the current state.
        aria-label={prompt.isFavourite ? 'Remove from favourites' : 'Add to favourites'}
        aria-pressed={prompt.isFavourite}
        title={prompt.isFavourite ? 'Remove from favourites' : 'Add to favourites'}
      >
        {prompt.isFavourite ? <StarIcon fontSize="small" /> : <StarBorderIcon fontSize="small" />}
      </button>

      <input
        type="text"
        className="prompt-description-input"
        value={prompt.description}
        onChange={event => updatePromptDescription(prompt.id, event.target.value)}
        placeholder="What is this prompt for?"
        aria-label="Prompt description"
      />
    </div>
  );
};

export default PromptMetadata;
