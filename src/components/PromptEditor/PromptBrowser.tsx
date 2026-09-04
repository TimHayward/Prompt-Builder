'use client';

/**
 * PromptBrowser component
 *
 * Finds a prompt when there are more of them than fit in a row of tabs.
 * Searches everything a prompt holds — name, description, tags, section names
 * and text, variable names — and can narrow to favourites, recent use, or one
 * tag. Choosing a result makes it the active prompt.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import SearchIcon from '@mui/icons-material/Search';
import StarIcon from '@mui/icons-material/Star';
import ModalBase from '../Modal/ModalBase';
import { usePromptContext } from '@/contexts/PromptContext';
import {
  collectTags,
  searchPrompts,
  type MatchField,
  type PromptFilter,
} from '@/domain/promptSearch';

interface PromptBrowserProps {
  isOpen: boolean;
  onClose: () => void;
}

const FILTERS: { value: PromptFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'favourites', label: 'Favourites' },
  { value: 'recent', label: 'Recent' },
];

/** Reads a match's fields as a line saying why the prompt is in the results. */
const describeMatch = (fields: MatchField[]): string => {
  const wording: Record<MatchField, string> = {
    name: 'name',
    description: 'description',
    tag: 'tag',
    section: 'section text',
    variable: 'variable',
  };

  if (fields.length === 0) return '';
  return `Matched in ${fields.map(field => wording[field]).join(', ')}`;
};

const PromptBrowser: React.FC<PromptBrowserProps> = ({ isOpen, onClose }) => {
  const { prompts, openPrompt } = usePromptContext();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<PromptFilter>('all');
  const [tag, setTag] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Opening starts a fresh search, and puts the caret where typing goes.
  useEffect(() => {
    if (!isOpen) return;

    setQuery('');
    setFilter('all');
    setTag(null);
    searchInputRef.current?.focus();
  }, [isOpen]);

  const matches = useMemo(
    () => searchPrompts(prompts, { filter, query, tag }),
    [prompts, filter, query, tag]
  );

  const tags = useMemo(() => collectTags(prompts), [prompts]);

  const choose = (promptId: string) => {
    // A result may not be open, so this opens as well as activates.
    openPrompt(promptId);
    onClose();
  };

  return (
    <ModalBase isOpen={isOpen} onClose={onClose} title="Find a prompt" className="prompt-browser">
      <div className="browser-search">
        <SearchIcon fontSize="small" />
        <input
          ref={searchInputRef}
          type="text"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Search names, descriptions, tags, sections and variables"
          aria-label="Search prompts"
        />
      </div>

      <div className="browser-filters" role="group" aria-label="Filter prompts">
        {FILTERS.map(option => (
          <button
            key={option.value}
            type="button"
            className={`filter-chip${filter === option.value ? ' active' : ''}`}
            onClick={() => setFilter(option.value)}
            aria-pressed={filter === option.value}
          >
            {option.label}
          </button>
        ))}

        {tags.map(name => (
          <button
            key={name}
            type="button"
            className={`filter-chip tag${tag === name ? ' active' : ''}`}
            // A second click on the active tag clears it, so the filter can be
            // undone where it was set.
            onClick={() => setTag(tag === name ? null : name)}
            aria-pressed={tag === name}
          >
            {name}
          </button>
        ))}
      </div>

      <ul className="browser-results">
        {matches.map(({ prompt, fields }) => (
          <li key={prompt.id}>
            <button type="button" className="result" onClick={() => choose(prompt.id)}>
              <span className="result-heading">
                {prompt.isFavourite && (
                  <StarIcon sx={{ fontSize: 15 }} className="result-star" titleAccess="Favourite" />
                )}
                <span className="result-name">{prompt.name}</span>
                {prompt.tags.map(name => (
                  <span key={name} className="result-tag">
                    {name}
                  </span>
                ))}
              </span>

              {prompt.description && (
                <span className="result-description">{prompt.description}</span>
              )}
              {fields.length > 0 && <span className="result-why">{describeMatch(fields)}</span>}
            </button>
          </li>
        ))}
      </ul>

      {matches.length === 0 && (
        <p className="browser-empty">
          {prompts.length === 0 ? 'There are no prompts yet.' : 'No prompt matches that.'}
        </p>
      )}
    </ModalBase>
  );
};

export default PromptBrowser;
