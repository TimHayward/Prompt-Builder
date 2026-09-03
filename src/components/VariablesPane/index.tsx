'use client';

/**
 * VariablesPane component
 *
 * Edits the working values for the active prompt. The variable definitions —
 * names, labels and choice lists — come from the prompt's sections and are only
 * read here; nothing in this pane writes to the source prompt.
 */

import React, { useEffect, useState } from 'react';
import { usePromptContext } from '../../contexts/PromptContext';
import { useWorkspaceContext } from '../../contexts/WorkspaceContext';
import { extractVariableSpecsFromSections, VariableSpec } from '../../utils/variableUtils';
import VariableField from './VariableField';
import {
  applySectionOverrides,
  countOverrides,
  type SectionOverrides,
} from '@/domain/sectionOverrides';
import './VariablesPane.scss';

const EMPTY_OVERRIDES: SectionOverrides = {};

const VariablesPane: React.FC = () => {
  const { activePromptId, prompts } = usePromptContext();
  const {
    getWorkingValues,
    setWorkingValues,
    getSectionOverrides,
    resetWorkingPrompt,
    hasWorkingValues,
    hasSectionOverrides,
  } = useWorkspaceContext();

  const [variableSpecs, setVariableSpecs] = useState<VariableSpec[]>([]);

  // Get the active prompt
  const activePrompt = prompts.find(p => p.id === activePromptId);

  // The definitions follow the text this use will resolve — the prompt's
  // sections with any temporary changes applied — so a variable introduced by a
  // change made for this use can still be filled in.
  const sectionOverrides = activePromptId ? getSectionOverrides(activePromptId) : EMPTY_OVERRIDES;

  useEffect(() => {
    if (!activePromptId || !activePrompt) return;

    setVariableSpecs(
      extractVariableSpecsFromSections(
        applySectionOverrides(activePrompt.sections, sectionOverrides)
      )
    );
  }, [activePromptId, activePrompt?.sections, sectionOverrides]);

  const workingValues = activePromptId ? getWorkingValues(activePromptId) : {};

  const handleVariableChange = (variableKey: string, value: string) => {
    if (!activePromptId) return;
    setWorkingValues(activePromptId, { [variableKey]: value });
  };

  const handleReset = () => {
    if (!activePromptId) return;

    // Text changed for this use is not visible from this pane, so losing it
    // would be a surprise. Values on their own are already visible above.
    if (hasSectionOverrides(activePromptId)) {
      const confirmed = window.confirm(
        'This clears the values you entered and the text you changed for this use. The stored prompt is not affected.'
      );
      if (!confirmed) return;
    }

    void resetWorkingPrompt(activePromptId);
  };

  if (!activePromptId) {
    return (
      <div id="variables-pane">
        <div className="empty-state">
          <p>No prompt selected</p>
        </div>
      </div>
    );
  }

  return (
    <div id="variables-pane">
      <header>
        <h2>Variables</h2>
      </header>

      {variableSpecs.length === 0 ? (
        <div className="empty-state">
          <p>No variables found in this prompt</p>
          <span className="hint">Variables are formatted as {`{{variableName}}`}</span>
          <span className="hint">Use {`{{mail/teams/calendar}}`} for a list of options</span>
        </div>
      ) : (
        <div className="variables-list">
          {variableSpecs.map(spec => (
            <div key={spec.key} className="variable-item">
              <label htmlFor={`var-${spec.key}`} className="variable-label">
                {spec.label}
                {spec.required && (
                  <span className="variable-required" aria-label="required" title="Required">
                    *
                  </span>
                )}
              </label>
              {spec.description && (
                <p id={`var-${spec.key}-help`} className="variable-help">
                  {spec.description}
                </p>
              )}
              <VariableField
                spec={spec}
                value={workingValues[spec.key] || ''}
                onChange={value => handleVariableChange(spec.key, value)}
              />
            </div>
          ))}
        </div>
      )}

      {(hasWorkingValues(activePromptId) || hasSectionOverrides(activePromptId)) && (
        <div className="variables-actions">
          <button
            className="reset-btn"
            onClick={handleReset}
            title="Clear the values entered and any text changed for this use; the stored prompt is unchanged"
          >
            Reset working prompt
          </button>
          {hasSectionOverrides(activePromptId) && (
            <p className="working-changes-note">
              This use has changed the text of{' '}
              {countOverrides(sectionOverrides) === 1
                ? '1 section'
                : `${countOverrides(sectionOverrides)} sections`}
              .
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default VariablesPane;
