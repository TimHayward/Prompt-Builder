'use client';

/**
 * PromptTags component
 *
 * The tags on the active prompt, with a box to add another. Typing offers the
 * tags already in the library, so a second spelling of an existing group is
 * harder to create than to reuse.
 */

import React, { useState } from 'react';
import CloseIcon from '@mui/icons-material/Close';
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined';
import { usePromptContext } from '@/contexts/PromptContext';
import { addTag, collectTags } from '@/domain/promptSearch';
import type { Prompt } from '@/types';

interface PromptTagsProps {
  prompt: Prompt;
}

const PromptTags: React.FC<PromptTagsProps> = ({ prompt }) => {
  const { prompts, setPromptTags } = usePromptContext();
  const [draft, setDraft] = useState('');

  const commit = () => {
    const tags = addTag(prompt.tags, draft);

    // addTag returns the original list when there is nothing to add; the box is
    // cleared either way, so a duplicate does not sit there looking unsaved.
    if (tags !== prompt.tags) setPromptTags(prompt.id, tags);
    setDraft('');
  };

  const remove = (tag: string) => {
    setPromptTags(
      prompt.id,
      prompt.tags.filter(existing => existing !== tag)
    );
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Escape') {
      setDraft('');
    } else if (event.key === 'Backspace' && draft === '' && prompt.tags.length > 0) {
      // The usual behaviour of a tag box: backspace on an empty field takes the
      // last tag off rather than doing nothing.
      remove(prompt.tags[prompt.tags.length - 1]);
    }
  };

  return (
    <div className="prompt-tags">
      <LocalOfferOutlinedIcon fontSize="small" className="tags-icon" />

      {prompt.tags.map(tag => (
        <span key={tag} className="tag-chip">
          {tag}
          <button
            type="button"
            onClick={() => remove(tag)}
            aria-label={`Remove tag ${tag}`}
            title={`Remove tag ${tag}`}
          >
            <CloseIcon sx={{ fontSize: 13 }} />
          </button>
        </span>
      ))}

      <input
        type="text"
        className="tag-input"
        value={draft}
        onChange={event => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commit}
        placeholder={prompt.tags.length === 0 ? 'Add a tag' : ''}
        aria-label="Add a tag"
        list="prompt-tag-suggestions"
      />

      <datalist id="prompt-tag-suggestions">
        {collectTags(prompts).map(tag => (
          <option key={tag} value={tag} />
        ))}
      </datalist>
    </div>
  );
};

export default PromptTags;
